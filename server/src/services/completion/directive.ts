import {CompletionItem, CompletionItemKind} from 'vscode-languageserver/node';
import {InsertTextFormat, TextEdit} from 'vscode-languageserver';
import {TokenObject} from '../../compiler_tokenizer/tokenObject';
import {TextPosition} from '../../compiler_tokenizer/textLocation';
import {findNearestToken} from '../utils';
import {getGlobalSettings} from '../../core/settings';

interface DirectiveCompletionDefinition {
    readonly label: string;
    readonly insertText: string;
    readonly detail: string;
    readonly makeInsertText?: (leadingIndent: string) => string;
}

export const directiveCompletionDefinitions: DirectiveCompletionDefinition[] = [
    {
        label: 'include',
        insertText: 'include "${1:HEADER}"',
        detail: 'Include other file'
    },
    {
        label: 'define',
        insertText: 'define ${1:SYMBOL}',
        detail: 'Define a preprocessor symbol'
    },
    {
        label: 'if',
        insertText: 'if ${1:SYMBOL}\n#endif',
        detail: 'Conditional preprocessing block',
        makeInsertText: leadingIndent => `if \${1:SYMBOL}\n${leadingIndent}$0\n#endif`
    },
    {
        label: 'elif',
        insertText: 'elif ${1:SYMBOL}',
        detail: 'Conditional preprocessing branch',
        makeInsertText: leadingIndent => `elif \${1:SYMBOL}\n${leadingIndent}$0`
    },
    {
        label: 'else',
        insertText: 'else',
        detail: 'Conditional preprocessing fallback branch',
        makeInsertText: leadingIndent => `else\n${leadingIndent}$0`
    },
    {
        label: 'endif',
        insertText: 'endif',
        detail: 'End conditional preprocessing block'
    }
];

export function provideDirectiveCompletion(
    rawTokens: TokenObject[],
    definedSymbols: ReadonlySet<string>,
    caret: TextPosition
): CompletionItem[] | undefined {
    if (isCaretInIfDirectiveLine(rawTokens, caret)) {
        // e.g., SYMBOL in `#if SYMBOL`
        return [...definedSymbols].map(symbol => ({
            label: symbol,
            kind: CompletionItemKind.Constant
        }));
    }

    const directiveLine = getDirectiveLine(rawTokens, caret);
    if (directiveLine !== undefined) {
        if (!getGlobalSettings().completion.snippets) {
            return [];
        }

        // e.g., directive in `#directive`
        return directiveCompletionDefinitions.map(definition => makeDirectiveCompletionItem(definition, directiveLine));
    }

    return undefined;
}

function getDirectiveLine(
    rawTokens: TokenObject[],
    caret: TextPosition
): {lineHead: TokenObject; directiveNameToken: TokenObject | undefined} | undefined {
    const tokenInfo = findNearestToken(rawTokens, caret);
    const tokenOnLine = tokenInfo.containingToken ?? tokenInfo.precedingToken ?? tokenInfo.followingToken;
    if (tokenOnLine === undefined || tokenOnLine.location.start.line !== caret.line) {
        return undefined;
    }

    let lineHead = tokenOnLine;
    while (lineHead.prevRaw !== undefined && lineHead.prevRaw.location.start.line === caret.line) {
        lineHead = lineHead.prevRaw;
    }

    if (lineHead.text !== '#' || caret.character < lineHead.location.end.character) {
        return undefined;
    }

    const directiveNameToken = lineHead.nextRaw;
    if (
        directiveNameToken === undefined ||
        directiveNameToken.location.start.line !== caret.line ||
        caret.character <= directiveNameToken.location.end.character
    ) {
        return {lineHead, directiveNameToken};
    }

    return undefined;
}

function makeDirectiveCompletionItem(
    definition: DirectiveCompletionDefinition,
    directiveLine: {lineHead: TokenObject; directiveNameToken: TokenObject | undefined}
): CompletionItem {
    const leadingIndent = ' '.repeat(directiveLine.lineHead.location.start.character);
    const insertText = definition.makeInsertText?.(leadingIndent) ?? definition.insertText;

    return {
        label: definition.label,
        kind: CompletionItemKind.Snippet,
        detail: definition.detail,
        insertText,
        additionalTextEdits: [
            TextEdit.del({
                start: new TextPosition(directiveLine.lineHead.location.start.line, 0),
                end: directiveLine.lineHead.location.start
            })
        ],
        insertTextFormat: InsertTextFormat.Snippet
    };
}

function isCaretInIfDirectiveLine(rawTokens: TokenObject[], caret: TextPosition): boolean {
    const tokenInfo = findNearestToken(rawTokens, caret);
    const tokenOnLine = tokenInfo.containingToken ?? tokenInfo.precedingToken ?? tokenInfo.followingToken;
    if (tokenOnLine === undefined || !caret.isSameLine(tokenOnLine.location.start)) {
        return false;
    }

    let lineHead = tokenOnLine;
    while (lineHead.prevRaw !== undefined && caret.isSameLine(lineHead.prevRaw.location.start)) {
        lineHead = lineHead.prevRaw;
    }

    if (lineHead.text !== '#') {
        return false;
    }

    const directiveNameToken = lineHead.nextRaw;
    return (
        directiveNameToken !== undefined &&
        caret.isSameLine(directiveNameToken.location.start) &&
        (directiveNameToken.text === 'if' || directiveNameToken.text === 'elif')
    );
}

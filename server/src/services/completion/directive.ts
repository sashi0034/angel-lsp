import {CompletionItem, CompletionItemKind} from 'vscode-languageserver/node';
import {InsertTextFormat} from 'vscode-languageserver';
import {TokenObject} from '../../compiler_tokenizer/tokenObject';
import {TextPosition} from '../../compiler_tokenizer/textLocation';
import {findNearestToken} from '../utils';
import {getGlobalSettings} from '../../core/settings';

interface DirectiveCompletionDefinition {
    readonly label: string;
    readonly insertText: string;
    readonly detail: string;
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
        detail: 'Conditional preprocessing block'
    },
    {
        label: 'elif',
        insertText: 'elif ${1:SYMBOL}',
        detail: 'Conditional preprocessing branch'
    },
    {
        label: 'else',
        insertText: 'else',
        detail: 'Conditional preprocessing fallback branch'
    },
    {
        label: 'endif',
        insertText: 'endif',
        detail: 'End conditional preprocessing block'
    }
];

export function provideDirectiveCompletion(
    rawTokens: TokenObject[],
    caret: TextPosition
): CompletionItem[] | undefined {
    if (!isCaretInDirectiveLine(rawTokens, caret)) {
        return undefined;
    }

    if (!getGlobalSettings().completion.snippets) {
        return [];
    }

    return directiveCompletionDefinitions.map(makeDirectiveCompletionItem);
}

export function isCaretInDirectiveLine(rawTokens: TokenObject[], caret: TextPosition): boolean {
    const tokenInfo = findNearestToken(rawTokens, caret);
    const tokenOnLine = tokenInfo.containingToken ?? tokenInfo.precedingToken ?? tokenInfo.followingToken;
    if (tokenOnLine === undefined || tokenOnLine.location.start.line !== caret.line) {
        return false;
    }

    let lineHead = tokenOnLine;
    while (lineHead.prevRaw !== undefined && lineHead.prevRaw.location.start.line === caret.line) {
        lineHead = lineHead.prevRaw;
    }

    if (lineHead.text !== '#' || caret.character < lineHead.location.end.character) {
        return false;
    }

    const directiveNameToken = lineHead.nextRaw;
    return (
        directiveNameToken === undefined ||
        directiveNameToken.location.start.line !== caret.line ||
        caret.character <= directiveNameToken.location.end.character
    );
}

function makeDirectiveCompletionItem(definition: DirectiveCompletionDefinition): CompletionItem {
    return {
        label: definition.label,
        kind: CompletionItemKind.Snippet,
        detail: definition.detail,
        insertText: definition.insertText,
        insertTextFormat: InsertTextFormat.Snippet
    };
}

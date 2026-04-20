import {CompletionItem, CompletionItemKind} from 'vscode-languageserver/node';
import {InsertTextFormat} from 'vscode-languageserver';
import {Node_Script, NodeBase, NodeName} from '../compiler_parser/nodes';
import {getGlobalSettings} from '../core/settings';
import {TextPosition} from '../compiler_tokenizer/textLocation';
import {findNearestNode} from '../compiler_parser/nearestNode';

interface SnippetDefinition {
    readonly label: string;
    readonly insertText: string;
    readonly detail: string;
    readonly contexts: SnippetContext[];
}

export enum SnippetContext {
    Script = 'script',
    Class = 'class',
    Statement = 'statement'
}

export const snippetDefinitions: SnippetDefinition[] = [
    {
        label: 'if',
        insertText: 'if (${1:CONDITION}) {\n\t$0\n}',
        detail: 'If statement',
        contexts: [SnippetContext.Statement]
    },
    {
        label: 'for',
        insertText: 'for (${1:int} ${2:i} = 0; ${2} < ${3:n}; ${2}++) {\n\t$0\n}',
        detail: 'For loop',
        contexts: [SnippetContext.Statement]
    },
    {
        label: 'foreach',
        insertText: 'foreach (const auto ${2:VALUE0} : ${1:COLLECTION}) {\n\t$0\n}',
        detail: 'Foreach loop',
        contexts: [SnippetContext.Statement]
    },
    {
        label: 'while',
        insertText: 'while (${1:CONDITION}) {\n\t$0\n}',
        detail: 'While loop',
        contexts: [SnippetContext.Statement]
    },
    {
        label: 'return',
        insertText: 'return $1;',
        detail: 'Return statement',
        contexts: [SnippetContext.Statement]
    },
    {
        label: 'break',
        insertText: 'break;',
        detail: 'Break statement',
        contexts: [SnippetContext.Statement]
    },
    {
        label: 'continue',
        insertText: 'continue;',
        detail: 'Continue statement',
        contexts: [SnippetContext.Statement]
    },
    {
        label: 'dowhile',
        insertText: 'do {\n\t$0\n} while (${1:CONDITION});',
        detail: 'Do while loop',
        contexts: [SnippetContext.Statement]
    },
    {
        label: 'switch',
        insertText: 'switch (${1:EXPRESSION}) {\ncase ${2:VALUE}:\n\t$0\n\tbreak;\ndefault:\n\tbreak;\n}',
        detail: 'Switch statement',
        contexts: [SnippetContext.Statement]
    },
    {
        label: 'try',
        insertText: 'try {\n\t$0\n} catch {\n}',
        detail: 'Try catch block',
        contexts: [SnippetContext.Statement]
    },
    {
        label: 'cast',
        insertText: 'cast<${1:TYPE}>($0)',
        detail: 'Cast to a type',
        contexts: [SnippetContext.Statement]
    },
    {
        label: 'namespace',
        insertText: 'namespace ${1:IDENTIFIER} {\n\t$0\n}',
        detail: 'Namespace definition',
        contexts: [SnippetContext.Script]
    },
    {
        label: 'using',
        insertText: 'using namespace ${1:IDENTIFIER};',
        detail: 'Using namespace',
        contexts: [SnippetContext.Script, SnippetContext.Statement]
    },
    {
        label: 'interface',
        insertText: 'interface ${1:IDENTIFIER} {\n\t$0\n}',
        detail: 'Interface definition',
        contexts: [SnippetContext.Script]
    },
    {
        label: 'class',
        insertText: 'class ${1:IDENTIFIER} {\n\t$0\n}',
        detail: 'Class definition',
        contexts: [SnippetContext.Script]
    },
    {
        label: 'typedef',
        insertText: 'typedef ${1:PRIMITIVE} ${2:IDENTIFIER};',
        detail: 'Alias for a type',
        contexts: [SnippetContext.Script]
    },
    {
        label: 'funcdef',
        insertText: 'funcdef ${1:RETURN} ${2:IDENTIFIER}(${3:PARAMS});',
        detail: 'Function handle definition',
        contexts: [SnippetContext.Script, SnippetContext.Class]
    },
    {
        label: 'getter',
        insertText: '${1:TYPE} ${2:IDENTIFIER} {\n\tget const {\n\t\treturn ${3:VALUE};\n\t}\n}',
        detail: 'Virtual property getter',
        contexts: [SnippetContext.Class]
    },
    {
        label: 'gettersetter',
        insertText:
            '${1:TYPE} ${2:IDENTIFIER} {\n\tget const {\n\t\treturn ${3:VALUE};\n\t}\n\tset {\n\t\t${3:VALUE} = value;\n\t}\n}',
        detail: 'Virtual property getter and setter',
        contexts: [SnippetContext.Class]
    },
    {
        label: '#include',
        insertText: '#include "${1:HEADER}"',
        detail: 'Include other file',
        contexts: [SnippetContext.Script]
    }
];

export function provideSnippetCompletion(ast: Node_Script, caret: TextPosition): CompletionItem[] {
    if (!getGlobalSettings().completion.snippets) {
        return [];
    }

    const context = getSnippetContext(ast, caret);
    if (context === undefined) {
        return [];
    }

    return snippetDefinitions.filter(snippet => isAvailable(snippet, context)).map(makeSnippetCompletionItem);
}

function isAvailable(snippet: SnippetDefinition, context: SnippetContext): boolean {
    return snippet.contexts.includes(context);
}

function getSnippetContext(ast: Node_Script, caret: TextPosition): SnippetContext | undefined {
    caret = caret.movedBy(0, -1); // Move caret left by one character to get the correct context when caret is at the end of a token.
    const containingNodeList = findNearestNode(ast, caret)
        .map(nearestNode => nearestNode.containingNode)
        .filter((node): node is NodeBase => node !== undefined);

    let containingNode: NodeBase | undefined = containingNodeList.at(-1);
    for (let i = 0; i < containingNodeList.length; i++) {
        if (containingNodeList[i].nodeRange.start.location.positionInRange(caret)) {
            // If the caret is at the beginning of a node like ExprStat,
            // the user probably wants to enter a control statement rather than a value, so we choose the upper-level node.
            // e.g., '{ sw$C$ value; }'
            containingNode = containingNodeList[i - 1];
            break;
        }
    }

    if (!containingNode) {
        return SnippetContext.Script;
    }

    switch (containingNode.nodeName) {
        case NodeName.Namespace:
            return SnippetContext.Script;
        case NodeName.Class:
            return SnippetContext.Class;
        case NodeName.StatBlock:
            return SnippetContext.Statement;
        case NodeName.Case:
            return SnippetContext.Statement;
        default:
            return undefined;
    }
}

function makeSnippetCompletionItem(snippet: SnippetDefinition): CompletionItem {
    return {
        label: snippet.label,
        kind: CompletionItemKind.Snippet,
        detail: snippet.detail,
        insertText: snippet.insertText,
        insertTextFormat: InsertTextFormat.Snippet
        // sortText: `\u0000${snippet.label}`
    };
}

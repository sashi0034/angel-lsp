import {CompletionItemKind} from 'vscode-languageserver/node';
import {Node_Func, NodeName, Node_Script} from '../../compiler_parser/nodeObject';
import {findNearestNode} from '../../compiler_parser/nearestNode';
import {TextPosition} from '../../compiler_tokenizer/textLocation';
import type {CompletionItemWrapper} from '../completion';

export const functionAttributeCompletionKeywords = [
    'const',
    'override',
    'final',
    'explicit',
    'property',
    'delete',
    'nodiscard'
];

export function provideFunctionSectionCompletion(
    ast: Node_Script,
    caret: TextPosition
): CompletionItemWrapper[] | undefined {
    const func = findContainingFunction(ast, caret);
    if (func === undefined || func.listPattern !== undefined) {
        return undefined;
    }

    const paramListEnd = func.paramList.nodeRange.end;
    const suffixEnd = func.statBlock.nodeRange.start;
    if (caret.isLessThan(paramListEnd.location.end) || suffixEnd.location.start.isLessThan(caret)) {
        return undefined;
    }

    // -----------------------------------------------
    // Now, caret is between the parameter list and the function body, which is where function suffix keywords can be placed.
    // e.g., `void function() $C$ {`

    if (func.postfixConstToken !== undefined && caret.isLessThan(func.postfixConstToken.location.end)) {
        // e.g., `void function() $C$ const {`
        return [];
    }

    const usedKeywords = collectUsedFunctionSuffixKeywords(func, caret);
    return functionAttributeCompletionKeywords
        .filter(keyword => !usedKeywords.has(keyword))
        .map(keyword => ({
            item: {
                label: keyword,
                kind: CompletionItemKind.Keyword
            }
        }));
}

function findContainingFunction(ast: Node_Script, caret: TextPosition): Node_Func | undefined {
    return findNearestNode(ast, caret)
        .map(node => node.containingNode)
        .find((node): node is Node_Func => node?.nodeName === NodeName.Func);
}

function collectUsedFunctionSuffixKeywords(func: Node_Func, caret: TextPosition): Set<string> {
    const usedKeywords = new Set<string>();

    if (func.postfixConstToken !== undefined && !caret.isLessThan(func.postfixConstToken.location.end)) {
        usedKeywords.add('const');
    }

    for (const attrToken of func.funcAttrTokens ?? []) {
        if (!caret.isLessThan(attrToken.location.end)) {
            usedKeywords.add(attrToken.text);
        }
    }

    return usedKeywords;
}

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
    const nearestFunc = findNearestFunction(ast, caret);
    if (nearestFunc === undefined || nearestFunc.node.listPattern !== undefined) {
        return undefined;
    }

    const funcNode = nearestFunc.node;

    if (nearestFunc.tag === 'containing') {
        const paramListEnd = funcNode.paramList.nodeRange.end;
        const suffixEnd = funcNode.statBlock?.nodeRange.start ?? funcNode.nodeRange.end;
        if (caret.isLessThan(paramListEnd.location.end) || suffixEnd.location.start.isLessThan(caret)) {
            return undefined;
        }
    }

    // -----------------------------------------------
    // Now, caret is between the parameter list and the function body, which is where function suffix keywords can be placed.
    // e.g., `void function() $C$ {`

    if (funcNode.postfixConstToken !== undefined && caret.isLessThan(funcNode.postfixConstToken.location.end)) {
        // e.g., `void function() $C$ const {`
        return [];
    }

    const usedKeywords = collectUsedFunctionSuffixKeywords(funcNode, caret);
    return functionAttributeCompletionKeywords
        .filter(keyword => !usedKeywords.has(keyword))
        .map(keyword => ({
            item: {
                label: keyword,
                kind: CompletionItemKind.Keyword
            }
        }));
}

function findNearestFunction(
    ast: Node_Script,
    caret: TextPosition
):
    | {
          tag: 'containing' | 'preceding';
          node: Node_Func;
      }
    | undefined {
    const nearestNode = findNearestNode(ast, caret);

    for (let i = nearestNode.length - 1; i >= 0; --i) {
        const containingNode = nearestNode[i].containingNode;
        if (containingNode?.nodeName === NodeName.Func) {
            return {
                tag: 'containing',
                node: containingNode
            };
        }

        const precedingNode = nearestNode[i].precedingNode;
        if (
            containingNode === undefined &&
            precedingNode?.nodeName === NodeName.Func &&
            precedingNode?.statBlock === undefined
        ) {
            // e.g., `void f() ov$C$` (The parser fails to parse this statement block in this function.)
            return {
                tag: 'preceding',
                node: precedingNode
            };
        }
    }

    return undefined;
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

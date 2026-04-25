import {Node_Script, NodeName, NodeObject} from '../../compiler_parser/nodeObject';
import {findNearestNode} from '../../compiler_parser/nearestNode';
import {TextPosition} from '../../compiler_tokenizer/textLocation';
import {TokenObject} from '../../compiler_tokenizer/tokenObject';
import {findNearestToken} from '../utils';

export function isCaretInDeclarationPart(
    preprocessedTokens: TokenObject[],
    ast: Node_Script,
    caret: TextPosition
): boolean {
    const nearestNodeList = findNearestNode(ast, caret);
    const nearestNode = nearestNodeList.at(-1);
    if (nearestNode?.containingNode !== undefined) {
        return detectDeclarationPartByNode(nearestNode.containingNode, caret);
    }

    if (nearestNode?.precedingNode !== undefined) {
        return detectDeclarationPartByNode(nearestNode.precedingNode, caret);
    }

    // Built-in types may not produce parser nodes, so fall back to token-based detection.
    // e.g., `auto@ $C0$`
    return detectDeclarationPartByBuiltinTypeToken(preprocessedTokens, caret);
}

function detectDeclarationPartByBuiltinTypeToken(preprocessedTokens: TokenObject[], caret: TextPosition): boolean {
    const precedingToken = findNearestToken(preprocessedTokens, caret).precedingToken;
    const candidateToken = rewindReferenceModifier(precedingToken);
    return (
        candidateToken !== undefined &&
        candidateToken.isReservedToken() &&
        (candidateToken.property.isPrimitiveType || candidateToken.text === 'auto')
    );
}

function detectDeclarationPartByNode(node: NodeObject, caret: TextPosition): boolean {
    switch (node.nodeName) {
        // case NodeName.Class: {
        //     const classToken = searchKeyword((node as Node_Class).nodeRange, 'class');
        //     if (classToken === undefined) {
        //         break;
        //     }

        //     return isCaretInRange(classToken.location.end, classToken.next?.location.end, caret);
        // }
        case NodeName.Parameter: {
            const nodeEnd = node.nodeRange.end;
            if (nodeEnd === undefined) {
                break;
            }

            const nodeNext = skipTypeModifiers(nodeEnd.next);

            return isCaretInRange(nodeEnd.location.end.movedBy(0, 1), nodeNext?.location.end, caret);
        }
        case NodeName.Type: {
            const nodeEnd = node.nodeRange.end;
            if (nodeEnd === undefined) {
                break;
            }

            const nodeNext = skipTypeModifiers(nodeEnd.next);

            return isCaretInRange(nodeEnd.location.end.movedBy(0, 1), nodeNext?.location.end, caret);
        }
        case NodeName.ExprStat: {
            const nodeEnd = node.nodeRange.end;
            if (nodeEnd === undefined) {
                break;
            }

            const nodeNext = nodeEnd.next;

            return isCaretInRange(nodeEnd.location.end.movedBy(0, 1), nodeNext?.location.end, caret);
        }

        default:
            break;
    }

    return false;
}

// function searchKeyword(range: TokenRange, keyword: string) {
//     let cursor: TokenObject | undefined = range.start;
//     while (cursor !== undefined) {
//         if (cursor.text === keyword) {
//             return cursor;
//         }
//
//         cursor = cursor.next;
//     }
//
//     return undefined;
// }

function isCaretInRange(start: TextPosition, end: TextPosition | undefined, caret: TextPosition): boolean {
    if (end === undefined) {
        return false;
    }

    if (caret.line !== start.line) {
        return false;
    }

    return !caret.isLessThan(start) && !end.isLessThan(caret);
}

// function skipReservedTokens(token: TokenObject | undefined): TokenObject | undefined {
//     while (token?.isReservedToken()) {
//         token = token.next;
//     }

//     return token;
// }

function rewindReferenceModifier(token: TokenObject | undefined): TokenObject | undefined {
    if (token?.text === '@') {
        token = token.prev;
    }

    if (token?.text === 'const') {
        token = token.prev;
    }

    return token;
}

function skipTypeModifiers(token: TokenObject | undefined): TokenObject | undefined {
    const typeModifiers = ['&', 'in', 'out', 'inout'];
    while (token !== undefined && typeModifiers.includes(token.text)) {
        token = token.next;
    }

    return token;
}

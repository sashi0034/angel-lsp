import {ComplementKind, ComplementScopeRegion} from "../compiler_analyzer/complementHint";
import {Position} from "vscode-languageserver";
import {SymbolScope} from "../compiler_analyzer/symbolScope";
import {TextPosition} from "../compiler_tokenizer/textLocation";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {SymbolObject} from "../compiler_analyzer/symbolObject";

export function takeNarrowestHint(lhs: ComplementScopeRegion, rhs: ComplementScopeRegion): ComplementScopeRegion {
    const lhsDiff = lhs.boundingLocation.getDifference();
    const rhsDiff = rhs.boundingLocation.getDifference();

    if (lhsDiff.line < rhsDiff.line) return lhs;
    if (lhsDiff.line > rhsDiff.line) return rhs;
    return lhsDiff.character < rhsDiff.character ? lhs : rhs;
}

/**
 * Find the scope that includes the specified position.
 */
export function findScopeContainingPosition(scope: SymbolScope, caret: Position, path: string): SymbolScope {
    const globalScope = scope.getGlobalScope();

    let cursor: ComplementScopeRegion | undefined = undefined;
    for (const hint of globalScope.completionHints) {
        if (hint.complement !== ComplementKind.ScopeRegion) continue;

        const location = hint.boundingLocation;
        if (location.path !== path) continue;

        if (location.positionInRange(caret)) {
            cursor = cursor === undefined
                ? hint
                : takeNarrowestHint(cursor, hint);
        }
    }

    return cursor?.targetScope ?? scope;
}

/**
 * Finds the token in the given list that contains the specified caret position.
 * This function utilizes a binary search approach for efficient lookup.
 */
export function findTokenContainingPosition(tokenList: TokenObject[], caret: TextPosition) {
    return findTokenContainingPositionInternal(tokenList, caret, 0, tokenList.length);
}

function findTokenContainingPositionInternal(
    tokenList: TokenObject[],
    caret: TextPosition,
    start: number,
    end: number
): { token: TokenObject, index: number } | undefined {
    const length = end - start;
    if (length <= 8) { // FIXME: Measure the benchmark of the magic number
        // Linear search for small lists
        for (let index = start; index < end; index++) {
            const token = tokenList[index];
            if (token.location.positionInRange(caret)) {
                return {token, index};
            }
        }

        return undefined;
    }

    const middleIndex = start + Math.floor(length / 2);
    const middle = tokenList[middleIndex];
    if (middle.location.positionInRange(caret)) {
        return {token: middle, index: middleIndex};
    } else if (middle.location.start.isLessThan(caret)) {
        // tokenList[0] --> ... -> middle --> ... -> caret --> ... --> tokenList[^1]
        // If the caret is positioned after the middle token, search in the right half
        return findTokenContainingPositionInternal(tokenList, caret, middleIndex + 1, end);
    } else {
        // tokenList[0] --> ... -> caret --> ... -> middle --> ... --> tokenList[^1]
        // If the caret is positioned before the middle token, search in the left half
        return findTokenContainingPositionInternal(tokenList, caret, start, middleIndex);
    }
}

export function getDocumentCommentOfSymbol(symbol: SymbolObject) {
    if (symbol.isType()) {
        if (symbol.linkedNode === undefined) return 'unknown type';
        return getDocumentCommentOfToken(symbol.linkedNode.nodeRange.start); // FIXME: mixin class is OK?
    } else if (symbol.isVariable()) {
        const aboveToken = getAboveLineRawToken(symbol.identifierToken);
        return aboveToken === undefined ? '' : getDocumentCommentOfToken(aboveToken);
    } else { // Function
        if (symbol.linkedNode === undefined) return 'unknown function';
        return getDocumentCommentOfToken(symbol.linkedNode.nodeRange.start);
    }
}

function getAboveLineRawToken(token: TokenObject): TokenObject | undefined {
    let currentToken: TokenObject | undefined = token;
    const line = token.location.start.line;
    while (currentToken !== undefined) {
        if (currentToken.location.end.line !== line) return currentToken;
        currentToken = currentToken.prevRaw;
    }

    return undefined;
}

export function getDocumentCommentOfToken(token: TokenObject) {
    let documentComment = "";

    let currentToken: TokenObject | undefined = token;
    if (currentToken.isCommentToken() === false) {
        // If the current token is not a comment, iterate from the previous comment token
        currentToken = token.prevRaw;
    }

    const maxDocumentLines = 16;
    for (let i = 0; i < maxDocumentLines; i++) {
        if (currentToken === undefined) break;
        if (currentToken.isCommentToken() === false) break;

        // Extract the comment text
        let commentText = currentToken.text;
        if (commentText.startsWith('//')) {
            commentText = commentText.replace(/^\/+/, ''); // Remove the '/' characters
        } else if (commentText.startsWith('/*')) {
            commentText = commentText.substring(2, commentText.length - 2);
        }

        // CHECK: Is the following expression optimized by V8?
        documentComment = documentComment.length > 0
            ? commentText + '\n\n' + documentComment
            : commentText;

        if (currentToken.prevRaw === undefined) {
            break;
        } else if (currentToken.location.start.line - currentToken.prevRaw.location.end.line >= 2) {
            // Terminate the loop if the comment is separated by more than one blank line
            break;
        }

        currentToken = currentToken.prevRaw;
    }

    return documentComment;
}

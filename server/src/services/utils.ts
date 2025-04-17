import {TextPosition} from "../compiler_tokenizer/textLocation";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {SymbolObject} from "../compiler_analyzer/symbolObject";

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

// -----------------------------------------------

export function getDocumentCommentOfSymbol(symbol: SymbolObject) {
    if (symbol.isType()) {
        if (symbol.linkedNode === undefined) return 'unknown type';
        return getDocumentCommentOfToken(symbol.linkedNode.nodeRange.start); // FIXME: mixin class is OK?
    } else if (symbol.isVariable()) {
        return getDocumentCommentOfToken(symbol.identifierToken);
    } else { // Function
        if (symbol.linkedNode === undefined) return 'unknown function';
        return getDocumentCommentOfToken(symbol.linkedNode.nodeRange.start);
    }
}

function getNearCommentToken(token: TokenObject): TokenObject | undefined {
    const aboveLineToken = getAboveLineRawToken(token);

    if (aboveLineToken !== undefined) {
        if (aboveLineToken.location.end.line - token.location.start.line <= 1) {
            // l1: ... --> 'aboveLineToken' -->
            // l2: ... --> 'token'

            const prevAboveLineToken = aboveLineToken?.prevRaw;
            if (prevAboveLineToken?.isCommentToken() ||
                prevAboveLineToken?.location.end.line !== aboveLineToken.location.start.line
            ) {
                // l1: 'prevAboveLineToken: comment' --> 'aboveLineToken' -->
                // l2: ... --> 'token'
                // or
                // l0: 'prevAboveLineToken' --> ... -->
                // l1: 'aboveLineToken' -->
                // l2: ... --> 'token'

                return aboveLineToken;
            }
        }
    }

    let behindToken: TokenObject | undefined = token.nextRaw;
    while (behindToken !== undefined) {
        if (behindToken.location.start.line !== token.location.end.line) {
            break;
        } else if (behindToken?.isCommentToken()) {
            // ... -> 'token' --> ... --> 'behindToken: comment'
            return behindToken;
        } else if (behindToken.nextRaw === undefined) {
            break;
        }

        behindToken = behindToken.nextRaw;
    }

    return undefined;
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

    let currentToken: TokenObject | undefined = getNearCommentToken(token);

    const maxDocumentLines = 16;
    for (let i = 0; i < maxDocumentLines; i++) {
        if (currentToken === undefined) break;
        if (currentToken.isCommentToken() === false) break;

        // Extract the comment text
        let commentText = currentToken.text;
        if (commentText.startsWith('//')) {
            commentText = commentText.replace(/^\/+/, ''); // Remove the '/' characters
        } else if (commentText.startsWith('/*')) {
            commentText = commentText.substring(2, commentText.length - 2)
                .split("\n")
                .map(line => line.replace(/^\s*\*? ?/, ""))
                .join("\n\n")
                .trim();
        }

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

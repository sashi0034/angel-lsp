import {TextPosition} from '../compiler_tokenizer/textLocation';
import {TokenObject} from '../compiler_tokenizer/tokenObject';
import {SymbolObject} from '../compiler_analyzer/symbolObject';

/**
 * Finds the token in the given list that contains the specified caret position.
 * This function utilizes a binary search approach for efficient lookup.
 */
export function findTokenContainingPosition(tokenList: TokenObject[], caret: TextPosition) {
    let start = 0;
    let end = tokenList.length - 1;

    while (start <= end) {
        const middleIndex = start + Math.floor((end - start) / 2);
        const middle = tokenList[middleIndex];

        if (middle.location.positionInRange(caret)) {
            return {token: middle, index: middleIndex};
        }

        if (middle.location.end.isLessThan(caret)) {
            start = middleIndex + 1;
        } else {
            end = middleIndex - 1;
        }
    }

    return undefined;
}

/**
 * Finds the token nearest to the specified caret position.
 * Returns the token containing the caret if it exists, along with the nearest
 * tokens before and after the caret.
 */
export interface NearestToken {
    precedingToken: TokenObject | undefined;
    containingToken: TokenObject | undefined;
    followingToken: TokenObject | undefined;
}

export function findNearestToken(tokenList: TokenObject[], caret: TextPosition): NearestToken {
    if (tokenList.length === 0) {
        return {
            precedingToken: undefined,
            containingToken: undefined,
            followingToken: undefined
        };
    }

    let start = 0;
    let end = tokenList.length - 1;

    while (start <= end) {
        const middleIndex = start + Math.floor((end - start) / 2);
        const middle = tokenList[middleIndex];

        if (middle.location.positionInRange(caret)) {
            return {
                precedingToken: tokenList[middleIndex - 1],
                containingToken: middle,
                followingToken: tokenList[middleIndex + 1]
            };
        }

        if (middle.location.end.isLessThan(caret)) {
            start = middleIndex + 1;
        } else {
            end = middleIndex - 1;
        }
    }

    if (end < 0) {
        return {
            precedingToken: undefined,
            containingToken: undefined,
            followingToken: tokenList[0]
        };
    }

    if (start >= tokenList.length) {
        return {
            precedingToken: tokenList[tokenList.length - 1],
            containingToken: undefined,
            followingToken: undefined
        };
    }

    return {
        precedingToken: tokenList[end],
        containingToken: undefined,
        followingToken: tokenList[start]
    };
}

// -----------------------------------------------

export function getDocumentCommentOfSymbol(symbol: SymbolObject) {
    if (symbol.isType()) {
        if (symbol.linkedNode === undefined) {
            return 'unknown type';
        }

        return getDocumentCommentOfToken(symbol.linkedNode.nodeRange.start); // FIXME: mixin class is OK?
    } else if (symbol.isVariable()) {
        return getDocumentCommentOfToken(symbol.identifierToken);
    } else {
        // Function
        if (symbol.linkedNode === undefined) {
            return 'unknown function';
        }

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
            if (
                prevAboveLineToken?.isCommentToken() ||
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
        if (currentToken.location.end.line !== line) {
            return currentToken;
        }

        currentToken = currentToken.prevRaw;
    }

    return undefined;
}

export function getDocumentCommentOfToken(token: TokenObject) {
    let documentComment = '';

    let currentToken: TokenObject | undefined = getNearCommentToken(token);

    const maxDocumentLines = 16;
    for (let i = 0; i < maxDocumentLines; i++) {
        if (currentToken === undefined) {
            break;
        }

        if (currentToken.isCommentToken() === false) {
            break;
        }

        // Extract the comment text
        let commentText = currentToken.text;
        if (commentText.startsWith('//')) {
            commentText = commentText.replace(/^\/+/, ''); // Remove the '/' characters
        } else if (commentText.startsWith('/*')) {
            commentText = commentText
                .substring(2, commentText.length - 2)
                .split('\n')
                .map(line => line.replace(/^\s*\*? ?/, ''))
                .join('\n\n')
                .trim();
        }

        documentComment = documentComment.length > 0 ? commentText + '\n\n' + documentComment : commentText;

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

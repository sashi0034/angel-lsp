import {ComplementKind, ComplementScopeRegion} from "../compiler_analyzer/complementHint";
import {Position} from "vscode-languageserver";
import {SymbolScope} from "../compiler_analyzer/symbolScope";
import {TextPosition} from "../compiler_tokenizer/textLocation";
import {TokenObject} from "../compiler_tokenizer/tokenObject";

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


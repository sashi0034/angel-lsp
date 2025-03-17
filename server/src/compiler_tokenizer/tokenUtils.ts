import {
    TokenObject
} from "./tokenObject";
import {TextLocation} from "./textLocation";

/**
 * Determines if a given sequence of tokens matches the specified string sequence.
 * For example, this can be used to check if tokens like ['>', '>'] form the string '>>'.
 *
 * @param headToken The starting token to check.
 * @param expectedTexts The expected string sequence.
 * @returns `true` if the tokens match the expected sequence, otherwise `false`.
 */
export function areTokensJoinedBy(headToken: TokenObject, expectedTexts: string[]): boolean {
    if (headToken.text !== expectedTexts[0]) return false;

    let cursor = headToken.next;
    let tailColumn = headToken.location.end.character;
    for (let i = 1; i < expectedTexts.length; i++) {
        if (cursor === undefined || cursor.text !== expectedTexts[i]) return false;
        if (cursor.location.start.line !== headToken.location.start.line) return false;
        if (cursor.location.start.character !== tailColumn) return false;

        tailColumn = cursor.location.end.character;
        cursor = cursor.next;
    }

    return true;
}

/**
 * Extends the location range of a given token by a specified number of tokens in both backward and forward directions.
 * @param token The token whose location range needs to be extended.
 * @param backward The number of characters to extend backward.
 * @param forward The number of characters to extend forward.
 */
export function extendTokenLocation(token: TokenObject, backward: number, forward: number): TextLocation {
    let start = token.coveredRange?.start ?? token;
    let end = token.coveredRange?.end ?? token;
    for (let i = 0; i < backward; i++) {
        start = start.prev ?? start;
    }

    for (let i = 0; i < forward; i++) {
        end = end.next ?? end;
    }

    const startPosition = start.location.end;
    const endPosition = end.location.start;

    return new TextLocation(token.location.path, startPosition, endPosition);
}

import {
    TokenObject
} from "./tokenObject";

/**
 * Determines if a given sequence of tokens matches the specified string sequence.
 * For example, this can be used to check if tokens like ['>', '>'] form the string '>>'.
 *
 * @param headToken The starting token to check.
 * @param expectedTexts The expected string sequence.
 * @returns `true` if the tokens match the target sequence, otherwise `false`.
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

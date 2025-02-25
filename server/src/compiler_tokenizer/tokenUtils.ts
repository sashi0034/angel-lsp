import {
    TokenBase,
    TokenObject
} from "./tokenObject";

/**
 * Determines if two tokens are identical.
 * This function does not check if they are the same instance;
 * instead, it compares the members of each token object individually.
 */
export function isSameToken(l: TokenBase, r: TokenBase): boolean {
    return l.text === r.text
        && l.location.path === r.location.path
        && l.location.start.line === r.location.start.line
        && l.location.start.character === r.location.start.character
        && l.location.end.line === r.location.end.line
        && l.location.end.character === r.location.end.character;
}

/**
 * Determines if a given sequence of tokens matches the specified string sequence.
 * For example, this can be used to check if tokens like ['>', '>'] form the string '>>'.
 *
 * @param head The starting token to check.
 * @param targets The expected string sequence.
 * @returns `true` if the tokens match the target sequence, otherwise `false`.
 */
export function isTokensLinkedBy(head: TokenObject, targets: string[]): boolean {
    if (head.text !== targets[0]) return false;

    let cursor = head.next;
    let column = head.location.end.character;
    for (let i = 1; i < targets.length; i++) {
        if (cursor === undefined || cursor.text !== targets[i]) return false;
        if (cursor.location.start.line !== head.location.start.line) return false;
        if (cursor.location.start.character !== column) return false;
        column = cursor.location.end.character;
        cursor = cursor.next;
    }

    return true;
}

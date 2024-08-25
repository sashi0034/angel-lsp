import {
    createEmptyLocation,
    createVirtualHighlight,
    NumberLiterals, TokenBase,
    TokenizedToken,
    TokenKind
} from "./tokens";
import {findAllReservedWordProperty} from "./tokenReserves";
import {HighlightToken} from "../code/highlight";

export type ParsingToken = TokenizedToken & {
    index: number;
    next: ParsingToken | undefined;
}

export function isTokensLinkedBy(head: ParsingToken, targets: string[]): boolean {
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

export function createVirtualToken(
    kind: TokenKind,
    text: string
): ParsingToken {
    const result = {
        text: text,
        location: createEmptyLocation(),
        highlight: createVirtualHighlight(),
        index: -1,
        next: undefined,
    };

    if (kind === TokenKind.Reserved) return {
        ...result,
        kind: TokenKind.Reserved,
        property: findAllReservedWordProperty(text)
    };
    else if (kind === TokenKind.Number) return {
        ...result,
        kind: TokenKind.Number,
        numeric: NumberLiterals.Integer
    };

    return {
        ...result,
        kind: kind
    };
}

export function isVirtualToken(token: TokenBase): boolean {
    return token.highlight.token === HighlightToken.Invalid;
}

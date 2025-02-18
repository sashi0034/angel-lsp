import {Position, Range} from "vscode-languageserver";
import {createEmptyLocation, createVirtualHighlight, NumberLiterals, TokenBase, TokenKind} from "./tokens";
import {findAllReservedWordProperty} from "./tokenReservedWords";
import {HighlightToken} from "../code/highlight";
import {ParserToken} from "../compiler_parser/parserToken";

export function isPositionInRange(position: Position, range: Range): boolean {
    const startLine = range.start.line;
    const endLine = range.end.line;
    const posLine = position.line;

    const startCharacter = range.start.character;
    const endCharacter = range.end.character;
    const posCharacter = position.character;

    if (startLine === posLine && posLine < endLine)
        return startCharacter <= posCharacter;
    else if (startLine < posLine && posLine < endLine)
        return true;
    else if (startLine < posLine && posLine === endLine)
        return posCharacter <= endCharacter;
    else if (startLine === posLine && posLine === endLine)
        return startCharacter <= posCharacter && posCharacter <= endCharacter;

    return false;
}

export function isSameLine(l: Position, r: Position): boolean {
    return l.line === r.line;
}

export function isSamePosition(l: Position, r: Position): boolean {
    return l.line === r.line && l.character === r.character;
}

/**
 * Determines if the left position is ahead of the right position.
 */
export function isAheadPosition(l: Position, r: Position): boolean {
    return l.line < r.line || (l.line === r.line && l.character < r.character);
}

/**
 * Determines if the left position is behind the right position.
 */
export function isBehindPosition(l: Position, r: Position): boolean {
    return l.line > r.line || (l.line === r.line && l.character > r.character);
}

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
export function isTokensLinkedBy(head: ParserToken, targets: string[]): boolean {
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
): ParserToken {
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
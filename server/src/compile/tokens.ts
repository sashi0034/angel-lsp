import {HighlightModifier, HighlightToken} from "../code/highlight";
import {Position, Range} from "vscode-languageserver";

export enum TokenKind {
    Reserved = 'Reserved',
    Identifier = 'Identifier',
    Number = 'Number',
    String = 'String',
    Comment = 'Comment',
}

export interface LocationInfo extends Range {
    path: string;
}

export function createEmptyLocation(): LocationInfo {
    return {
        path: '',
        start: {line: 0, character: 0},
        end: {line: 0, character: 0},
    };
}

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

export interface HighlightInfo {
    token: HighlightToken;
    modifier: HighlightModifier;
}

export function createVirtualHighlight(): HighlightInfo {
    return {
        token: HighlightToken.Invalid,
        modifier: HighlightModifier.Nothing,
    };
}

export interface TokenBase {
    kind: TokenKind;
    text: string;
    location: LocationInfo;
    highlight: HighlightInfo;
}

// インスタンスに依らないトークンの一致判定
export function isSameToken(l: TokenBase, r: TokenBase): boolean {
    return l.text === r.text
        && l.location.path === r.location.path
        && l.location.start.line === r.location.start.line
        && l.location.start.character === r.location.start.character
        && l.location.end.line === r.location.end.line
        && l.location.end.character === r.location.end.character;
}

export function isVirtualToken(token: TokenBase): boolean {
    return token.highlight.token === HighlightToken.Invalid;
}

export interface TokenReserved extends TokenBase {
    kind: TokenKind.Reserved;
    property: ReservedWordProperty;
}

export interface ReservedWordProperty {
    isMark: boolean;
    isExprPreOp: boolean;
    isExprOp: boolean;
    isBitOp: boolean;
    isMathOp: boolean;
    isCompOp: boolean;
    isLogicOp: boolean;
    isAssignOp: boolean;
    isNumber: boolean;
    isPrimeType: boolean;
}

export interface TokenIdentifier extends TokenBase {
    kind: TokenKind.Identifier;
}

export enum NumberLiterals {
    Integer = 'Integer',
    Float = 'Float',
    Double = 'Double',
}

export interface TokenNumber extends TokenBase {
    kind: TokenKind.Number;
    numeric: NumberLiterals;
}

export interface TokenString extends TokenBase {
    kind: TokenKind.String;
}

export interface TokenComment extends TokenBase {
    kind: TokenKind.Comment;
}

export type TokenizingToken = TokenReserved | TokenIdentifier | TokenNumber | TokenString | TokenComment;

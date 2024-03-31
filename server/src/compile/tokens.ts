import {HighlightModifierKind, HighlightTokenKind} from "../code/highlight";
import {uinteger} from "vscode-languageserver-types/lib/esm/main";

export interface Position {
    line: uinteger;
    character: uinteger;
}

export interface Range {
    start: Position;
    end: Position;
}

export enum TokenKind {
    Reserved = 'Reserved',
    Identifier = 'Identifier',
    Number = 'Number',
    String = 'String',
    Comment = 'Comment',
}

export type LocationInfo = { path: string } & Range;

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

export interface HighlightInfo {
    token: HighlightTokenKind;
    modifier: HighlightModifierKind;
}

export interface TokenBase {
    kind: TokenKind;
    text: string;
    location: LocationInfo;
    highlight: HighlightInfo;
}

export interface TokenReserved extends TokenBase {
    kind: TokenKind.Reserved;
    property: ReservedWordProperty;
}

export interface ReservedWordProperty {
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

export interface TokenNumber extends TokenBase {
    kind: TokenKind.Number;
}

export interface TokenString extends TokenBase {
    kind: TokenKind.String;
}

export interface TokenComment extends TokenBase {
    kind: TokenKind.Comment;
}

export type TokenizingToken = TokenReserved | TokenIdentifier | TokenNumber | TokenString | TokenComment;


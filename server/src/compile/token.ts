import {Position, Range, URI} from "vscode-languageserver";
import {HighlightModifierKind, HighlightTokenKind} from "../code/highlight";

export enum TokenKind {
    Reserved = 'Reserved',
    Identifier = 'Identifier',
    Number = 'Number',
    String = 'String',
    Comment = 'Comment',
}

export type LocationInfo = { path: string } & Range;

export function isPositionInRange(position: Position, range: Range): boolean {
    if (range.start.line === position.line
        && position.line < range.end.line
        && range.start.character <= position.character) return true;

    if (range.start.line < position.line
        && position.line < range.end.line) return true;

    if (range.start.line < position.line
        && position.line === range.end.line
        && position.character <= range.end.character) return true;

    if (range.start.line === position.line
        && position.line === range.end.line
        && range.start.character <= position.character
        && position.character <= range.end.character) return true;

    return false;
}

export interface HighlightInfo {
    token: HighlightTokenKind;
    modifier: HighlightModifierKind;
}

export interface TokenizingToken {
    kind: TokenKind;
    text: string;
    location: LocationInfo;
    highlight: HighlightInfo;
}


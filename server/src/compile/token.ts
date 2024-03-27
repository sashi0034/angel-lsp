import {Position, Range} from "vscode-languageserver";
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

export interface TokenizingToken {
    kind: TokenKind;
    text: string;
    location: LocationInfo;
    highlight: HighlightInfo;
}


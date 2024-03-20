import {Position, Range, URI} from "vscode-languageserver";
import {HighlightModifierKind, HighlightTokenKind} from "../code/highlight";

export type TokenKind = 'reserved' | 'identifier' | 'number' | 'string' | 'comment'

export type LocationInfo = { uri: string } & Range;

export function isPositionInLocation(position: Position, location: LocationInfo): boolean {
    if (location.start.line && location.start.character <= position.character) return true;

    if (location.start.line < position.line
        && position.line < location.end.line) return true;

    if (location.end.line && position.character <= location.end.character) return true;

    return false;
}

export interface HighlightInfo {
    token: HighlightTokenKind;
    modifier: HighlightModifierKind;
}

export interface EssentialToken {
    kind: TokenKind;
    text: string;
    location: LocationInfo;
}

export interface ProgramToken extends EssentialToken {
    highlight: HighlightInfo;
}

export const dummyToken: EssentialToken = {
    kind: 'reserved',
    text: '',
    location: {
        uri: '',
        start: {line: 0, character: 0},
        end: {line: 0, character: 0},
    },
} as const;

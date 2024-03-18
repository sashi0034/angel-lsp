import {Position, URI} from "vscode-languageserver";
import {HighlightModifierKind, HighlightTokenKind} from "../code/highlight";

export type TokenKind = 'reserved' | 'identifier' | 'number' | 'string' | 'comment'

export interface LocationInfo {
    uri: URI,
    start: Position,
    end: Position,
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

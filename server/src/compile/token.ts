import {Position, URI} from "vscode-languageserver";
import {HighlightModifier, HighlightToken} from "../code/highlight";

export type RowToken = 'reserved' | 'identifier' | 'number' | 'string' | 'comment'

export interface Location {
    uri: URI,
    start: Position,
    end: Position,
}

export interface TokenObject {
    kind: RowToken;
    text: string;
    location: Location;
    highlight: {
        token: HighlightToken
        modifier: HighlightModifier
    };
}
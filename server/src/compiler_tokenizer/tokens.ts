import {HighlightModifier, HighlightToken} from "../code/highlight";
import {Range} from "vscode-languageserver";
import {DeepReadonly} from "../utils/utilities";

/**
 * Tokenizer categorizes tokens into the following kinds.
 * Unknown tokens such as non-alphanumeric characters are removed during the tokenization phase.
 */
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

export type ReadonlyLocationInfo = DeepReadonly<LocationInfo>;

export function createEmptyLocation(): LocationInfo {
    return {
        path: '',
        start: {line: 0, character: 0},
        end: {line: 0, character: 0},
    };
}

export interface HighlightInfo {
    token: HighlightToken;
    modifier: HighlightModifier;
}

/**
 * Creates virtual highlight information.
 * Used to treat built-in keywords like 'int' as tokens, even though they don't actually exist in the code.
 */
export function createVirtualHighlight(): HighlightInfo {
    return {
        token: HighlightToken.Invalid,
        modifier: HighlightModifier.Nothing,
    };
}

/**
 * Base interface for all tokens.
 * Every token is expected to have these properties.
 */
export interface TokenBase {
    /**
     * Token type determined by tokenizer
     */
    readonly kind: TokenKind;
    /**
     * The text content of a token as it is
     */
    readonly text: string;
    /**
     * The location information of a token including the file path and the position within the file.
     */
    readonly location: ReadonlyLocationInfo;
    /**
     * Syntax highlighting information.
     */
    highlight: HighlightInfo;
}

export interface TokenReserved extends TokenBase {
    readonly kind: TokenKind.Reserved;
    readonly property: ReservedWordProperty;
}

export interface ReservedWordProperty {
    readonly isMark: boolean;
    readonly isExprPreOp: boolean;
    readonly isExprOp: boolean;
    readonly isBitOp: boolean;
    readonly isMathOp: boolean;
    readonly isCompOp: boolean;
    readonly isLogicOp: boolean;
    readonly isAssignOp: boolean;
    readonly isNumber: boolean;
    readonly isPrimeType: boolean;
}

export interface TokenIdentifier extends TokenBase {
    readonly kind: TokenKind.Identifier;
}

export enum NumberLiterals {
    Integer = 'Integer',
    Float = 'Float',
    Double = 'Double',
}

export interface TokenNumber extends TokenBase {
    readonly kind: TokenKind.Number;
    readonly numeric: NumberLiterals;
}

export interface TokenString extends TokenBase {
    readonly kind: TokenKind.String;
}

export interface TokenComment extends TokenBase {
    readonly kind: TokenKind.Comment;
}

/**
 * TokenizingToken is a union type of all token types.
 */
export type TokenizedToken = TokenReserved | TokenIdentifier | TokenNumber | TokenString | TokenComment

import {HighlightModifier, HighlightToken} from "../code/highlight";
import {Range} from "vscode-languageserver";
import {DeepReadonly} from "../utils/utilities";
import {findAllReservedWordProperty, ReservedWordProperty} from "./reservedWord";

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
 * Base object for all tokens.
 */
export abstract class TokenBase {
    // Syntax highlight information
    private _highlight: HighlightInfo;

    // Preprocessed token information are set by the preprocessor.
    private _indexInPreprocessedTokenList: number = -1;
    private _nextPreprocessedToken: TokenBase | undefined = undefined;

    protected constructor(
        // The text content of a token as it is
        public readonly text: string,
        // The location information of a token including the file path and the position within the file.
        public readonly location: ReadonlyLocationInfo,
        highlightToken: HighlightToken,
        highlightModifier: HighlightModifier = HighlightModifier.Nothing,
    ) {
        this._highlight = {token: highlightToken, modifier: highlightModifier};
    }

    public abstract get kind(): TokenKind;

    public setHighlight(token: HighlightToken, modifier: HighlightModifier = HighlightModifier.Nothing) {
        this._highlight = {token: token, modifier: modifier};
    }

    public get highlight(): HighlightInfo {
        return this._highlight;
    }

    /**
     * Makes the token virtual.
     * Virtual tokens are not part of the original code.
     */
    protected markVirtual() {
        // We recognize the virtual token by whether the highlight is invalid.
        this._highlight.token = HighlightToken.Invalid;
    }

    /**
     * Returns whether the token does not exist in the original code.
     */
    public isVirtual(): boolean {
        return this._highlight.token === HighlightToken.Invalid;
    }

    public isReservedToken(): this is TokenReserved {
        return this.kind === TokenKind.Reserved;
    }

    public isNumberToken(): this is TokenNumber {
        return this.kind === TokenKind.Number;
    }

    public setPreprocessedTokenInfo(index: number, next: TokenBase | undefined) {
        this._indexInPreprocessedTokenList = index;
        this._nextPreprocessedToken = next;
    }

    /**
     * Returns the next token in the preprocessed token list.
     */
    public get index() {
        return this._indexInPreprocessedTokenList;
    }

    /**
     * Returns the next token in the preprocessed token list.
     */
    public get next() {
        return this._nextPreprocessedToken;
    }
}

export class TokenReserved extends TokenBase {
    public readonly property: ReservedWordProperty;

    public constructor(
        text: string,
        location: ReadonlyLocationInfo,
        property?: ReservedWordProperty,
    ) {
        super(text, location, HighlightToken.Keyword);

        this.property = property ?? findAllReservedWordProperty(text);
    }

    public static createVirtual(text: string, location?: ReadonlyLocationInfo): TokenReserved {
        const token = new TokenReserved(text, location ?? createEmptyLocation());
        token.markVirtual();
        return token;
    }

    public get kind(): TokenKind {
        return TokenKind.Reserved;
    }
}

export class TokenIdentifier extends TokenBase {
    public constructor(
        text: string,
        location: ReadonlyLocationInfo,
    ) {
        super(text, location, HighlightToken.Variable);
    }

    public static createVirtual(text: string, location?: ReadonlyLocationInfo): TokenIdentifier {
        const token = new TokenIdentifier(text, location ?? createEmptyLocation());
        token.markVirtual();
        return token;
    }

    public get kind(): TokenKind {
        return TokenKind.Identifier;
    }
}

export enum NumberLiterals {
    Integer = 'Integer',
    Float = 'Float',
    Double = 'Double',
}

export class TokenNumber extends TokenBase {
    public constructor(
        text: string,
        location: ReadonlyLocationInfo,
        public readonly numeric: NumberLiterals,
    ) {
        super(text, location, HighlightToken.Number);
    }

    public get kind(): TokenKind {
        return TokenKind.Number;
    }
}

export class TokenString extends TokenBase {
    public constructor(
        text: string,
        location: ReadonlyLocationInfo,
    ) {
        super(text, location, HighlightToken.String);
    }

    public static createVirtual(text: string, location?: ReadonlyLocationInfo): TokenString {
        const token = new TokenString(text, location ?? createEmptyLocation());
        token.markVirtual();
        return token;
    }

    public get kind(): TokenKind {
        return TokenKind.String;
    }
}

export class TokenComment extends TokenBase {
    public constructor(
        text: string,
        location: ReadonlyLocationInfo,
    ) {
        super(text, location, HighlightToken.Comment);
    }

    public get kind(): TokenKind {
        return TokenKind.Comment;
    }
}

/**
 * TokenObject is a union type of all token types.
 */
export type TokenObject = TokenReserved | TokenIdentifier | TokenNumber | TokenString | TokenComment

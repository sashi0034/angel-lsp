import {HighlightForModifier, HighlightForToken} from "../code/highlight";
import {findAllReservedWordProperty, ReservedWordProperty} from "./reservedWord";
import {TextLocation} from "./textLocation";

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

interface HighlightInfo {
    token: HighlightForToken;
    modifier: HighlightForModifier;
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
        public readonly location: TextLocation,
        highlightToken: HighlightForToken,
        highlightModifier: HighlightForModifier = HighlightForModifier.Nothing,
    ) {
        this._highlight = {token: highlightToken, modifier: highlightModifier};
    }

    public abstract get kind(): TokenKind;

    public setHighlight(token: HighlightForToken, modifier?: HighlightForModifier) {
        if (modifier === undefined) {
            this._highlight.token = token;
        } else {
            this._highlight = {token: token, modifier: modifier};
        }
    }

    public get highlight(): Readonly<HighlightInfo> {
        return this._highlight;
    }

    /**
     * Makes the token virtual.
     * Virtual tokens are not part of the original code.
     */
    protected markVirtual() {
        // We recognize the virtual token by whether the highlight is invalid.
        this._highlight.token = HighlightForToken.Invalid;
    }

    /**
     * Returns whether the token does not exist in the original code.
     */
    public isVirtual(): boolean {
        return this._highlight.token === HighlightForToken.Invalid;
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

    /**
     * Returns the next token if it exists; otherwise, returns the current token.
     */
    public getNextOrSelf() {
        return this.next ?? this;
    }

    public equals(other: TokenBase): boolean {
        return this === other || (this.location.equals(other.location));
    }
}

export class TokenReserved extends TokenBase {
    public readonly property: ReservedWordProperty;

    public constructor(
        text: string,
        location: TextLocation,
        property?: ReservedWordProperty,
    ) {
        super(text, location, HighlightForToken.Keyword);

        this.property = property ?? findAllReservedWordProperty(text);
    }

    public static createVirtual(text: string, location?: TextLocation): TokenReserved {
        const token = new TokenReserved(text, location ?? TextLocation.createEmpty());
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
        location: TextLocation,
    ) {
        super(text, location, HighlightForToken.Variable);
    }

    public static createVirtual(text: string, location?: TextLocation): TokenIdentifier {
        const token = new TokenIdentifier(text, location ?? TextLocation.createEmpty());
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
        location: TextLocation,
        public readonly numberLiteral: NumberLiterals,
    ) {
        super(text, location, HighlightForToken.Number);
    }

    public get kind(): TokenKind {
        return TokenKind.Number;
    }
}

export class TokenString extends TokenBase {
    public constructor(
        text: string,
        location: TextLocation,
    ) {
        super(text, location, HighlightForToken.String);
    }

    public static createVirtual(text: string, location?: TextLocation): TokenString {
        const token = new TokenString(text, location ?? TextLocation.createEmpty());
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
        location: TextLocation,
    ) {
        super(text, location, HighlightForToken.Comment);
    }

    public get kind(): TokenKind {
        return TokenKind.Comment;
    }
}

/**
 * TokenObject is a union type of all token types.
 */
export type TokenObject = TokenReserved | TokenIdentifier | TokenNumber | TokenString | TokenComment

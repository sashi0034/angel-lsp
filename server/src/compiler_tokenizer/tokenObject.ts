import {HighlightForModifier, HighlightForToken} from "../core/highlight";
import {findAllReservedWordProperty, ReservedWordProperty} from "./reservedWord";
import {TextLocation} from "./textLocation";
import {TokenRange} from "./tokenRange";
import assert = require("node:assert");

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

const emptyLocation = TextLocation.createEmpty();

/**
 * Base object for all tokens.
 */
export abstract class TokenBase {
    // Location information of a token including the file path and the position within the file.
    private readonly _location: TextLocation | undefined;

    // Syntax highlight information
    private _highlight: HighlightInfo;

    // Raw token information are set by the tokenizer.
    private _prevRawToken: TokenObject | undefined = undefined;
    private _nextRawToken: TokenObject | undefined = undefined;

    // Preprocessed token information are set by the preprocessor.
    private _indexInPreprocessedTokenList: number = -1;
    private _prevPreprocessedToken: TokenObject | undefined = undefined;
    private _nextPreprocessedToken: TokenObject | undefined = undefined;

    // Information about the token range covered by this virtual token
    private readonly _coveredRange: TokenRange | undefined = undefined;

    protected constructor(
        // The text content of a token as it is in principle. (Note that a combined multi-string token is modified.)
        public readonly text: string,
        // The location information of a token. If this is a virtual token, it can specify the range it covers.
        location: TextLocation | TokenRange | undefined,
        // Initial highlight information for the token type
        highlightToken: HighlightForToken,
        // Initial highlight information for the token modifier
        highlightModifier: HighlightForModifier = HighlightForModifier.Nothing,
    ) {
        if (location instanceof TextLocation) {
            this._location = location;
        } else if (location instanceof TokenRange) {
            this._coveredRange = location;
        }

        this._highlight = {token: highlightToken, modifier: highlightModifier};
    }

    public abstract get kind(): TokenKind;

    public get location(): TextLocation {
        return this._location
            ?? this._coveredRange?.getBoundingLocation()
            ?? emptyLocation;
    }

    public setHighlight(token: HighlightForToken, modifier?: HighlightForModifier) {
        assert(this.isVirtual() === false);
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
     * Returns whether the token does not exist in the original code.
     */
    public isVirtual(): boolean {
        return this._location === undefined;
    }

    public isReservedToken(): this is TokenReserved {
        return this.kind === TokenKind.Reserved;
    }

    public isNumberToken(): this is TokenNumber {
        return this.kind === TokenKind.Number;
    }

    public isStringToken(): this is TokenString {
        return this.kind === TokenKind.String;
    }

    public isCommentToken(): this is TokenComment {
        return this.kind === TokenKind.Comment;
    }

    public bindRawToken(next: TokenObject | undefined) {
        this._nextRawToken = next;
        if (next !== undefined) next._prevRawToken = this;
    }

    public bindPreprocessedToken(index: number, next: TokenObject | undefined) {
        this._indexInPreprocessedTokenList = index;
        this._nextPreprocessedToken = next;
        if (next !== undefined) next._prevPreprocessedToken = this;
    }

    /**
     * Returns the previous token in the raw token list.
     */
    public get prevRaw(): TokenObject | undefined {
        return this._prevRawToken;
    }

    /**
     * Returns the next token in the raw token list.
     */
    public get nextRaw(): TokenObject | undefined {
        return this._nextRawToken;
    }

    /**
     * Returns the next token in the preprocessed token list.
     */
    public get index() {
        return this._indexInPreprocessedTokenList;
    }

    /**
     * Returns the previous token in the preprocessed token list.
     */
    public get prev(): TokenObject | undefined {
        return this._prevPreprocessedToken;
    }

    /**
     * Returns the next token in the preprocessed token list.
     */
    public get next(): TokenObject | undefined {
        return this._nextPreprocessedToken;
    }

    /**
     * Information on the token range this token covered.
     * It is basically set for virtual tokens.
     */
    public get coveredRange(): TokenRange | undefined {
        return this._coveredRange;
    }

    /**
     * Returns the next token if it exists; otherwise, returns the current token.
     */
    public getNextOrSelf(): TokenObject {
        return this.next ?? this;
    }

    public equals(other: TokenBase | undefined): boolean {
        if (other === undefined) return false;
        return this === other || (this.location.equals(other.location));
    }
}

export class TokenReserved extends TokenBase {
    public readonly property: ReservedWordProperty;

    public constructor(
        text: string,
        location: TextLocation | TokenRange | undefined,
        property?: ReservedWordProperty,
    ) {
        super(text, location, HighlightForToken.Keyword);

        this.property = property ?? findAllReservedWordProperty(text);
    }

    public static createVirtual(text: string, coveredRange?: TokenRange): TokenReserved {
        return new TokenReserved(text, coveredRange);
    }

    public get kind(): TokenKind {
        return TokenKind.Reserved;
    }
}

export class TokenIdentifier extends TokenBase {
    public constructor(
        text: string,
        location: TextLocation | TokenRange | undefined,
    ) {
        super(text, location, HighlightForToken.Variable);
    }

    public static createVirtual(text: string, coveredRange?: TokenRange): TokenIdentifier {
        return new TokenIdentifier(text, coveredRange);
    }

    public get kind(): TokenKind {
        return TokenKind.Identifier;
    }
}

export enum NumberLiteral {
    Integer = 'Integer',
    Float = 'Float',
    Double = 'Double',
}

export class TokenNumber extends TokenBase {
    public constructor(
        text: string,
        location: TextLocation,
        public readonly numberLiteral: NumberLiteral,
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
        location: TextLocation | TokenRange | undefined,
    ) {
        super(text, location, HighlightForToken.String);
    }

    public static createVirtual(text: string, coveredRange?: TokenRange): TokenString {
        return new TokenString(text, coveredRange);
    }

    public get kind(): TokenKind {
        return TokenKind.String;
    }

    public getStringContent(): string {
        return this.text.startsWith('"""') ? this.text.slice(3, -3) : this.text.slice(1, -1);
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

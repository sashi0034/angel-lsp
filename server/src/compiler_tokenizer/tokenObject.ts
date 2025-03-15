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

/**
 * Base object for all tokens.
 */
export abstract class TokenBase {
    // Syntax highlight information
    private _highlight: HighlightInfo;

    // Preprocessed token information are set by the preprocessor.
    private _indexInPreprocessedTokenList: number = -1;
    private _prevPreprocessedToken: TokenBase | undefined = undefined;
    private _nextPreprocessedToken: TokenBase | undefined = undefined;

    // Information on the token range this token replaced
    private _replacedRange: TokenRange | undefined = undefined;

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

    public isStringToken(): this is TokenString {
        return this.kind === TokenKind.String;
    }

    public setPreprocessedTokenInfo(index: number, next: TokenBase | undefined) {
        this._indexInPreprocessedTokenList = index;
        this._nextPreprocessedToken = next;
        if (next !== undefined) next._prevPreprocessedToken = this;
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
    public get prev(): TokenBase | undefined {
        return this._prevPreprocessedToken;
    }

    /**
     * Returns the next token in the preprocessed token list.
     */
    public get next(): TokenBase | undefined {
        return this._nextPreprocessedToken;
    }

    public setReplacedRange(range: TokenRange) {
        assert(this._replacedRange === undefined);
        this._replacedRange = range;
    }

    /**
     * Information on the token range this token replaced
     * It is basically set for virtual tokens.
     */
    public get replacedRange(): TokenRange | undefined {
        return this._replacedRange;
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

    public static createVirtual(text: string, location?: TextLocation, replacedRange?: TokenRange): TokenReserved {
        const token = new TokenReserved(text, location ?? TextLocation.createEmpty());
        token.markVirtual();
        if (replacedRange !== undefined) token.setReplacedRange(replacedRange);
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

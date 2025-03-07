import {HighlightForToken} from "../core/highlight";
import {diagnostic} from "../core/diagnostic";
import {TokenKind, TokenObject} from "../compiler_tokenizer/tokenObject";
import {
    ParserCachedData,
    ParserCacheKind,
    ParserCacheServices, ParserCacheTargets
} from "./parserCache";

export enum ParseFailure {
    /**
     * The parser visited a function, but the input does not conform to the expected grammar.
     */
    Mismatch = 'Mismatch',
    /**
     * The parser visited a function where the input conforms to the expected grammar,
     * but parsing fails due to missing elements.
     */
    Pending = 'Pending',
}

export enum BreakOrThrough {
    /**
     * The parser should stop parsing and return the current result.
     */
    Break = 'Break',
    /**
     * The parser should continue parsing.
     */
    Through = 'Through',
}

/**
 * When a parsing error occurs, the parser may return a `ParseResult<T>`.
 * If the parser encounters a function and the input does not conform to the expected format, 'Mismatch' is returned.
 * If the input follows the expected format but parsing fails due to missing elements (e.g., an incomplete expression), 'Pending' is returned.
 * No diagnostic message is issued for 'Mismatch', but when 'Pending' is returned, a diagnostic message is generated at that node.
 */
export type ParseResult<T> = T | ParseFailure;

export class ParserState {
    private readonly _caches: (ParserCachedData<ParserCacheKind> | undefined)[] = [];

    private _lastTokenAtError: TokenObject | undefined;

    public constructor(
        private readonly _tokens: TokenObject[],
        private _cursorIndex: number = 0
    ) {
        this._caches = new Array(_tokens.length);
    }

    public backtrack(token: TokenObject) {
        this._cursorIndex = token.index;
    }

    public isEnd(): boolean {
        return this._cursorIndex >= this._tokens.length;
    }

    public next(step: number = 0): TokenObject {
        if (this._cursorIndex + step >= this._tokens.length) return this._tokens[this._tokens.length - 1];
        return this._tokens[this._cursorIndex + step];
    }

    public hasNext(step: number = 0): boolean {
        return this._cursorIndex + step < this._tokens.length;
    }

    public prev(): TokenObject {
        if (this._cursorIndex <= 0) return this._tokens[0];
        return this._tokens[this._cursorIndex - 1];
    }

    public step() {
        this._cursorIndex++;
    }

    /**
     * Set the highlight for the current token and move the cursor to the next token.
     */
    public commit(highlightForToken: HighlightForToken) {
        const next = this.next();
        if (next.isVirtual() === false) next.setHighlight(highlightForToken);

        this.step();
    }

    /**
     * Check if the next token is a reserved word.
     */
    public expect(reservedWord: string, highlight: HighlightForToken) {
        if (this.isEnd()) {
            diagnostic.addError(this.next().location, "Unexpected end of file.");
            return false;
        }

        const isExpectedWord = this.next().kind === TokenKind.Reserved && this.next().text === reservedWord;
        if (isExpectedWord === false) {
            diagnostic.addError(this.next().location, `Expected '${reservedWord}'.`);
            return false;
        }

        this.commit(highlight);
        return true;
    }

    public error(message: string) {
        if (this._lastTokenAtError === this.next()) return;

        diagnostic.addError(this.next().location, message);
        this._lastTokenAtError = this.next();
    }

    /**
     * At certain nodes, parsing results at a given index are cached using a DP-like approach.
     * This caching mechanism helps improve performance by avoiding redundant parsing of the same tokens multiple times.
     *
     * @param key The cache key that identifies the type of parsing result to cache.
     * @returns An object that allows restoring a cached result or storing a new one.
     */
    // TODO: remove?
    public cache<T extends ParserCacheKind>(key: T): Readonly<ParserCacheServices<T>> {
        const rangeStart = this._cursorIndex;
        const data = this._caches[rangeStart];

        let restore: (() => ParserCacheTargets<T> | undefined) | undefined = undefined;
        if (data !== undefined && data.kind === key) restore = () => {
            this._cursorIndex = data.rangeEnd;
            return data.data as ParserCacheTargets<T> | undefined;
        };

        const store = (cache: ParserCacheTargets<T> | undefined) => {
            this._caches[rangeStart] = {
                kind: key,
                rangeEnd: this._cursorIndex,
                data: cache,
            };
        };

        return {
            restore: restore,
            store: store,
        };
    }
}

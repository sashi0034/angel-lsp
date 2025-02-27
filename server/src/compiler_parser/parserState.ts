import {HighlightForToken} from "../code/highlight";
import {diagnostic} from "../code/diagnostic";
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
    private readonly caches: (ParserCachedData<ParserCacheKind> | undefined)[] = [];

    public constructor(
        private readonly tokens: TokenObject[],
        private cursorIndex: number = 0
    ) {
        this.caches = new Array(tokens.length);
    }

    public backtrack(token: TokenObject) {
        this.cursorIndex = token.index;
    }

    public isEnd(): boolean {
        return this.cursorIndex >= this.tokens.length;
    }

    public next(step: number = 0): TokenObject {
        if (this.cursorIndex + step >= this.tokens.length) return this.tokens[this.tokens.length - 1];
        return this.tokens[this.cursorIndex + step];
    }

    public hasNext(step: number = 0): boolean {
        return this.cursorIndex + step < this.tokens.length;
    }

    public prev(): TokenObject {
        if (this.cursorIndex <= 0) return this.tokens[0];
        return this.tokens[this.cursorIndex - 1];
    }

    public step() {
        this.cursorIndex++;
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
        diagnostic.addError(this.next().location, message);
    }

    /**
     * At certain nodes, parsing results at a given index are cached using a DP-like approach.
     * This caching mechanism helps improve performance by avoiding redundant parsing of the same tokens multiple times.
     *
     * @param key The cache key that identifies the type of parsing result to cache.
     * @returns An object that allows restoring a cached result or storing a new one.
     */
    public cache<T extends ParserCacheKind>(key: T): Readonly<ParserCacheServices<T>> {
        const rangeStart = this.cursorIndex;
        const data = this.caches[rangeStart];

        let restore: (() => ParserCacheTargets<T> | undefined) | undefined = undefined;
        if (data !== undefined && data.kind === key) restore = () => {
            this.cursorIndex = data.rangeEnd;
            return data.data as ParserCacheTargets<T> | undefined;
        };

        const store = (cache: ParserCacheTargets<T> | undefined) => {
            this.caches[rangeStart] = {
                kind: key,
                rangeEnd: this.cursorIndex,
                data: cache,
            };
        };

        return {
            restore: restore,
            store: store,
        };
    }
}

import {HighlightForToken} from "../code/highlight";
import {diagnostic} from "../code/diagnostic";
import {TokenKind, TokenObject} from "../compiler_tokenizer/tokenObject";
import {
    ParsedCachedData,
    ParsedCacheKind,
    ParsedCacheServices, ParsedCacheTargets
} from "./parsedCache";

export enum ParseFailure {
    Mismatch = 'Mismatch',
    Pending = 'Pending',
}

export enum BreakOrThrough {
    Break = 'Break',
    Through = 'Through',
}

/**
 * When a parsing error occurs, the parser may return a `ParsedResult<T>`.
 * If the parser visits a function and the input is not in an acceptable formatter, 'Mismatch' is returned.
 * If the input is in an acceptable formatter but parsing fails due to missing elements (e.g., an incomplete expression), 'Pending' is returned.
 * No diagnostic message is issued when a 'Mismatch' occurs, but when 'Pending' is returned, a diagnostic message is generated at that node.
 */
export type ParsedResult<T> = T | ParseFailure;

export class ParserState {
    private readonly caches: (ParsedCachedData<ParsedCacheKind> | undefined)[] = [];

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

    public prev(): TokenObject {
        if (this.cursorIndex <= 0) return this.tokens[0];
        return this.tokens[this.cursorIndex - 1];
    }

    public step() {
        this.cursorIndex++;
    }

    public commit(highlightForToken: HighlightForToken) {
        const next = this.next();
        if (next.isVirtual() === false) next.setHighlight(highlightForToken);
        this.step();
    }

    public expect(word: string, analyzeToken: HighlightForToken) {
        if (this.isEnd()) {
            diagnostic.addError(this.next().location, "Unexpected end of file.");
            return false;
        }
        const isExpectedWord = this.next().kind === TokenKind.Reserved && this.next().text === word;
        if (isExpectedWord === false) {
            diagnostic.addError(this.next().location, `Expected '${word}'.`);
            // this.step();
            return false;
        }
        this.commit(analyzeToken);
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
    public cache<T extends ParsedCacheKind>(key: T): ParsedCacheServices<T> {
        const rangeStart = this.cursorIndex;
        const data = this.caches[rangeStart];
        let restore: (() => ParsedCacheTargets<T> | undefined) | undefined = undefined;
        if (data !== undefined && data.kind === key) restore = () => {
            this.cursorIndex = data.rangeEnd;
            return data.data as ParsedCacheTargets<T> | undefined;
        };

        const store = (cache: ParsedCacheTargets<T> | undefined) => {
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

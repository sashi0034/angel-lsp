import {HighlightToken} from "../code/highlight";
import {diagnostic} from "../code/diagnostic";
import {TokenKind} from "./tokens";
import {isVirtualToken, ParsedToken} from "./parsedToken";
import {
    ParseCachedData,
    ParseCacheKind,
    ParseCacher, ParseCacheTargets
} from "./parseCached";

export enum ParseFailure {
    Mismatch = 'Mismatch',
    Pending = 'Pending',
}

export enum BreakThrough {
    Break = 'Break',
    Through = 'Through',
}

// Diagnostic messages are issued when 'Pending' occurs. | パース失敗時に診断メッセージを発行

export type TriedParse<T> = T | ParseFailure;

export class ParsingState {
    private readonly caches: (ParseCachedData<ParseCacheKind> | undefined)[] = [];

    public constructor(
        private readonly tokens: ParsedToken[],
        private cursorIndex: number = 0
    ) {
        this.caches = new Array(tokens.length);
    }

    public backtrack(token: ParsedToken) {
        this.cursorIndex = token.index;
    }

    public isEnd(): boolean {
        return this.cursorIndex >= this.tokens.length;
    }

    public next(step: number = 0): ParsedToken {
        if (this.cursorIndex + step >= this.tokens.length) return this.tokens[this.tokens.length - 1];
        return this.tokens[this.cursorIndex + step];
    }

    public prev(): ParsedToken {
        if (this.cursorIndex <= 0) return this.tokens[0];
        return this.tokens[this.cursorIndex - 1];
    }

    public step() {
        this.cursorIndex++;
    }

    public confirm(analyzeToken: HighlightToken) {
        const next = this.next();
        if (isVirtualToken(next) === false) next.highlight.token = analyzeToken;
        this.step();
    }

    public expect(word: string, analyzeToken: HighlightToken) {
        if (this.isEnd()) {
            diagnostic.addError(this.next().location, "Unexpected end of file ❌");
            return false;
        }
        const isExpectedWord = this.next().kind === TokenKind.Reserved && this.next().text === word;
        if (isExpectedWord === false) {
            diagnostic.addError(this.next().location, `Expected '${word}' ❌`);
            // this.step();
            return false;
        }
        this.confirm(analyzeToken);
        return true;
    }

    public error(message: string) {
        diagnostic.addError(this.next().location, message);
    }

    public cache<T extends ParseCacheKind>(key: T): ParseCacher<T> {
        const rangeStart = this.cursorIndex;
        const data = this.caches[rangeStart];
        let restore: (() => ParseCacheTargets<T> | undefined) | undefined = undefined;
        if (data !== undefined && data.kind === key) restore = () => {
            this.cursorIndex = data.rangeEnd;
            return data.data as ParseCacheTargets<T> | undefined;
        };

        const store = (cache: ParseCacheTargets<T> | undefined) => {
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

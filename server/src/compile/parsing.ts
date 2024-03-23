import {TokenizingToken} from "./token";
import {HighlightModifierKind, HighlightTokenKind} from "../code/highlight";
import {diagnostic} from "../code/diagnostic";

export type TriedParse<T> = 'mismatch' | 'pending' | T;

// 診断メッセージは pending 発生時に発行する

export interface ParsingToken extends TokenizingToken {
    index: number;
    next: ParsingToken | undefined;
}

export const dummyToken: ParsingToken = {
    kind: 'reserved',
    text: '',
    location: {
        path: '',
        start: {line: 0, character: 0},
        end: {line: 0, character: 0},
    },
    highlight: {token: HighlightTokenKind.Variable, modifier: HighlightModifierKind.Invalid},
    index: 0,
    next: undefined,
} as const;

export class ParsingState {
    public constructor(
        private tokens: ParsingToken[],
        private cursorIndex: number = 0
    ) {
    }

    public backtrack(token: ParsingToken) {
        this.cursorIndex = token.index;
    }

    public isEnd(): boolean {
        return this.cursorIndex >= this.tokens.length;
    }

    public next(step: number = 0): ParsingToken {
        if (this.cursorIndex + step >= this.tokens.length) return this.tokens[this.tokens.length - 1];
        return this.tokens[this.cursorIndex + step];
    }

    public prev(): ParsingToken {
        if (this.cursorIndex <= 0) return this.tokens[0];
        return this.tokens[this.cursorIndex - 1];
    }

    public step() {
        this.cursorIndex++;
    }

    public confirm(analyzeToken: HighlightTokenKind, analyzedModifier: HighlightModifierKind | undefined = undefined) {
        const next = this.next();
        next.highlight.token = analyzeToken;
        if (analyzedModifier !== undefined) next.highlight.modifier = analyzedModifier;
        this.step();
    }

    public expect(word: string, analyzeToken: HighlightTokenKind, analyzedModifier: HighlightModifierKind | undefined = undefined) {
        if (this.isEnd()) {
            diagnostic.addError(this.next().location, "Unexpected end of file ❌");
            return false;
        }
        if (this.next().kind !== "reserved") {
            diagnostic.addError(this.next().location, `Expected reserved word 👉 ${word} 👈`);
            return false;
        }
        if (this.next().text !== word) {
            diagnostic.addError(this.next().location, `Expected reserved word 👉 ${word} 👈`);
            return false;
        }
        this.confirm(analyzeToken, analyzedModifier);
        return true;
    }
}

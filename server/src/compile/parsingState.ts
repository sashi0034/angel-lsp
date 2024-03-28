import {HighlightTokenKind} from "../code/highlight";
import {diagnostic} from "../code/diagnostic";
import {TokenKind} from "./token";
import {ParsingToken} from "./parsing";

export enum ParseFailure {
    Mismatch = 'mismatch',
    Pending = 'pending',
}

// 診断メッセージは pending 発生時に発行する
export type TriedParse<T> = T | ParseFailure;

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

    public confirm(analyzeToken: HighlightTokenKind) {
        const next = this.next();
        next.highlight.token = analyzeToken;
        this.step();
    }

    public expect(word: string, analyzeToken: HighlightTokenKind) {
        if (this.isEnd()) {
            diagnostic.addError(this.next().location, "Unexpected end of file ❌");
            return false;
        }
        const isExpectedWord = this.next().kind === TokenKind.Reserved && this.next().text === word;
        if (isExpectedWord === false) {
            diagnostic.addError(this.next().location, `Expected 👉 ${word} 👈`);
            this.step();
            return false;
        }
        this.confirm(analyzeToken);
        return true;
    }

    public error(message: string) {
        diagnostic.addError(this.next().location, message);
    }
}
import {ProgramToken} from "./token";
import {HighlightModifierKind, HighlightTokenKind} from "../code/highlight";
import {diagnostic} from "../code/diagnostic";

export type TriedParse<T> = 'mismatch' | 'pending' | T;

// 診断メッセージは pending 発生時に発行する

export interface ParsingToken extends ProgramToken {
    pos: number;
}

export class ParsingState {
    public constructor(
        private tokens: ProgramToken[],
        private pos: number = 0
    ) {
    }

    public getPos = () => this.pos;
    public setPos = (pos: number) => this.pos = pos;

    public isEnd(): boolean {
        return this.pos >= this.tokens.length;
    }

    public next(step: number = 0): ProgramToken {
        if (this.pos + step >= this.tokens.length) return this.tokens[this.tokens.length - 1];
        return this.tokens[this.pos + step];
    }

    public step() {
        this.pos++;
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

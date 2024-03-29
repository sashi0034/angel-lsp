import {Position, URI} from "vscode-languageserver";

export class TokenizingState {
    public readonly content: string;
    private cursor: number;
    private head: Position;

    public getCursor() {
        return this.cursor;
    }

    constructor(content: string) {
        this.content = content;
        this.cursor = 0;
        this.head = {line: 0, character: 0};
    }

    next(offset: number = 0) {
        return this.content[this.cursor + offset];
    }

    isEnd() {
        return this.cursor >= this.content.length;
    }

    isNext(expected: string) {
        return this.content.substring(this.cursor, this.cursor + expected.length) === expected;
    }

    isNextWrap() {
        const next = this.next();
        return next === '\r' || next === '\n';
    }

    isNextWhitespace() {
        const next = this.content[this.cursor];
        return next === ' ' || next === '\t';
    }

    stepNext() {
        if (this.isEnd()) return;

        if (this.isNextWrap()) {
            this.head.line++;
            this.head.character = 0;
            if (this.isNext('\r\n')) this.cursor += 2;
            else this.cursor += 1;
        } else {
            this.head.character++;
            this.cursor += 1;
        }
    }

    stepFor(count: number) {
        this.head.character += count;
        this.cursor += count;
    }

    copyHead() {
        return {
            line: this.head.line,
            character: this.head.character
        };
    }
}
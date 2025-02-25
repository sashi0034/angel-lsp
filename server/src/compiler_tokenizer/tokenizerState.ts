import {diagnostic} from "../code/diagnostic";
import {MutableTextPosition, MutableTextRange, TextPosition, TextRange} from "./textLocation";

export class TokenizerState {
    // The content of the file to be tokenized
    public readonly content: string;

    // Index of the current cursor position in the content string
    private cursor: number;

    // Same as cursor, but expressed in terms of line and character position rather than index
    private readonly head: MutableTextPosition;

    public getCursor() {
        return this.cursor;
    }

    constructor(content: string) {
        this.content = content;
        this.cursor = 0;
        this.head = new MutableTextPosition(0, 0);
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

    substrFrom(start: number) {
        return this.content.substring(start, this.cursor);
    }

    copyHead(): TextPosition {
        return this.head.freeze();
    }
}

/**
 * Buffer for strings that are not Alphabets, numbers, or symbols
 */
export class UnknownBuffer {
    private buffer: string = "";
    private location: MutableTextRange | null = null;

    public append(head: TextRange, next: string) {
        if (this.location === null) {
            this.location = MutableTextRange.create(head);
        } else if (head.start.line !== this.location.start.line
            || head.start.character - this.location.end.character > 1
        ) {
            this.flush();
            this.location = MutableTextRange.create(head);
        }

        this.location.end = MutableTextPosition.create(head.end);
        this.buffer += next;
    }

    /**
     * Flushes the buffer and reports an error if the buffer is not empty
     */
    public flush() {
        if (this.buffer.length === 0) return;
        if (this.location === null) return;

        this.location.end.character++;
        diagnostic.addError(this.location, 'Unknown token: ' + this.buffer);
        this.buffer = "";
    }
}
import {diagnostic} from "../core/diagnostic";
import {MutableTextPosition, MutableTextRange, TextLocation, TextPosition, TextRange} from "./textLocation";

export class TokenizerState {
    // The content of the file to be tokenized
    public readonly _fileContent: string;

    // Current offset position of the head in the file content string
    private _cursorOffset: number;

    // Same as _cursorOffset, but expressed in terms of line and character position
    private readonly _cursorPosition: MutableTextPosition;

    public getCursorOffset() {
        return this._cursorOffset;
    }

    public getCursorPosition(): TextPosition {
        return this._cursorPosition.freeze();
    }

    public constructor(content: string) {
        this._fileContent = content;
        this._cursorOffset = 0;
        this._cursorPosition = new MutableTextPosition(0, 0);
    }

    public next(offset: number = 0) {
        return this._fileContent[this._cursorOffset + offset];
    }

    public isEnd() {
        return this._cursorOffset >= this._fileContent.length;
    }

    public isNext(expected: string) {
        return this._fileContent.substring(this._cursorOffset, this._cursorOffset + expected.length) === expected;
    }

    public isNextWrap() {
        const next = this.next();
        return next === '\r' || next === '\n';
    }

    public isNextWhitespace() {
        const next = this._fileContent[this._cursorOffset];
        return next === ' ' || next === '\t';
    }

    public stepNext() {
        if (this.isEnd()) return;

        if (this.isNextWrap()) {
            this._cursorPosition.line_++;
            this._cursorPosition.character_ = 0;
            if (this.isNext('\r\n')) this._cursorOffset += 2;
            else this._cursorOffset += 1;
        } else {
            this._cursorPosition.character_++;
            this._cursorOffset += 1;
        }
    }

    public stepFor(count: number) {
        this._cursorPosition.character_ += count;
        this._cursorOffset += count;
    }

    /**
     * Returns the substring from the specified end position to the current cursor position
     */
    public substrToCursor(start: number) {
        return this._fileContent.substring(start, this._cursorOffset);
    }
}

/**
 * Buffer for strings that are not alphabets, numbers, or symbols
 */
export class UnknownWordBuffer {
    private _bufferText: string = "";
    private _bufferLocation: MutableTextRange | null = null;

    public append(cursor: TextRange, next: string) {
        if (this._bufferLocation === null) {
            // Initialize the location
            this._bufferLocation = MutableTextRange.create(cursor);
        } else if (
            cursor.start.line !== this._bufferLocation.end.line_ // if the line is different
            || cursor.start.character - this._bufferLocation.end.character_ > 1 // or if there is a space gap between the last token
        ) {
            // Flushes the buffer
            this.flush();
            this._bufferLocation.start = MutableTextPosition.create(cursor.start);
        }

        this._bufferLocation.end = MutableTextPosition.create(cursor.end);
        this._bufferText += next;
    }

    /**
     * Flushes the buffer and reports an error if the buffer is not empty
     */
    public flush() {
        if (this._bufferText.length === 0) return;
        if (this._bufferLocation === null) return;

        this._bufferLocation.end.character_++;
        diagnostic.error(this._bufferLocation.freeze(), 'Unknown token: ' + this._bufferText);
        this._bufferText = "";
    }
}
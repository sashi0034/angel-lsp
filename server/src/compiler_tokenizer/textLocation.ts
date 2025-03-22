import * as lsp from 'vscode-languageserver';

export class TextPosition implements lsp.Position {
    constructor(
        public readonly line: number,
        public readonly character: number
    ) {
    }

    public static create(position: lsp.Position): TextPosition {
        return new TextPosition(position.line, position.character);
    }

    public clone(): TextPosition {
        return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    }

    public equals(other: lsp.Position): boolean {
        return this.line === other.line && this.character === other.character;
    }

    public isSameLine(other: lsp.Position): boolean {
        return this.line === other.line;
    }

    /**
     * Returns true if this position is ahead of the other position.
     */
    public isLessThan(other: lsp.Position): boolean {
        if (this.line < other.line) return true;
        return this.line === other.line && this.character < other.character;
    }

    /**
     *  Returns -1 if lhs is closer to this position than rhs, 1 if rhs is closer than lhs, and 0 if both are equidistant.
     */
    public compareNearest(lhs: TextPosition, rhs: TextPosition): -1 | 0 | 1 {
        const lhsLineDiff = Math.abs(lhs.line - this.line);
        const rhsLineDiff = Math.abs(rhs.line - this.line);

        if (lhsLineDiff < rhsLineDiff) return -1;
        if (lhsLineDiff > rhsLineDiff) return 1;

        const lhsCharacterDiff = Math.abs(lhs.character - this.character);
        const rhsCharacterDiff = Math.abs(rhs.character - this.character);
        if (lhsCharacterDiff < rhsCharacterDiff) return -1;
        if (lhsCharacterDiff > rhsCharacterDiff) return 1;

        return 0;
    }

    public simpleFormat(): string {
        return `${this.line}:${this.character}`;
    }

    /**
     * Returns a new position moved by the specified amount.
     */
    public movedBy(line: number, count: number): TextPosition {
        let newLine = this.line + line;
        if (newLine < 0) newLine = 0;

        let newCharacter = this.character + count;
        if (newCharacter < 0) newCharacter = 0;

        return new TextPosition(newLine, newCharacter);
    }
}

/**
 * Represents a mutable text position.
 * This does not satisfy `lsp.Position`,
 * so please make it immutable when passing it to `lsp.Position`.
 */
export class MutableTextPosition {
    public constructor(
        public line_: number,
        public character_: number
    ) {
    }

    public static create(position: lsp.Position): MutableTextPosition {
        return new MutableTextPosition(position.line, position.character);
    }

    public freeze(): TextPosition {
        return new TextPosition(this.line_, this.character_);
    }
}

export class TextRange implements lsp.Range {
    constructor(
        public readonly start: TextPosition,
        public readonly end: TextPosition
    ) {
    }

    public static create(range: lsp.Range): TextRange {
        return new TextRange(TextPosition.create(range.start), TextPosition.create(range.end));
    }

    /**
     * Returns true if the specified position is within this range inclusively.
     */
    public positionInRange(position: lsp.Position): boolean {
        if (position.line < this.start.line || position.line > this.end.line) return false;
        if (position.line === this.start.line && position.character < this.start.character) return false;
        if (position.line === this.end.line && position.character > this.end.character) return false;

        return true;
    }

    // create positionInRangeExclusive if needed

    /**
     * Returns true if the specified range is within this range inclusively.
     */
    public contains(other: lsp.Range): boolean {
        return this.positionInRange(other.start) && this.positionInRange(other.end);
    }

    public intersects(other: TextRange): boolean {
        if (this.end.isLessThan(other.start) || other.end.isLessThan(this.start)) return false;
        return true;
    }

    public clone(): TextRange {
        return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    }

    public getDifference() {
        return {
            line: this.end.line - this.start.line,
            character: this.end.character - this.start.character
        };
    }
}

export class MutableTextRange {
    public constructor(
        public start: MutableTextPosition,
        public end: MutableTextPosition
    ) {
    }

    public static create(range: lsp.Range): MutableTextRange {
        return new MutableTextRange(MutableTextPosition.create(range.start), MutableTextPosition.create(range.end));
    }

    public freeze(): TextRange {
        return new TextRange(this.start.freeze(), this.end.freeze());
    }
}

/**
 * Represents a location in a text file.
 */
export class TextLocation extends TextRange {
    constructor(
        public readonly path: string,
        start: TextPosition,
        end: TextPosition
    ) {
        super(start, end);
    }

    public static createEmpty(): TextLocation {
        return new TextLocation('', new TextPosition(0, 0), new TextPosition(0, 0));
    }

    public clone(): TextLocation {
        return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    }

    public equals(other: TextLocation): boolean {
        return this.path === other.path && this.start.equals(other.start) && this.end.equals(other.end);
    }

    public toServerLocation(): lsp.Location {
        return lsp.Location.create(this.path, this);
    }

    public withEnd(newEnd: TextPosition): TextLocation {
        return new TextLocation(this.path, this.start, newEnd);
    }

    public simpleFormat(): string {
        const filename = this.path.match(/[^\\/]+[/\\][^\\/]+$/) ?? this.path;
        return `${filename}:${this.start.simpleFormat()}-${this.end.simpleFormat()}`;
    }
}

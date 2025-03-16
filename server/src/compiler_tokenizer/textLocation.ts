import * as languageserver from 'vscode-languageserver';

export class TextPosition implements languageserver.Position {
    constructor(
        public readonly line: number,
        public readonly character: number
    ) {
    }

    public static create(position: languageserver.Position): TextPosition {
        return new TextPosition(position.line, position.character);
    }

    public clone(): TextPosition {
        return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    }

    public equals(other: languageserver.Position): boolean {
        return this.line === other.line && this.character === other.character;
    }

    public isSameLine(other: languageserver.Position): boolean {
        return this.line === other.line;
    }

    /**
     * Returns true if this position is ahead of the other position.
     */
    public isLessThan(other: languageserver.Position): boolean {
        if (this.line < other.line) return true;
        return this.line === other.line && this.character < other.character;
    }

    public isLessThanOrEqual(other: languageserver.Position): boolean {
        return this.isLessThan(other) || this.equals(other);
    }

    public formatWithColon(): string {
        return `${this.line}:${this.character}`;
    }
}

/**
 * Represents a mutable text position.
 * This does not satisfy `languageserver.Position`,
 * so please make it immutable when passing it to `languageserver.Position`.
 */
export class MutableTextPosition {
    public constructor(
        public line_: number,
        public character_: number
    ) {
    }

    public static create(position: languageserver.Position): MutableTextPosition {
        return new MutableTextPosition(position.line, position.character);
    }

    public freeze(): TextPosition {
        return new TextPosition(this.line_, this.character_);
    }
}

export class TextRange implements languageserver.Range {
    constructor(
        public readonly start: TextPosition,
        public readonly end: TextPosition
    ) {
    }

    public static create(range: languageserver.Range): TextRange {
        return new TextRange(TextPosition.create(range.start), TextPosition.create(range.end));
    }

    public positionInRange(position: languageserver.Position): boolean {
        if (position.line < this.start.line || position.line > this.end.line) return false;
        if (position.line === this.start.line && position.character < this.start.character) return false;
        if (position.line === this.end.line && position.character > this.end.character) return false;

        return true;
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

    public static create(range: languageserver.Range): MutableTextRange {
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

    public toServerLocation(): languageserver.Location {
        return languageserver.Location.create(this.path, this);
    }

    public withEnd(newEnd: TextPosition): TextLocation {
        return new TextLocation(this.path, this.start, newEnd);
    }
}

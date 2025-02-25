import * as languageserver from 'vscode-languageserver';

export class TextPosition implements languageserver.Position {
    constructor(
        public readonly line: number,
        public readonly character: number
    ) {
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
    public isAheadOf(other: languageserver.Position): boolean {
        if (this.line < other.line) return true;
        return this.isSameLine(other) && this.character < other.character;
    }
}

export class TextRange implements languageserver.Range {
    constructor(
        public readonly start: TextPosition,
        public readonly end: TextPosition
    ) {
    }

    public positionInRange(position: languageserver.Position): boolean {
        if (position.line < this.start.line || position.line > this.end.line) return false;
        if (position.line === this.start.line && position.character < this.start.character) return false;
        if (position.line === this.end.line && position.character > this.end.character) return false;

        return true;
    }

    public clone(): TextRange {
        return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
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

    public withEnd(newEnd: TextPosition): TextLocation {
        return new TextLocation(this.path, this.start, newEnd);
    }
}

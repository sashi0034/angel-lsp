import {TokenObject} from "./tokenObject";
import {TextLocation} from "./textLocation";

export function getBoundingLocationBetween(start: TokenObject, end: TokenObject): TextLocation {
    return start.location.withEnd(end.location.end);
}

export class TokenRange {
    public constructor(
        public readonly start: TokenObject,
        public readonly end: TokenObject
    ) {
    }

    /**
     * Get text range covering two tokens
     */
    public getBoundingLocation(): TextLocation {
        return getBoundingLocationBetween(this.start, this.end);
    }

    /**
     *  Checks if the token spans a single line.
     */
    public isOneLine(): boolean {
        return this.start.location.start.line === this.end.location.end.line;
    }

    public get path(): string {
        return this.start.location.path;
    }

    public extendBackward(count: number): TokenRange {
        let start = this.start;
        for (let i = 0; i < count; i++) {
            start = start.prev ?? start;
        }

        return new TokenRange(start, this.end);
    }

    public extendForward(count: number): TokenRange {
        let end = this.end;
        for (let i = 0; i < count; i++) {
            end = end.next ?? end;
        }

        return new TokenRange(this.start, end);
    }
}
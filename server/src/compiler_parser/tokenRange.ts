import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {TextLocation} from "../compiler_tokenizer/textLocation";

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
}
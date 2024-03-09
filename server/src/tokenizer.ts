import {Position, URI} from 'vscode-languageserver';

type TokenKind = 'number' | 'comment'

interface Location {
    uri: URI,
    start: Position,
    end: Position,
}

interface Token {
    kind: string;
    text: string;
    location: Location;
}

class ReadingState {
    str: string;
    cursor: number;
    head: Position;

    constructor(str: string) {
        this.str = str;
        this.cursor = 0;
        this.head = {line: 0, character: 0};
    }

    next() {
        return this.str[this.cursor];
    }

    isEnd() {
        return this.cursor >= this.str.length;
    }

    isNextWrap() {
        const next = this.next();
        return next === '\n' || next === '\r';
    }

    isNextWhitespace() {
        const next = this.str[this.cursor];
        return next === ' ' || next === '\t';
    }

    stepNext() {
        if (this.isEnd()) return;

        if (this.isNextWrap()) {
            this.head.line++;
            this.head.character = 0;
        } else {
            this.head.character++;
        }
        this.cursor++;
    }
}

function isDigit(str: string): boolean {
    return /^[0-9]$/.test(str);
}

function tryNumber(reading: ReadingState) {
    let result: string = "";
    while (reading.isEnd() === false && isDigit(reading.str[reading.cursor])) {
        result += reading.next();
        reading.stepNext();
    }
    return result;
}

export function tokenize(str: string, uri: URI) {
    const tokens: Token[] = [];
    const reading = new ReadingState(str);

    for (; ;) {
        reading.stepNext();
        if (reading.isEnd()) break;
        if (reading.isNextWrap()) continue;
        if (reading.isNextWhitespace()) continue;

        const start: Position = {
            line: reading.head.line,
            character: reading.head.character
        };

        const triedNumber = tryNumber(reading);
        if (triedNumber.length > 0) {
            tokens.push({
                kind: 'number',
                text: triedNumber,
                location: {
                    start: start,
                    end: reading.head,
                    uri: uri
                }
            });
        }
    }

    return tokens;
}

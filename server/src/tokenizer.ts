import {Position, URI} from 'vscode-languageserver';

enum TokenKind {
    Number,
    Comment,
    Variable,
}

export const tokenTypes = [
    'number',
    'comment',
    'variable',
];

interface Location {
    uri: URI,
    start: Position,
    end: Position,
}

interface Token {
    kind: TokenKind;
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

    next(offset: number = 0) {
        return this.str[this.cursor + offset];
    }

    isEnd() {
        return this.cursor >= this.str.length;
    }

    isNext(expected: string) {
        return this.str.substring(this.cursor, this.cursor + expected.length) === expected;
    }

    isNextWrap() {
        const next = this.next();
        return next === '\r' || next === '\n';
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
            if (this.isNext('\r\n')) this.cursor += 2;
            else this.cursor += 1;
        } else {
            this.head.character++;
            this.cursor += 1;
        }
    }

    copyHead() {
        return {
            line: this.head.line,
            character: this.head.character
        };
    }
}

function isDigit(str: string): boolean {
    return /^[0-9]$/.test(str);
}

function isAlnum(c: string): boolean {
    return /^[A-Za-z0-9_]$/.test(c);
}

function tryNumber(reading: ReadingState) {
    let result: string = "";
    while (reading.isEnd() === false && isDigit(reading.next())) {
        result += reading.next();
        reading.stepNext();
    }
    return result;
}

function tryIdentifier(reading: ReadingState) {
    let result: string = "";
    while (reading.isEnd() === false && isAlnum(reading.next())) {
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

        const location = {
            start: reading.copyHead(),
            end: reading.copyHead(),
            uri: uri
        };

        // 数値
        const triedNumber = tryNumber(reading);
        if (triedNumber.length > 0) {
            location.end = reading.copyHead();
            tokens.push({
                kind: TokenKind.Number,
                text: triedNumber,
                location: location
            });
        }

        // 識別子
        const triedIdentifier = tryIdentifier(reading);
        if (triedIdentifier.length > 0) {
            location.end = reading.copyHead();
            tokens.push({
                kind: TokenKind.Variable,
                text: triedIdentifier,
                location: location
            });
        }
    }

    return tokens;
}

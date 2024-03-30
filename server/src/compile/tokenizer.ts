import {HighlightModifierKind, HighlightTokenKind} from "../code/highlight";
import {
    HighlightInfo,
    LocationInfo, ReservedWordProperty,
    TokenComment, TokenIdentifier,
    TokenizingToken,
    TokenKind,
    TokenNumber, TokenReserved,
    TokenString
} from "./tokens";
import {diagnostic} from "../code/diagnostic";
import {TokenizingState, UnknownBuffer} from "./tokenizingState";
import {findReservedKeywordProperty, findReservedMarkProperty} from "./tokenReserves";

function isDigit(str: string): boolean {
    return /^[0-9]$/.test(str);
}

function isAlphanumeric(c: string): boolean {
    return /^[A-Za-z0-9_]$/.test(c);
}

// コメント解析
function tryComment(reading: TokenizingState, location: LocationInfo): TokenComment | undefined {
    if (reading.isNext('//')) {
        return tokenizeLineComment(reading, location);
    } else if (reading.isNext('/*')) {
        return tokenizeBlockComment(reading, location);
    }
    return undefined;
}

function createTokenComment(comment: string, location: LocationInfo): TokenComment | undefined {
    return {
        kind: TokenKind.Comment,
        text: comment,
        location: location,
        highlight: dummyHighlight(HighlightTokenKind.Comment, HighlightModifierKind.Invalid)
    };
}

function tokenizeLineComment(reading: TokenizingState, location: LocationInfo) {
    const start = reading.getCursor();
    reading.stepFor(2);
    for (; ;) {
        if (reading.isEnd() || reading.isNextWrap()) break;
        reading.stepNext();
    }
    location.end = reading.copyHead();
    return createTokenComment(reading.substrFrom(start), location);
}

function tokenizeBlockComment(reading: TokenizingState, location: LocationInfo) {
    const start = reading.getCursor();
    reading.stepFor(2);
    for (; ;) {
        if (reading.isEnd()) break;
        if (reading.isNext('*/')) {
            reading.stepFor(2);
            break;
        }
        reading.stepNext();
    }
    location.end = reading.copyHead();
    return createTokenComment(reading.substrFrom(start), location);
}

// 数値解析
function tryNumber(reading: TokenizingState, location: LocationInfo): TokenNumber | undefined {
    const start = reading.getCursor();
    let isFloating = false;

    for (; ;) {
        if (reading.isEnd()) break;
        const next = reading.next();
        const floatStart = next === '.' && isFloating === false;
        const floatEnd = next === 'f' && isFloating;
        if (isDigit(next) || floatStart || floatEnd) {
            reading.stepFor(1);
            if (floatStart) isFloating = true;
            if (floatEnd) break;
        } else break;
    }

    if (start === reading.getCursor()) return undefined;

    location.end = reading.copyHead();
    return {
        kind: TokenKind.Number,
        text: reading.substrFrom(start),
        location: location,
        highlight: dummyHighlight(HighlightTokenKind.Number, HighlightModifierKind.Invalid)
    };
}

// 文字列解析
function tryString(reading: TokenizingState, location: LocationInfo): TokenString | undefined {

    const start = reading.getCursor();
    if (reading.next() !== '\'' && reading.next() !== '"') return undefined;
    const startQuote: '\'' | '"' | '"""' = (() => {
        if (reading.isNext('"""')) return '"""';
        else if (reading.isNext('"')) return '"';
        return '\'';
    })();
    reading.stepFor(startQuote.length);

    let isEscaping = false;
    for (; ;) {
        if (reading.isEnd()) break;

        if (startQuote !== '"""' && reading.isNextWrap()) {
            diagnostic.addError({
                start: reading.copyHead(),
                end: reading.copyHead(),
            }, 'Missing end quote ' + startQuote);
            break;
        } else if (isEscaping === false && reading.isNext(startQuote)) {
            reading.stepFor(startQuote.length);
            break;
        } else {
            if (reading.next() === '\\' && isEscaping === false) {
                isEscaping = true;
            } else {
                isEscaping = false;
            }
            reading.stepNext();
        }
    }

    location.end = reading.copyHead();
    return {
        kind: TokenKind.String,
        text: reading.substrFrom(start),
        location: location,
        highlight: dummyHighlight(HighlightTokenKind.String, HighlightModifierKind.Invalid)
    };
}

// 記号解析
function tryMark(reading: TokenizingState, location: LocationInfo): TokenReserved | undefined {
    const mark = findReservedMarkProperty(reading.content, reading.getCursor());
    if (mark === undefined) return undefined;
    reading.stepFor(mark.key.length);

    location.end = reading.copyHead();
    return createTokenReserved(mark.key, mark.value, location);
}

function createTokenReserved(text: string, property: ReservedWordProperty, location: LocationInfo): TokenReserved {
    return {
        kind: TokenKind.Reserved,
        text: text,
        property: property,
        location: location,
        highlight: dummyHighlight(HighlightTokenKind.Keyword, HighlightModifierKind.Invalid)
    };
}

// 識別子解析
function tryIdentifier(reading: TokenizingState, location: LocationInfo): TokenizingToken | TokenIdentifier | undefined {
    const start = reading.getCursor();
    while (reading.isEnd() === false && isAlphanumeric(reading.next())) {
        reading.stepFor(1);
    }

    const identifier = reading.substrFrom(start);
    if (identifier === "") return undefined;

    location.end = reading.copyHead();

    const reserved = findReservedKeywordProperty(identifier);
    if (reserved !== undefined) return createTokenReserved(identifier, reserved, location);
    return createTokenIdentifier(identifier, location);
}

function createTokenIdentifier(identifier: string, location: LocationInfo): TokenIdentifier {
    return {
        kind: TokenKind.Identifier,
        text: identifier,
        location: location,
        highlight: dummyHighlight(HighlightTokenKind.Variable, HighlightModifierKind.Invalid)
    };
}

function dummyHighlight(token: HighlightTokenKind, modifier: HighlightModifierKind): HighlightInfo {
    return {
        token: token,
        modifier: modifier,
    };
}

export function tokenize(str: string, path: string): TokenizingToken[] {
    const tokens: TokenizingToken[] = [];
    const reading = new TokenizingState(str);
    const unknownBuffer = new UnknownBuffer();

    for (; ;) {
        if (reading.isEnd()) break;
        if (reading.isNextWrap()
            || reading.isNextWhitespace()) {
            reading.stepNext();
            continue;
        }

        const location: LocationInfo = {
            start: reading.copyHead(),
            end: reading.copyHead(),
            path: path
        };

        // コメント
        const triedComment = tryComment(reading, location);
        if (triedComment !== undefined) {
            tokens.push(triedComment);
            continue;
        }

        // 数値
        const triedNumber = tryNumber(reading, location);
        if (triedNumber !== undefined) {
            tokens.push(triedNumber);
            continue;
        }

        // 文字列
        const triedString = tryString(reading, location);
        if (triedString !== undefined) {
            tokens.push(triedString);
            continue;
        }

        // 記号
        const triedMark = tryMark(reading, location);
        if (triedMark !== undefined) {
            tokens.push(triedMark);
            continue;
        }

        // 識別子
        const triedIdentifier = tryIdentifier(reading, location);
        if (triedIdentifier !== undefined) {
            tokens.push(triedIdentifier);
            continue;
        }

        unknownBuffer.append(location, reading.next());
        reading.stepNext();
    }

    unknownBuffer.flush();
    return tokens;
}

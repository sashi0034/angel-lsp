import {HighlightModifier, HighlightToken} from "../code/highlight";
import {
    HighlightInfo,
    NumberLiterals,
    ReadonlyLocationInfo,
    ReservedWordProperty,
    TokenComment,
    TokenIdentifier,
    TokenizedToken,
    TokenKind,
    TokenNumber,
    TokenReserved,
    TokenString
} from "./tokens";
import {diagnostic} from "../code/diagnostic";
import {TokenizerState, UnknownBuffer} from "./tokenizerState";
import {findReservedKeywordProperty, findReservedWeakMarkProperty} from "./tokenReservedWords";
import {Position, Range} from "vscode-languageserver";

function isDigit(c: string): boolean {
    return /^[0-9]$/.test(c);
}

function isBinChara(c: string): boolean {
    return /^[01]$/.test(c);
}

function isOctChara(c: string): boolean {
    return /^[0-7]$/.test(c);
}

function isHexChar(c: string): boolean {
    return /^[0-9a-f]$/.test(c);
}

function isAlphanumeric(c: string): boolean {
    return /^[A-Za-z0-9_]$/.test(c);
}

function copyLocationWithNewEnd(location: ReadonlyLocationInfo, end: Position): ReadonlyLocationInfo {
    return {
        path: location.path,
        start: location.start,
        end: end,
    };
}

// Check comment token | コメント解析
function tryComment(reading: TokenizerState, location: ReadonlyLocationInfo): TokenComment | undefined {
    if (reading.isNext('//')) {
        return tokenizeLineComment(reading, location);
    } else if (reading.isNext('/*')) {
        return tokenizeBlockComment(reading, location);
    }
    return undefined;
}

function createTokenComment(comment: string, location: ReadonlyLocationInfo): TokenComment | undefined {
    return {
        kind: TokenKind.Comment,
        text: comment,
        location: location,
        highlight: createHighlight(HighlightToken.Comment, HighlightModifier.Nothing)
    };
}

function tokenizeLineComment(reading: TokenizerState, location: ReadonlyLocationInfo) {
    const start = reading.getCursor();
    reading.stepFor(2);
    for (; ;) {
        if (reading.isEnd() || reading.isNextWrap()) break;
        reading.stepNext();
    }

    return createTokenComment(reading.substrFrom(start), copyLocationWithNewEnd(location, reading.copyHead()));
}

function tokenizeBlockComment(reading: TokenizerState, location: ReadonlyLocationInfo) {
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

    return createTokenComment(reading.substrFrom(start), copyLocationWithNewEnd(location, reading.copyHead()));
}

// Check number token | 数値解析
function tryNumber(reading: TokenizerState, location: ReadonlyLocationInfo): TokenNumber | undefined {
    const start = reading.getCursor();

    const numeric = consumeNumber(reading);

    if (start === reading.getCursor()) return undefined;

    return {
        kind: TokenKind.Number,
        text: reading.substrFrom(start),
        location: copyLocationWithNewEnd(location, reading.copyHead()),
        highlight: createHighlight(HighlightToken.Number, HighlightModifier.Nothing),
        numeric: numeric
    };
}

function consumeNumber(reading: TokenizerState) {
    if (/^[0-9.]/.test(reading.next()) === false) return NumberLiterals.Integer;

    if (reading.next(0) === '0') {
        if (/^[bB]$/.test(reading.next(1))) {
            reading.stepFor(2);
            while (reading.isEnd() === false && isBinChara(reading.next())) reading.stepNext();
            return NumberLiterals.Integer;
        } else if (/^[oO]$/.test(reading.next(1))) {
            reading.stepFor(2);
            while (reading.isEnd() === false && isOctChara(reading.next())) reading.stepNext();
            return NumberLiterals.Integer;
        } else if (/^[dD]$/.test(reading.next(1))) {
            reading.stepFor(2);
            while (reading.isEnd() === false && isDigit(reading.next())) reading.stepNext();
            return NumberLiterals.Integer;
        } else if (/^[xX]$/.test(reading.next(1))) {
            reading.stepFor(2);
            while (reading.isEnd() === false && isHexChar(reading.next())) reading.stepNext();
            return NumberLiterals.Integer;
        }
    }

    // Read 0-9 | 0-9 を読み取る
    while (reading.isEnd() === false && isDigit(reading.next())) reading.stepNext();

    let numeric = NumberLiterals.Integer;

    // Check decimal point | 小数点を確認
    let f = 0;
    if (reading.next() === '.') {
        f++;
        while (isDigit(reading.next(f))) f++;
        numeric = NumberLiterals.Double;
    }

    // Check exponent | 指数を確認
    if (/^[eE]$/.test(reading.next(f)) && /^[+-]$/.test(reading.next(f + 1)) && isDigit(reading.next(f + 2))) {
        f += 3;
        while (isDigit(reading.next(f))) f++;
        numeric = NumberLiterals.Double;
    }

    if (f > 1) {
        reading.stepFor(f);

        // Check half precision floating point | 半精度浮動小数と認識
        if (numeric === NumberLiterals.Double) {
            if (/^[fF]$/.test(reading.next())) {
                reading.stepNext();
                return NumberLiterals.Float;
            }
        }
    }

    return numeric;
}

// Check string token | 文字列解析
function tryString(reading: TokenizerState, location: ReadonlyLocationInfo): TokenString | undefined {

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

    return {
        kind: TokenKind.String,
        text: reading.substrFrom(start),
        location: copyLocationWithNewEnd(location, reading.copyHead()),
        highlight: createHighlight(HighlightToken.String, HighlightModifier.Nothing)
    };
}

// Check mark token | 記号解析
function tryMark(reading: TokenizerState, location: ReadonlyLocationInfo): TokenReserved | undefined {
    const mark = findReservedWeakMarkProperty(reading.content, reading.getCursor());
    if (mark === undefined) return undefined;

    reading.stepFor(mark.key.length);

    return createTokenReserved(mark.key, mark.value, copyLocationWithNewEnd(location, reading.copyHead()));
}

function createTokenReserved(text: string, property: ReservedWordProperty, location: ReadonlyLocationInfo): TokenReserved {
    return {
        kind: TokenKind.Reserved,
        text: text,
        property: property,
        location: location,
        highlight: createHighlight(HighlightToken.Keyword, HighlightModifier.Nothing)
    };
}

// Check identifier token | 識別子解析
function tryIdentifier(reading: TokenizerState, location: ReadonlyLocationInfo): TokenizedToken | TokenIdentifier | undefined {
    const start = reading.getCursor();
    while (reading.isEnd() === false && isAlphanumeric(reading.next())) {
        reading.stepFor(1);
    }

    const identifier = reading.substrFrom(start);
    if (identifier === "") return undefined;

    const tokenLocation = copyLocationWithNewEnd(location, reading.copyHead());

    const reserved = findReservedKeywordProperty(identifier);
    if (reserved !== undefined) return createTokenReserved(identifier, reserved, tokenLocation);
    return createTokenIdentifier(identifier, tokenLocation);
}

function createTokenIdentifier(identifier: string, location: ReadonlyLocationInfo): TokenIdentifier {
    return {
        kind: TokenKind.Identifier,
        text: identifier,
        location: location,
        highlight: createHighlight(HighlightToken.Variable, HighlightModifier.Nothing)
    };
}

function createHighlight(token: HighlightToken, modifier: HighlightModifier): HighlightInfo {
    return {
        token: token,
        modifier: modifier,
    };
}

export function tokenize(str: string, path: string): TokenizedToken[] {
    const tokens: TokenizedToken[] = [];
    const reading = new TokenizerState(str);
    const unknownBuffer = new UnknownBuffer();

    for (; ;) {
        if (reading.isEnd()) break;
        if (reading.isNextWrap()
            || reading.isNextWhitespace()) {
            reading.stepNext();
            continue;
        }

        const location: ReadonlyLocationInfo = {
            start: reading.copyHead(),
            end: reading.copyHead(),
            path: path
        };

        // Tokenize: Comment
        const triedComment = tryComment(reading, location);
        if (triedComment !== undefined) {
            tokens.push(triedComment);
            continue;
        }

        // Tokenize: Number
        const triedNumber = tryNumber(reading, location);
        if (triedNumber !== undefined) {
            tokens.push(triedNumber);
            continue;
        }

        // Tokenize: String
        const triedString = tryString(reading, location);
        if (triedString !== undefined) {
            tokens.push(triedString);
            continue;
        }

        // Tokenize: Non-alphabetic symbol
        const triedMark = tryMark(reading, location);
        if (triedMark !== undefined) {
            tokens.push(triedMark);
            continue;
        }

        // Tokenize: Identifier or reserved keyword
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

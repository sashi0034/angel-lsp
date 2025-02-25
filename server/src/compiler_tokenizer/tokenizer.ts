import {HighlightModifier, HighlightToken} from "../code/highlight";
import {
    HighlightInfo,
    NumberLiterals,
    TokenComment,
    TokenIdentifier,
    TokenObject,
    TokenKind,
    TokenNumber,
    TokenReserved,
    TokenString
} from "./tokenObject";
import {diagnostic} from "../code/diagnostic";
import {TokenizerState, UnknownBuffer} from "./tokenizerState";
import {findReservedKeywordProperty, findReservedWeakMarkProperty, ReservedWordProperty} from "./reservedWord";
import {TextLocation, TextPosition} from "./textLocation";

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
    return /^[A-Fa-f0-9]$/.test(c);
}

function isAlphanumeric(c: string): boolean {
    return /^[A-Za-z0-9_]$/.test(c);
}

// Check if the next token is a comment and tokenize it.
function tryComment(tokenizer: TokenizerState, location: TextLocation): TokenComment | undefined {
    if (tokenizer.isNext('//')) {
        return tokenizeLineComment(tokenizer, location);
    } else if (tokenizer.isNext('/*')) {
        return tokenizeBlockComment(tokenizer, location);
    }
    return undefined;
}

function tokenizeLineComment(tokenizer: TokenizerState, location: TextLocation) {
    const start = tokenizer.getCursor();
    tokenizer.stepFor(2);
    for (; ;) {
        if (tokenizer.isEnd() || tokenizer.isNextWrap()) break;
        tokenizer.stepNext();
    }

    return new TokenComment(tokenizer.substrFrom(start), location.withEnd(tokenizer.copyHead()));
}

function tokenizeBlockComment(tokenizer: TokenizerState, location: TextLocation) {
    const start = tokenizer.getCursor();
    tokenizer.stepFor(2);
    for (; ;) {
        if (tokenizer.isEnd()) break;
        if (tokenizer.isNext('*/')) {
            tokenizer.stepFor(2);
            break;
        }
        tokenizer.stepNext();
    }

    return new TokenComment(tokenizer.substrFrom(start), location.withEnd(tokenizer.copyHead()));
}

// Check if the next token is a number and tokenize it.
function tryNumber(tokenizer: TokenizerState, location: TextLocation): TokenNumber | undefined {
    const start = tokenizer.getCursor();

    const numeric = consumeNumber(tokenizer);

    if (start === tokenizer.getCursor()) return undefined;

    return new TokenNumber(
        tokenizer.substrFrom(start),
        location.withEnd(tokenizer.copyHead()),
        numeric);
}

function consumeNumber(tokenizer: TokenizerState) {
    // Fails if the next token is not a number or a dot.
    if (/^[0-9.]/.test(tokenizer.next()) === false) return NumberLiterals.Integer;

    // Fails if the next tokens are '.f' or '.F'
    if (tokenizer.next(0) === '.' && /^[fF]$/.test(tokenizer.next(1))) return NumberLiterals.Integer;

    if (tokenizer.next(0) === '0') {
        if (/^[bB]$/.test(tokenizer.next(1))) {
            tokenizer.stepFor(2);
            while (tokenizer.isEnd() === false && isBinChara(tokenizer.next())) tokenizer.stepNext();
            return NumberLiterals.Integer;
        } else if (/^[oO]$/.test(tokenizer.next(1))) {
            tokenizer.stepFor(2);
            while (tokenizer.isEnd() === false && isOctChara(tokenizer.next())) tokenizer.stepNext();
            return NumberLiterals.Integer;
        } else if (/^[dD]$/.test(tokenizer.next(1))) {
            tokenizer.stepFor(2);
            while (tokenizer.isEnd() === false && isDigit(tokenizer.next())) tokenizer.stepNext();
            return NumberLiterals.Integer;
        } else if (/^[xX]$/.test(tokenizer.next(1))) {
            tokenizer.stepFor(2);
            while (tokenizer.isEnd() === false && isHexChar(tokenizer.next())) tokenizer.stepNext();
            return NumberLiterals.Integer;
        }
    }

    // Read until it is 0-9.
    while (tokenizer.isEnd() === false && isDigit(tokenizer.next())) tokenizer.stepNext();

    let numeric = NumberLiterals.Integer;

    // Check if it is a floating point number
    let f = 0;
    if (tokenizer.next() === '.') {
        f++;
        while (isDigit(tokenizer.next(f))) f++;
        numeric = NumberLiterals.Double;
    }

    // Check if it has an exponent
    // e.g. 1e+3, 1E-3
    if (/^[eE]$/.test(tokenizer.next(f)) && /^[+-]$/.test(tokenizer.next(f + 1)) && isDigit(tokenizer.next(f + 2))) {
        f += 3;
        while (isDigit(tokenizer.next(f))) f++;
        numeric = NumberLiterals.Double;
    }

    if (f >= 1) {
        tokenizer.stepFor(f);

        // Check half precision floating point
        if (numeric === NumberLiterals.Double) {
            if (/^[fF]$/.test(tokenizer.next())) {
                tokenizer.stepNext();
                return NumberLiterals.Float;
            }
        }
    }

    return numeric;
}

// Check if the next token is a string and tokenize it.
function tryString(tokenizer: TokenizerState, location: TextLocation): TokenString | undefined {

    const start = tokenizer.getCursor();
    if (tokenizer.next() !== '\'' && tokenizer.next() !== '"') return undefined;
    const startQuote: '\'' | '"' | '"""' = (() => {
        if (tokenizer.isNext('"""')) return '"""';
        else if (tokenizer.isNext('"')) return '"';
        return '\'';
    })();
    tokenizer.stepFor(startQuote.length);

    let isEscaping = false;
    for (; ;) {
        if (tokenizer.isEnd()) break;

        if (startQuote !== '"""' && tokenizer.isNextWrap()) {
            diagnostic.addError({
                start: tokenizer.copyHead(),
                end: tokenizer.copyHead(),
            }, 'Missing end quote ' + startQuote);
            break;
        } else if (isEscaping === false && tokenizer.isNext(startQuote)) {
            tokenizer.stepFor(startQuote.length);
            break;
        } else {
            if (tokenizer.next() === '\\' && isEscaping === false) {
                isEscaping = true;
            } else {
                isEscaping = false;
            }
            tokenizer.stepNext();
        }
    }

    return new TokenString(tokenizer.substrFrom(start), location.withEnd(tokenizer.copyHead()));
}

// Check if the next token is a mark and tokenize it.
function tryMark(tokenizer: TokenizerState, location: TextLocation): TokenReserved | undefined {
    const mark = findReservedWeakMarkProperty(tokenizer.content, tokenizer.getCursor());
    if (mark === undefined) return undefined;

    tokenizer.stepFor(mark.key.length);

    return createTokenReserved(mark.key, mark.value, location.withEnd(tokenizer.copyHead()));
}

function createTokenReserved(text: string, property: ReservedWordProperty, location: TextLocation): TokenReserved {
    return new TokenReserved(text, location, property);
}

// Check if the next token is an identifier and tokenize it.
function tryIdentifier(tokenizer: TokenizerState, location: TextLocation): TokenObject | TokenIdentifier | undefined {
    const start = tokenizer.getCursor();
    while (tokenizer.isEnd() === false && isAlphanumeric(tokenizer.next())) {
        tokenizer.stepFor(1);
    }

    const identifier = tokenizer.substrFrom(start);
    if (identifier === "") return undefined;

    const tokenLocation = location.withEnd(tokenizer.copyHead());

    const reserved = findReservedKeywordProperty(identifier);
    if (reserved !== undefined) return createTokenReserved(identifier, reserved, tokenLocation);
    return new TokenIdentifier(identifier, tokenLocation);
}

function createHighlight(token: HighlightToken, modifier: HighlightModifier): HighlightInfo {
    return {
        token: token,
        modifier: modifier,
    };
}

/**
 * The entry point for the tokenizer.
 * @param content The content of the file to tokenize.
 * @param path The path of the file to tokenize.
 */
export function tokenize(content: string, path: string): TokenObject[] {
    const tokens: TokenObject[] = [];
    const tokenizer = new TokenizerState(content);
    const unknownBuffer = new UnknownBuffer();

    for (; ;) {
        if (tokenizer.isEnd()) break;
        if (tokenizer.isNextWrap()
            || tokenizer.isNextWhitespace()) {
            tokenizer.stepNext();
            continue;
        }

        const location: TextLocation = new TextLocation(
            path,
            tokenizer.copyHead(),
            tokenizer.copyHead(),
        );

        // Tokenize Comment
        const triedComment = tryComment(tokenizer, location);
        if (triedComment !== undefined) {
            tokens.push(triedComment);
            continue;
        }

        // Tokenize Number
        const triedNumber = tryNumber(tokenizer, location);
        if (triedNumber !== undefined) {
            tokens.push(triedNumber);
            continue;
        }

        // Tokenize String
        const triedString = tryString(tokenizer, location);
        if (triedString !== undefined) {
            tokens.push(triedString);
            continue;
        }

        // Tokenize Non-alphabetic Symbol
        const triedMark = tryMark(tokenizer, location);
        if (triedMark !== undefined) {
            tokens.push(triedMark);
            continue;
        }

        // Tokenize Identifier or Reserved Keyword
        const triedIdentifier = tryIdentifier(tokenizer, location);
        if (triedIdentifier !== undefined) {
            tokens.push(triedIdentifier);
            continue;
        }

        unknownBuffer.append(location, tokenizer.next());
        tokenizer.stepNext();
    }

    unknownBuffer.flush();
    return tokens;
}

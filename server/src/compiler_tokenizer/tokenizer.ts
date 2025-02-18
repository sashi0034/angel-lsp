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
import {Position} from "vscode-languageserver";

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

function copyLocationWithNewEnd(location: ReadonlyLocationInfo, end: Position): ReadonlyLocationInfo {
    return {
        path: location.path,
        start: location.start,
        end: end,
    };
}

// Check if the next token is a comment and tokenize it.
function tryComment(tokenizer: TokenizerState, location: ReadonlyLocationInfo): TokenComment | undefined {
    if (tokenizer.isNext('//')) {
        return tokenizeLineComment(tokenizer, location);
    } else if (tokenizer.isNext('/*')) {
        return tokenizeBlockComment(tokenizer, location);
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

function tokenizeLineComment(tokenizer: TokenizerState, location: ReadonlyLocationInfo) {
    const start = tokenizer.getCursor();
    tokenizer.stepFor(2);
    for (; ;) {
        if (tokenizer.isEnd() || tokenizer.isNextWrap()) break;
        tokenizer.stepNext();
    }

    return createTokenComment(tokenizer.substrFrom(start), copyLocationWithNewEnd(location, tokenizer.copyHead()));
}

function tokenizeBlockComment(tokenizer: TokenizerState, location: ReadonlyLocationInfo) {
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

    return createTokenComment(tokenizer.substrFrom(start), copyLocationWithNewEnd(location, tokenizer.copyHead()));
}

// Check if the next token is a number and tokenize it.
function tryNumber(tokenizer: TokenizerState, location: ReadonlyLocationInfo): TokenNumber | undefined {
    const start = tokenizer.getCursor();

    const numeric = consumeNumber(tokenizer);

    if (start === tokenizer.getCursor()) return undefined;

    return {
        kind: TokenKind.Number,
        text: tokenizer.substrFrom(start),
        location: copyLocationWithNewEnd(location, tokenizer.copyHead()),
        highlight: createHighlight(HighlightToken.Number, HighlightModifier.Nothing),
        numeric: numeric
    };
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
function tryString(tokenizer: TokenizerState, location: ReadonlyLocationInfo): TokenString | undefined {

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

    return {
        kind: TokenKind.String,
        text: tokenizer.substrFrom(start),
        location: copyLocationWithNewEnd(location, tokenizer.copyHead()),
        highlight: createHighlight(HighlightToken.String, HighlightModifier.Nothing)
    };
}

// Check if the next token is a mark and tokenize it.
function tryMark(tokenizer: TokenizerState, location: ReadonlyLocationInfo): TokenReserved | undefined {
    const mark = findReservedWeakMarkProperty(tokenizer.content, tokenizer.getCursor());
    if (mark === undefined) return undefined;

    tokenizer.stepFor(mark.key.length);

    return createTokenReserved(mark.key, mark.value, copyLocationWithNewEnd(location, tokenizer.copyHead()));
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

// Check if the next token is an identifier and tokenize it.
function tryIdentifier(tokenizer: TokenizerState, location: ReadonlyLocationInfo): TokenizedToken | TokenIdentifier | undefined {
    const start = tokenizer.getCursor();
    while (tokenizer.isEnd() === false && isAlphanumeric(tokenizer.next())) {
        tokenizer.stepFor(1);
    }

    const identifier = tokenizer.substrFrom(start);
    if (identifier === "") return undefined;

    const tokenLocation = copyLocationWithNewEnd(location, tokenizer.copyHead());

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

/**
 * The entry point for the tokenizer.
 * @param content The content of the file to tokenize.
 * @param path The path of the file to tokenize.
 */
export function tokenize(content: string, path: string): TokenizedToken[] {
    const tokens: TokenizedToken[] = [];
    const tokenizer = new TokenizerState(content);
    const unknownBuffer = new UnknownBuffer();

    for (; ;) {
        if (tokenizer.isEnd()) break;
        if (tokenizer.isNextWrap()
            || tokenizer.isNextWhitespace()) {
            tokenizer.stepNext();
            continue;
        }

        const location: ReadonlyLocationInfo = {
            start: tokenizer.copyHead(),
            end: tokenizer.copyHead(),
            path: path
        };

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

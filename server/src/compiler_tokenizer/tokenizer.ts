import {
    NumberLiteral,
    CommentToken,
    IdentifierToken,
    TokenObject,
    NumberToken,
    ReservedToken,
    StringToken
} from './tokenObject';
import {diagnostic} from '../core/diagnostic';
import {TokenizerState, UnknownTokenBuffer} from './tokenizerState';
import {findReservedKeywordProperty, findReservedAtomicMarkProperty, ReservedWordProperty} from './reservedWord';
import {TextLocation} from './textLocation';
import {getGlobalSettings} from '../core/settings';

// Tokenizer satisfies this interface.
interface CharReader {
    peek(offset?: number): string;
}

function isDigitOfRadix(regex: RegExp, reader: CharReader, offset = 0): boolean {
    const next = reader.peek(offset);

    if (regex.test(next)) {
        return true;
    } else if (getGlobalSettings().supportsDigitSeparators && /^'$/.test(next)) {
        // Separators are OK if the next digit is valid
        return regex.test(reader.peek(offset + 1));
    }

    return false;
}

function isDigit(reader: CharReader, offset = 0): boolean {
    return isDigitOfRadix(/^[0-9]$/, reader, offset);
}

function isBinChara(reader: CharReader, offset = 0): boolean {
    return isDigitOfRadix(/^[01]$/, reader, offset);
}

function isOctChara(reader: CharReader, offset = 0): boolean {
    return isDigitOfRadix(/^[0-7]$/, reader, offset);
}

function isHexChar(reader: CharReader, offset = 0): boolean {
    return isDigitOfRadix(/^[A-Fa-f0-9]$/, reader, offset);
}

// Check if the next token is a comment and tokenize it.
function tryComment(tokenizer: TokenizerState, location: TextLocation): CommentToken | undefined {
    if (tokenizer.startsWith('//')) {
        return tokenizeLineComment(tokenizer, location);
    } else if (tokenizer.startsWith('/*')) {
        return tokenizeBlockComment(tokenizer, location);
    }

    return undefined;
}

function tokenizeLineComment(tokenizer: TokenizerState, location: TextLocation) {
    const start = tokenizer.getCursorOffset();
    tokenizer.advanceBy(2);
    for (;;) {
        if (tokenizer.isEnd() || tokenizer.isNextLineBreak()) {
            break;
        }

        tokenizer.advance();
    }

    return new CommentToken(tokenizer.sliceFrom(start), location.withEnd(tokenizer.getCursorPosition()));
}

function tokenizeBlockComment(tokenizer: TokenizerState, location: TextLocation) {
    const start = tokenizer.getCursorOffset();
    tokenizer.advanceBy(2);
    for (;;) {
        if (tokenizer.isEnd()) {
            break;
        }

        if (tokenizer.startsWith('*/')) {
            tokenizer.advanceBy(2);
            break;
        }

        tokenizer.advance();
    }

    return new CommentToken(tokenizer.sliceFrom(start), location.withEnd(tokenizer.getCursorPosition()));
}

// Check if the next token is a number and tokenize it.
function tryNumber(tokenizer: TokenizerState, location: TextLocation): NumberToken | undefined {
    const start = tokenizer.getCursorOffset();

    const numberLiteral = consumeNumber(tokenizer);

    if (start === tokenizer.getCursorOffset()) {
        return undefined;
    }

    return new NumberToken(tokenizer.sliceFrom(start), location.withEnd(tokenizer.getCursorPosition()), numberLiteral);
}

function consumeNumber(tokenizer: TokenizerState) {
    // Fails if the next token is not a number or a dot.
    if (/^[0-9.]/.test(tokenizer.peek()) === false) {
        return NumberLiteral.Integer;
    }

    // Fails if a leading dot is not followed by a digit.
    if (tokenizer.peek() === '.' && isDigit(tokenizer, 1) === false) {
        return NumberLiteral.Integer;
    }

    if (tokenizer.peek(0) === '0') {
        if (/^[bB]$/.test(tokenizer.peek(1))) {
            tokenizer.advanceBy(2);
            while (tokenizer.isEnd() === false && isBinChara(tokenizer)) {
                tokenizer.advance();
            }

            return NumberLiteral.Integer;
        } else if (/^[oO]$/.test(tokenizer.peek(1))) {
            tokenizer.advanceBy(2);
            while (tokenizer.isEnd() === false && isOctChara(tokenizer)) {
                tokenizer.advance();
            }

            return NumberLiteral.Integer;
        } else if (/^[dD]$/.test(tokenizer.peek(1))) {
            tokenizer.advanceBy(2);
            while (tokenizer.isEnd() === false && isDigit(tokenizer)) {
                tokenizer.advance();
            }

            return NumberLiteral.Integer;
        } else if (/^[xX]$/.test(tokenizer.peek(1))) {
            tokenizer.advanceBy(2);
            while (tokenizer.isEnd() === false && isHexChar(tokenizer)) {
                tokenizer.advance();
            }

            return NumberLiteral.Integer;
        }
    }

    // Read until it is 0-9.
    while (tokenizer.isEnd() === false && isDigit(tokenizer)) {
        tokenizer.advance();
    }

    let numberLiteral = NumberLiteral.Integer;

    // Check if it is a floating point number
    let f = 0;
    if (tokenizer.peek() === '.') {
        f++;
        while (isDigit(tokenizer, f)) {
            f++;
        }

        numberLiteral = NumberLiteral.Double;
    }

    // Check if it has an exponent
    // e.g., 1e+3, 1E-3
    if (/^[eE]$/.test(tokenizer.peek(f))) {
        const case1 = isDigit(tokenizer, f + 1); // e.g., 1e2
        const case2 = !case1 && /^[+-]$/.test(tokenizer.peek(f + 1)) && isDigit(tokenizer, f + 2); // e.g., 1e+3
        if (case1 || case2) {
            f += case1 ? 2 : 3;
            while (isDigit(tokenizer, f)) {
                f++;
            }

            numberLiteral = NumberLiteral.Double;
        }
    }

    if (f >= 1) {
        tokenizer.advanceBy(f);

        // Check half precision floating point
        if (numberLiteral === NumberLiteral.Double) {
            if (/^[fF]$/.test(tokenizer.peek())) {
                tokenizer.advance();
                return NumberLiteral.Float;
            }
        }
    }

    return numberLiteral;
}

// Check if the next token is a string and tokenize it.
function tryString(tokenizer: TokenizerState, location: TextLocation): StringToken | undefined {
    const start = tokenizer.getCursorOffset();
    if (tokenizer.peek() !== "'" && tokenizer.peek() !== '"') {
        return undefined;
    }

    const startQuote: "'" | '"' | '"""' = (() => {
        if (tokenizer.startsWith('"""')) {
            return '"""';
        } else if (tokenizer.startsWith('"')) {
            return '"';
        }

        return "'";
    })();
    tokenizer.advanceBy(startQuote.length);

    let isEscaping = false;
    for (;;) {
        if (tokenizer.isEnd()) {
            break;
        }

        if (startQuote !== '"""' && tokenizer.isNextLineBreak()) {
            diagnostic.error(
                {
                    start: tokenizer.getCursorPosition(),
                    end: tokenizer.getCursorPosition()
                },
                'Missing closing quote ' + startQuote
            );
            break;
        } else if (isEscaping === false && tokenizer.startsWith(startQuote)) {
            tokenizer.advanceBy(startQuote.length);
            break;
        } else {
            if (tokenizer.peek() === '\\' && isEscaping === false) {
                isEscaping = true;
            } else {
                isEscaping = false;
            }

            tokenizer.advance();
        }
    }

    return new StringToken(tokenizer.sliceFrom(start), location.withEnd(tokenizer.getCursorPosition()));
}

// Check if the next token is a mark and tokenize it.
function tryMark(tokenizer: TokenizerState, location: TextLocation): ReservedToken | undefined {
    const mark = findReservedAtomicMarkProperty(tokenizer._fileContent, tokenizer.getCursorOffset());
    if (mark === undefined) {
        return undefined;
    }

    tokenizer.advanceBy(mark.key.length);

    return createTokenReserved(mark.key, mark.value, location.withEnd(tokenizer.getCursorPosition()));
}

function createTokenReserved(text: string, property: ReservedWordProperty, location: TextLocation): ReservedToken {
    return new ReservedToken(text, location, property);
}

function isAlphanumeric(reader: CharReader, offset = 0): boolean {
    return /^[A-Za-z0-9_]$/.test(reader.peek(offset));
}

function isUnicodeCharacter(reader: CharReader, offset = 0): boolean {
    // AngelScript accept identifiers that contain characters with byte value higher than 127.
    const code = reader.peek(offset).charCodeAt(0);
    return code >= 0x80;
}

function isIdentifierCharacter(reader: CharReader, offset = 0): boolean {
    if (isAlphanumeric(reader, offset)) {
        return true;
    }

    if (getGlobalSettings().allowUnicodeIdentifiers && isUnicodeCharacter(reader, offset)) {
        return true;
    }

    return false;
}

// Check if the next token is an identifier and tokenize it.
function tryIdentifier(tokenizer: TokenizerState, location: TextLocation): TokenObject | IdentifierToken | undefined {
    const start = tokenizer.getCursorOffset();
    while (tokenizer.isEnd() === false && isIdentifierCharacter(tokenizer)) {
        tokenizer.advanceBy(1);
    }

    const identifier = tokenizer.sliceFrom(start);
    if (identifier === '') {
        return undefined;
    }

    const tokenLocation = location.withEnd(tokenizer.getCursorPosition());

    const reserved = findReservedKeywordProperty(identifier);
    if (reserved !== undefined) {
        return createTokenReserved(identifier, reserved, tokenLocation);
    }

    return new IdentifierToken(identifier, tokenLocation);
}

/**
 * The entry point for the tokenizer.
 * @param path The path of the file to tokenize.
 * @param content The content of the file to tokenize.
 */
export function tokenize(path: string, content: string): TokenObject[] {
    const tokens: TokenObject[] = [];
    const tokenizer = new TokenizerState(content);
    const unknownTokenBuffer = new UnknownTokenBuffer();

    for (;;) {
        if (tokenizer.isEnd()) {
            break;
        }

        if (tokenizer.isNextLineBreak() || tokenizer.isNextWhitespace()) {
            tokenizer.advance();
            continue;
        }

        const location: TextLocation = new TextLocation(
            path,
            tokenizer.getCursorPosition(),
            tokenizer.getCursorPosition()
        );

        // Tokenize a comment
        const triedComment = tryComment(tokenizer, location);
        if (triedComment !== undefined) {
            tokens.push(triedComment);
            continue;
        }

        // Tokenize a number
        const triedNumber = tryNumber(tokenizer, location);
        if (triedNumber !== undefined) {
            tokens.push(triedNumber);
            continue;
        }

        // Tokenize a string
        const triedString = tryString(tokenizer, location);
        if (triedString !== undefined) {
            tokens.push(triedString);
            continue;
        }

        // Tokenize a non-alphabetic symbol
        const triedMark = tryMark(tokenizer, location);
        if (triedMark !== undefined) {
            tokens.push(triedMark);
            continue;
        }

        // Tokenize an identifier or reserved keyword
        const triedIdentifier = tryIdentifier(tokenizer, location);
        if (triedIdentifier !== undefined) {
            tokens.push(triedIdentifier);
            continue;
        }

        // If the token is unknown, buffer it.
        unknownTokenBuffer.append(location, tokenizer.peek());
        tokenizer.advance();
    }

    // -----------------------------------------------

    unknownTokenBuffer.flush();

    for (let i = 0; i < tokens.length; i++) {
        tokens[i].bindRawToken(tokens[i + 1]);
    }

    return tokens;
}

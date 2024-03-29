import {HighlightModifierKind, HighlightTokenKind} from "../code/highlight";
import {Trie} from "../utils/trie";
import {HighlightInfo, LocationInfo, TokenizingToken, TokenKind} from "./tokens";
import {diagnostic} from "../code/diagnostic";
import {TokenizingState} from "./tokenizingState";
import {findReservedKeywordProperty, findReservedMarkProperty} from "./tokenReserves";

function isDigit(str: string): boolean {
    return /^[0-9]$/.test(str);
}

function isAlnum(c: string): boolean {
    return /^[A-Za-z0-9_]$/.test(c);
}

function tryComment(reading: TokenizingState) {
    if (reading.isNext('//')) {
        reading.stepFor(2);
        let comment = '//';
        for (; ;) {
            if (reading.isEnd() || reading.isNextWrap()) break;
            comment += reading.next();
            reading.stepNext();
        }
        return comment;
    }
    if (reading.isNext('/*')) {
        reading.stepFor(2);
        let comment = '/*';
        for (; ;) {
            if (reading.isEnd()) break;
            if (reading.isNext('*/')) {
                comment += '*/';
                reading.stepFor(2);
                break;
            }
            if (reading.isNext('\r\n')) comment += '\r\n';
            else comment += reading.next();
            reading.stepNext();
        }
        return comment;
    }
    return '';
}

function tryMark(reading: TokenizingState) {
    const mark = findReservedMarkProperty(reading.content, reading.getCursor());
    if (mark === undefined) return undefined;
    reading.stepFor(mark.key.length);
    return mark;
}

// 数値解析
function tryNumber(reading: TokenizingState) {
    let result: string = "";
    let isFloating = false;

    for (; ;) {
        if (reading.isEnd()) break;
        const next = reading.next();
        const floatStart = next === '.' && isFloating === false;
        const floatEnd = next === 'f' && isFloating;
        if (isDigit(next) || floatStart || floatEnd) {
            result += next;
            reading.stepFor(1);
            if (floatStart) isFloating = true;
            if (floatEnd) break;
        } else break;
    }

    return result;
}

// 文字列解析
function tryString(reading: TokenizingState) {
    let result: string = "";
    if (reading.next() !== '\'' && reading.next() !== '"') return "";
    const startQuote: '\'' | '"' | '"""' = (() => {
        if (reading.isNext('"""')) return '"""';
        else if (reading.isNext('"')) return '"';
        return '\'';
    })();
    result += startQuote;
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
            result += startQuote;
            reading.stepFor(startQuote.length);
            break;
        } else {
            if (reading.next() === '\\' && isEscaping === false) {
                isEscaping = true;
            } else {
                isEscaping = false;
            }
            result += reading.next();
            reading.stepNext();
        }
    }

    return result;
}

function tryIdentifier(reading: TokenizingState) {
    let result: string = "";
    while (reading.isEnd() === false && isAlnum(reading.next())) {
        result += reading.next();
        reading.stepFor(1);
    }
    return result;
}

function dummyHighlight(token: HighlightTokenKind, modifier: HighlightModifierKind): HighlightInfo {
    return {
        token: token,
        modifier: modifier,
    };
}

// 英数字や記号以外の文字列のバッファ
class UnknownBuffer {
    private buffer: string = "";
    private location: LocationInfo | null = null;

    public append(head: LocationInfo, next: string) {
        if (this.location === null) this.location = head;
        else if (head.start.line !== this.location.start.line
            || head.start.character - this.location.end.character > 1) {
            this.flush();
            this.location = head;
        }
        this.location.end = head.end;
        this.buffer += next;
    }

    public flush() {
        if (this.buffer.length === 0) return;
        if (this.location === null) return;
        this.location.end.character++;
        diagnostic.addError(this.location, 'Unknown token: ' + this.buffer);
        this.buffer = "";
    }
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

        const location = {
            start: reading.copyHead(),
            end: reading.copyHead(),
            path: path
        };

        // コメント
        const triedComment = tryComment(reading);
        if (triedComment.length > 0) {
            location.end = reading.copyHead();
            tokens.push({
                kind: TokenKind.Comment,
                text: triedComment,
                location: location,
                highlight: dummyHighlight(HighlightTokenKind.Comment, HighlightModifierKind.Invalid)
            });
            continue;
        }

        // 数値
        const triedNumber = tryNumber(reading);
        if (triedNumber.length > 0) {
            location.end = reading.copyHead();
            tokens.push({
                kind: TokenKind.Number,
                text: triedNumber,
                location: location,
                highlight: dummyHighlight(HighlightTokenKind.Number, HighlightModifierKind.Invalid)
            });
            continue;
        }

        // 文字列
        const triedString = tryString(reading);
        if (triedString.length > 0) {
            location.end = reading.copyHead();
            tokens.push({
                kind: TokenKind.String,
                text: triedString,
                location: location,
                highlight: dummyHighlight(HighlightTokenKind.String, HighlightModifierKind.Invalid)
            });
            continue;
        }

        // 記号
        const triedMark = tryMark(reading);
        if (triedMark !== undefined) {
            location.end = reading.copyHead();
            tokens.push({
                kind: TokenKind.Reserved,
                text: triedMark.key,
                property: triedMark.value,
                location: location,
                highlight: dummyHighlight(HighlightTokenKind.Keyword, HighlightModifierKind.Invalid)
            });
            continue;
        }

        // 識別子
        const triedIdentifier = tryIdentifier(reading);
        if (triedIdentifier.length > 0) {
            location.end = reading.copyHead();
            const reserved = findReservedKeywordProperty(triedIdentifier);
            if (reserved !== undefined) {
                tokens.push({
                    kind: TokenKind.Reserved,
                    text: triedIdentifier,
                    property: reserved,
                    location: location,
                    highlight: dummyHighlight(HighlightTokenKind.Keyword, HighlightModifierKind.Invalid)
                });
                continue;
            } else {
                tokens.push({
                    kind: TokenKind.Identifier,
                    text: triedIdentifier,
                    location: location,
                    highlight: dummyHighlight(HighlightTokenKind.Variable, HighlightModifierKind.Invalid)
                });
            }
            continue;
        }

        unknownBuffer.append(location, reading.next());
        reading.stepNext();
    }

    unknownBuffer.flush();
    return tokens;
}

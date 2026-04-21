import {HighlightForToken} from '../core/highlight';
import {diagnostic} from '../core/diagnostic';
import {CommentToken, TokenKind, TokenObject} from '../compiler_tokenizer/tokenObject';
import {MutableTextPosition, TextLocation, TextPosition} from '../compiler_tokenizer/textLocation';

export enum ParseFailure {
    /**
     * The parser entered a parsing function, but the input does not match the expected grammar.
     */
    Mismatch = 'Mismatch',
    /**
     * The parser entered a parsing function where the input matches the expected grammar,
     * but parsing fails because some required elements are missing.
     */
    Pending = 'Pending'
}

export enum BreakOrThrough {
    /**
     * The parser should stop parsing and return the current result.
     */
    Break = 'Break',
    /**
     * The parser should continue parsing.
     */
    Through = 'Through'
}

/**
 * Parsing functions may return `ParseResult<T>` when an error occurs.
 * `Mismatch` means the input does not match the expected shape for that parser.
 * `Pending` means the input started in the expected shape but could not be fully parsed,
 * for example because an expression is incomplete.
 * `Mismatch` does not emit a diagnostic, but `Pending` does at the relevant node.
 */
export type ParseResult<T> = T | ParseFailure;

export class ParserState {
    private _lastTokenAtError: TokenObject | undefined;

    private readonly _sofToken; // start of file
    private readonly _eofToken; // end of file

    /**
     * Whether the current file is an `as.predefined` file.
     */
    public readonly isPredefinedFile: boolean = false;

    public constructor(
        private readonly _tokens: TokenObject[],
        private _cursorIndex: number = 0
    ) {
        this._sofToken = makeSofToken(_tokens.at(0));
        this._eofToken = makeEofToken(_tokens.at(-1));

        this.isPredefinedFile = _tokens.at(0)?.location.path.endsWith('as.predefined') ?? false;
    }

    public backtrack(token: TokenObject) {
        this._cursorIndex = token.index;
    }

    public isEnd(): boolean {
        return this._cursorIndex >= this._tokens.length;
    }

    public next(step: number = 0): TokenObject {
        if (this._cursorIndex + step >= this._tokens.length) {
            return this._eofToken;
        }

        return this._tokens[this._cursorIndex + step];
    }

    public hasNext(step: number = 0): boolean {
        return this._cursorIndex + step < this._tokens.length;
    }

    public prev(): TokenObject {
        if (this._cursorIndex <= 0) {
            return this._sofToken;
        }

        return this._tokens[this._cursorIndex - 1];
    }

    public step() {
        this._cursorIndex++;
    }

    /**
     * Apply highlighting to the current token and advance to the next one.
     */
    public commit(highlightForToken: HighlightForToken) {
        const next = this.next();
        if (next.isVirtual() === false) {
            next.setHighlight(highlightForToken);
        }

        this.step();
    }

    /**
     * Check whether the next token is the expected reserved word.
     */
    public expect(reservedWord: string, highlight: HighlightForToken) {
        if (this.isEnd()) {
            diagnostic.error(this.next().location, 'Unexpected end of file.');
            return false;
        }

        const isExpectedWord = this.next().kind === TokenKind.Reserved && this.next().text === reservedWord;
        if (isExpectedWord === false) {
            diagnostic.error(this.next().location, `Expected '${reservedWord}'.`);
            return false;
        }

        this.commit(highlight);
        return true;
    }

    public error(message: string) {
        if (this._lastTokenAtError === this.next()) {
            return;
        }

        diagnostic.error(this.next().location, message);
        this._lastTokenAtError = this.next();
    }
}

function makeSofToken(firstToken: TokenObject | undefined) {
    if (firstToken === undefined) {
        return new CommentToken('', TextLocation.createEmpty());
    }

    const start = new TextPosition(0, 0);
    // FIXME: Maybe we should create a special token separately
    return new CommentToken('', new TextLocation(firstToken.location.path, start, start));
}

function makeEofToken(lastToken: TokenObject | undefined) {
    if (lastToken === undefined) {
        return new CommentToken('', TextLocation.createEmpty());
    }

    const end0 = MutableTextPosition.create(lastToken.location.end);
    end0.character_ += 1;
    const end = end0.freeze();
    // FIXME: Maybe we should create a special token separately
    const token = new CommentToken('', new TextLocation(lastToken.location.path, end, end));
    token.bindPreprocessedToken(lastToken.index + 1, undefined);
    return token;
}

import {NodeScript} from "../compiler_parser/nodes";
import {Position} from "vscode-languageserver";
import {TextEdit} from "vscode-languageserver-types/lib/esm/main";
import {TokenBase, TokenObject} from "../compiler_tokenizer/tokenObject";
import {getGlobalSettings} from "../core/settings";

interface IndentState {
    line: number;
    isApplied: boolean;
}

function getIndentUnit() {
    if (getGlobalSettings().formatter.useTabIndent) {
        return '\t';
    } else {
        return ' '.repeat(getGlobalSettings().formatter.indentSpaces);
    }
}

export class FormatterState {
    private resultEdits: TextEdit[] = [];
    private cursor: Position = {line: 0, character: 0};

    private indentStack: IndentState[] = [];
    private indentBuffer: string = '';

    private condenseStack: boolean = false;
    private wrapStack: boolean = false;
    private readonly indentUnit = getIndentUnit();

    public readonly textLines: string[];
    public readonly map: TokensMap;

    public constructor(
        private readonly content: string,
        private readonly tokens: TokenObject[],
        private readonly ast: NodeScript
    ) {
        this.textLines = splitContent(content);
        this.map = new TokensMap(this.textLines, tokens);
    }

    public getResult(): TextEdit[] {
        return this.resultEdits;
    }

    public pushEdit(start: Position, end: Position, newText: string) {
        this.resultEdits.push({
            range: {start: start, end: end},
            newText: newText
        });
    }

    public getText(line: number, character: number | undefined, length: number = 1): string | undefined {
        if (character === undefined) return this.textLines[line];
        return this.textLines[line].substring(character, character + length);
    }

    public getTextAt(pos: Position, length: number = 1): string | undefined {
        return this.textLines[pos.line].substring(pos.character, pos.character + length);
    }

    public cursoredText(): string | undefined {
        return this.getTextAt(this.cursor);
    }

    public getCursor(): Position {
        return {line: this.cursor.line, character: this.cursor.character};
    }

    public setCursor(pos: Position) {
        this.cursor.line = pos.line;
        this.cursor.character = pos.character;
    }

    public setCursorToTail(token: TokenBase) {
        this.setCursor(token.location.end);
        // this.stepCursor();
    }

    public stepCursor() {
        this.setCursor(stepCursorAlongLines(this.textLines, this.cursor));
    }

    public isFinished(): boolean {
        return this.cursor.line >= this.textLines.length;
    }

    public getIndent() {
        return this.indentBuffer;
    }

    public pushIndent() {
        const nextIndent = {
            line: this.cursor.line,
            isApplied: false
        };

        const prevIndent = this.indentStack[this.indentStack.length - 1];
        if (this.indentStack.length === 0 || prevIndent.line !== nextIndent.line) {
            // 行が変わったときのみ、実際にインデントを行う
            this.indentBuffer += this.indentUnit;
            nextIndent.isApplied = true;
        } else if (prevIndent.isApplied) {
            // 行が同じ場合、フラグをずらす
            prevIndent.isApplied = false;
            nextIndent.isApplied = true;
        }

        this.indentStack.push(nextIndent);
    }

    public popIndent() {
        const popIndent = this.indentStack.pop();
        if (popIndent?.isApplied === true) {
            const backIndent = this.indentStack[this.indentStack.length - 1];
            if (popIndent.line === this.cursor.line && backIndent?.isApplied === false) {
                // 現在の行ではインデントの影響がなかったので、後ろのインデントで処理を行う
                backIndent.isApplied = true;
            } else {
                // インデントを下げる
                this.indentBuffer = this.indentBuffer.substring(0, this.indentBuffer.length - this.indentUnit.length);
            }
        }
    }

    public pushCondense() {
        this.condenseStack = true;
    }

    public popCondense(): boolean {
        const condense = this.condenseStack;
        this.condenseStack = false;
        return condense;
    }

    public pushWrap() {
        this.wrapStack = true;
    }

    public popWrap(): boolean {
        const wrap = this.wrapStack;
        this.wrapStack = false;
        return wrap;
    }
}

export function stepCursorAlongLines(lines: string[], cursor: Position): Position {
    const c: Position = {character: cursor.character, line: cursor.line};
    if (c.line >= lines.length) return c;

    c.character++;
    if (c.character >= lines[c.line].length) {
        c.line++;
        c.character = 0;
    }

    return c;

}

function splitContent(content: string): string[] {
    const parts = content.split(/(\r?\n|\r)/);

    const result = [];
    for (let i = 0; i < parts.length; i += 2) {
        const text = parts[i];
        const newline = i + 1 < parts.length ? parts[i + 1] : "";
        result.push(text + newline);
    }

    return result;
}

export function isEditedWrapAt(edits: TextEdit[], line: number) {
    for (const edit of edits) {
        if (edit.range.start.line === line && edit.newText.includes('\n')) {
            return true;
        }
    }

    return false;
}

// 文字が存在する位置に存在するトークンを一対一対応の写像で表現
export class TokensMap {
    private map: (TokenObject | undefined)[][] = [];

    public constructor(textLines: string[], tokens: TokenObject[]) {
        for (let i = 0; i < textLines.length; i++) {
            const line: (TokenObject | undefined)[] = new Array(textLines[i].length).fill(undefined);
            this.map.push(line);
        }

        for (const token of tokens) {
            const start = token.location.start;
            const end = token.location.end;
            for (let i = start.line; i <= end.line; i++) {
                const line = this.map[i];
                const startColumn = i === start.line ? start.character : 0;
                const endColumn = i === end.line ? end.character : textLines[i].length;
                for (let j = startColumn; j < endColumn; j++) {
                    line[j] = token;
                }
            }
        }
    }

    public getToken(line: number, character: number): TokenObject | undefined {
        return this.map[line][character];
    }

    public getTokenAt(pos: Position): TokenObject | undefined {
        return this.map[pos.line][pos.character];
    }
}

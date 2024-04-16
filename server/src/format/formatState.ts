import {NodeScript} from "../compile/nodes";
import {Position} from "vscode-languageserver";
import {TextEdit} from "vscode-languageserver-types/lib/esm/main";
import {TokenBase, TokenizingToken} from "../compile/tokens";

export class FormatState {
    private resultEdits: TextEdit[] = [];
    private cursor: Position = {line: 0, character: 0};
    private indentStack: string = '';

    public readonly textLines: string[];
    public readonly map: TokensMap;

    public constructor(
        private readonly content: string,
        private readonly tokens: TokenizingToken[],
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

    public setCursorFromHead(token: TokenBase) {
        this.setCursor(token.location.start);
    }

    public setCursorToTail(token: TokenBase) {
        this.setCursor(token.location.end);
        this.stepCursor();
    }

    public stepCursor() {
        this.cursor = stepCursorAlongLines(this.textLines, this.cursor);
    }

    public getIndent() {
        return this.indentStack;
    }

    public pushIndent() {
        this.indentStack += '\t';
    }

    public popIndent() {
        this.indentStack = this.indentStack.substring(0, this.indentStack.length - 1);
    }
}

export function stepCursorAlongLines(lines: string[], cursor: Position): Position {
    if (cursor.line >= lines.length) return cursor;

    cursor.character++;
    if (cursor.character >= lines[cursor.line].length) {
        cursor.line++;
        cursor.character = 0;
    }

    return cursor;

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

// 文字が存在する位置に存在するトークンを一対一対応の写像で表現
export class TokensMap {
    private map: (TokenizingToken | undefined)[][] = [];

    public constructor(textLines: string[], tokens: TokenizingToken[]) {
        for (let i = 0; i < textLines.length; i++) {
            const line: (TokenizingToken | undefined)[] = new Array(textLines[i].length).fill(undefined);
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

    public getToken(line: number, character: number): TokenizingToken | undefined {
        return this.map[line][character];
    }

    public getTokenAt(pos: Position): TokenizingToken | undefined {
        return this.map[pos.line][pos.character];
    }
}

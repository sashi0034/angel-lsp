import {NodeScript} from "../compile/nodes";
import {Position} from "vscode-languageserver";
import {TextEdit} from "vscode-languageserver-types/lib/esm/main";

export class FormatState {
    private resultEdits: TextEdit[] = [];
    private textLines: string[];
    private cursor: Position = {line: 0, character: 0};

    public constructor(
        private readonly content: string,
        private readonly ast: NodeScript
    ) {
        this.textLines = splitContent(content);
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

    public getText(line: number, character: number | undefined): string | undefined {
        if (character === undefined) return this.textLines[line];
        return this.textLines[line][character];
    }

    public getTextAt(pos: Position): string | undefined {
        return this.textLines[pos.line][pos.character];
    }

    public cursoredText(): string | undefined {
        return this.getTextAt(this.cursor);
    }

    public getCursor(): Position {
        return this.cursor;
    }

    public setCursor(pos: Position) {
        this.cursor = pos;
    }

    public stepCursor() {
        if (this.cursor.line >= this.textLines.length) return;

        this.cursor.character++;
        if (this.cursor.character >= this.textLines[this.cursor.line].length) {
            this.cursor.line++;
            this.cursor.character = 0;
        }
    }
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

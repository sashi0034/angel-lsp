import {Position} from "vscode-languageserver";
import {FormatState} from "./formatState";

function isNullOrWhitespace(char: string | undefined): boolean {
    if (char === undefined) return false;
    return /\s/.test(char);
}

export function removeFrontSpaces(format: FormatState, start: Position, padding: number = 1) {
    const startCharacter = start.character - 1;

    const cursor: Position = {line: start.line, character: startCharacter};
    while (cursor.character > 0) {
        if (format.map.getToken(cursor.line, cursor.character - 1) !== undefined) break;
        cursor.character--;
    }

    if (cursor.character !== startCharacter) {
        if (cursor.character > 0) cursor.character += padding;
        format.pushEdit(cursor, start, '');
    }
}

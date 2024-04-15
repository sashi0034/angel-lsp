import {Position} from "vscode-languageserver";
import {FormatState, stepCursorAlongLines} from "./formatState";
import {TokenComment, TokenKind} from "../compile/tokens";

function isNullOrWhitespace(char: string | undefined): boolean {
    if (char === undefined) return false;
    return /\s/.test(char);
}

function walkBackUntilWhitespace(format: FormatState, cursor: Position): Position {
    const line = cursor.line;
    let character = cursor.character;

    while (character > 0) {
        if (isNullOrWhitespace(format.getText(line, character - 1)) === false) break;
        character--;
    }

    return {line: line, character: character};
}

function formatBlockComment(format: FormatState, token: TokenComment) {
    const spaceEnd: Position = {line: token.location.start.line, character: token.location.start.character};
    const spaceStart: Position = walkBackUntilWhitespace(format, spaceEnd);
    format.pushEdit(spaceStart, spaceEnd, spaceStart.character > 0 ? ' ' : '');
    format.setCursorToTail(token);
}

export interface FormatTargetOption {
    spaceBefore?: boolean;
    spaceAfter?: boolean;
}

export function formatExpectLineHead(format: FormatState, target: string, option: FormatTargetOption) {
    formatExpectLineBy(format, target, option, LineAlignment.Head);
}

export function formatExpectLineBody(format: FormatState, target: string, option: FormatTargetOption) {
    formatExpectLineBy(format, target, option, LineAlignment.Body);
}

export function formatExpectLineTail(format: FormatState, target: string, option: FormatTargetOption) {
    formatExpectLineBy(format, target, option, LineAlignment.Tail);
}

enum LineAlignment {
    Head = 'Head',
    Body = 'Body',
    Tail = 'Tail'
}

function formatExpectLineBy(format: FormatState, target: string, option: FormatTargetOption, alignment: LineAlignment) {
    let cursor = format.getCursor();
    for (; ;) {
        const next = format.map.getTokenAt(cursor);
        if (next === undefined) {
            cursor = stepCursorAlongLines(format.textLines, cursor);
            continue;
        } else if (next.kind === TokenKind.Comment) {
            formatBlockComment(format, next);
            cursor = format.getCursor();
            continue;
        }

        if (format.getTextAt(cursor, target.length) !== target) {
            return false;
        }

        const spaceBefore: string = option.spaceBefore === true ? ' ' : '';
        const editEnd: Position = {line: next.location.start.line, character: next.location.start.character};
        switch (alignment) {
        case LineAlignment.Head: {
            const spaceStart: Position = walkBackUntilWhitespace(format, editEnd);
            format.pushEdit(spaceStart, editEnd, (spaceStart.character > 0 ? '\n' : '') + format.getIndent());
            break;
        }
        case LineAlignment.Body: {
            const editStart: Position = format.getCursor();
            const sameLine = editStart.line === editEnd.line;
            const editStart2: Position = sameLine ? editStart : walkBackUntilWhitespace(format, editEnd);
            format.pushEdit(editStart2, editEnd, sameLine ? spaceBefore : format.getIndent());
            break;
        }
        case LineAlignment.Tail: {
            const editStart = format.getCursor();
            format.pushEdit(editStart, editEnd, spaceBefore);
            break;
        }
        }

        cursor.character += target.length;
        if (option.spaceAfter === true) cursor.character++;
        format.setCursor(cursor);
        return true;
    }
}

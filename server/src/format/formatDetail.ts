import {Position} from "vscode-languageserver";
import {FormatState, stepCursorAlongLines} from "./formatState";
import {TokenComment, TokenizingToken, TokenKind, TokenReserved} from "../compile/tokens";

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

function walkForwardUntilWhitespace(format: FormatState, cursor: Position): Position {
    const line = cursor.line;
    let character = cursor.character;

    while (character < format.textLines[line].length) {
        if (isNullOrWhitespace(format.getText(line, character)) === false) break;
        character++;
    }

    return {line: line, character: character};
}

function formatBlockComment(format: FormatState, token: TokenComment) {
    const spaceEnd: Position = {line: token.location.start.line, character: token.location.start.character};
    const spaceStart: Position = walkBackUntilWhitespace(format, spaceEnd);
    format.pushEdit(spaceStart, spaceEnd, spaceStart.character > 0 ? ' ' : '');
    format.setCursorWith(token);
}

function formatReservedMark(format: FormatState, token: TokenReserved) {
    const spaceEnd: Position = {line: token.location.start.line, character: token.location.start.character};
    const spaceStart: Position = walkBackUntilWhitespace(format, spaceEnd);
    // const frontToken = format.map.getToken(spaceStart.line, spaceStart.character - 1);
    const needSpace = spaceStart.character > 0
        && (token.property.isExprOp || token.property.isAssignOp);
    format.pushEdit(spaceStart, spaceEnd, needSpace ? ' ' : '');
    format.setCursorWith(token);
}

export function formatExpectLineHead(format: FormatState, target: string) {
    formatExpectLineBy(format, target, LineAlignment.Head);
}

export function formatExpectLineBody(format: FormatState, target: string) {
    formatExpectLineBy(format, target, LineAlignment.Body);
}

export function formatExpectLineTail(format: FormatState, target: string) {
    formatExpectLineBy(format, target, LineAlignment.Tail);
}

enum LineAlignment {
    Head = 'Head',
    Body = 'Body',
    Tail = 'Tail'
}

function formatExpectLineBy(format: FormatState, target: string, alignment: LineAlignment) {
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

        const spaceEnd: Position = {line: next.location.start.line, character: next.location.start.character};
        switch (alignment) {
        case LineAlignment.Head: {
            const spaceStart: Position = walkBackUntilWhitespace(format, spaceEnd);
            format.pushEdit(spaceStart, spaceEnd, (spaceStart.character > 0 ? '\n' : '') + '');
            break;
        }
        case LineAlignment.Body: {
            const spaceStart: Position = walkBackUntilWhitespace(format, spaceEnd);
            const prev = format.map.getToken(spaceStart.line, spaceStart.character - 1);
            format.pushEdit(spaceStart, spaceEnd, getSpaceBetween(prev, next));
            break;
        }
        case LineAlignment.Tail: {
            const spaceStart = format.getCursor();
            format.pushEdit(spaceStart, spaceEnd, '');
            break;
        }
        }

        cursor.character += target.length;
        format.setCursor(cursor);
        return true;
    }
}

function getSpaceBetween(prev: TokenizingToken | undefined, next: TokenizingToken): string {
    if (prev === undefined) return '';
    if (prev.location.end.line !== next.location.start.line) return '';
    if (prev.kind === TokenKind.Reserved && prev.property.isMark) {
        // if (next.kind === TokenKind.Reserved && next.property.isMark) return '';
        return '';
    }
    if (next.kind === TokenKind.Reserved && next.property.isMark) {
        return '';
    }
    return ' ';
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

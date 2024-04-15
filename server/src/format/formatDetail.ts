import {Position} from "vscode-languageserver";
import {FormatState} from "./formatState";
import {TokenComment, TokenizingToken, TokenKind, TokenReserved} from "../compile/tokens";

function isNullOrWhitespace(char: string | undefined): boolean {
    if (char === undefined) return false;
    return /\s/.test(char);
}

function backUntilWhitespace(format: FormatState, cursor: Position): Position {
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
    const spaceStart: Position = backUntilWhitespace(format, spaceEnd);
    format.pushEdit(spaceStart, spaceEnd, spaceStart.character > 0 ? ' ' : '');
    format.setCursorWith(token);
}

function formatReservedMark(format: FormatState, token: TokenReserved) {
    const spaceEnd: Position = {line: token.location.start.line, character: token.location.start.character};
    const spaceStart: Position = backUntilWhitespace(format, spaceEnd);
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

enum LineAlignment {
    Head = 'Head',
    Body = 'Body',
    Tail = 'Tail'
}

function formatExpectLineBy(format: FormatState, target: string, alignment: LineAlignment) {
    for (; ;) {
        const cursor = format.getCursor();

        const next = format.map.getTokenAt(cursor);
        if (next === undefined) {
            format.stepCursor();
            continue;
        } else if (next.kind === TokenKind.Comment) {
            formatBlockComment(format, next);
            continue;
        }

        if (format.getTextAt(cursor, target.length) !== target) return false;

        switch (alignment) {
        case LineAlignment.Head: {
            const spaceEnd: Position = {line: next.location.start.line, character: next.location.start.character};
            const spaceStart: Position = backUntilWhitespace(format, spaceEnd);
            format.pushEdit(spaceStart, spaceEnd, (spaceStart.character > 0 ? '\n' : '') + '');
            format.setCursorWith(next);
            break;
        }
        case LineAlignment.Body: {
            const spaceEnd: Position = {line: next.location.start.line, character: next.location.start.character};
            const spaceStart: Position = backUntilWhitespace(format, spaceEnd);
            const prev = format.map.getToken(spaceStart.line, spaceStart.character - 1);
            format.pushEdit(spaceStart, spaceEnd, getSpaceBetween(prev, next));
            format.setCursorWith(next);
            break;
        }
        case LineAlignment.Tail:
            break;
        }

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

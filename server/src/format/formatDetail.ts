import {Position} from "vscode-languageserver";
import {FormatState, stepCursorAlongLines} from "./formatState";
import {TokenizingToken, TokenKind} from "../compile/tokens";
import {NodesBase} from "../compile/nodes";
import {tracer} from "../code/tracer";

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

function formatTokenWithSpace(format: FormatState, frontToken: TokenizingToken) {
    const spaceEnd: Position = {line: frontToken.location.start.line, character: frontToken.location.start.character};
    const spaceStart: Position = walkBackUntilWhitespace(format, spaceEnd);

    const backToken = format.map.getTokenAt(spaceStart);
    const editSpace = frontToken.kind === TokenKind.Reserved && backToken?.kind === TokenKind.Reserved
        ? '' // '>>' といったトークンはテンプレートのために '>' '>' と分割されているため、スペースを入れない
        : ' ';

    format.pushEdit(spaceStart, spaceEnd, (spaceStart.character > 0 ? editSpace : format.getIndent()));
    format.setCursorToTail(frontToken);
}

export interface FormatTargetOption {
    condenseSides?: boolean,
    condenseLeft?: boolean,
    condenseRight?: boolean,
    forceWrap?: boolean;
}

export function formatTargetLineStatement(format: FormatState, target: string, option: FormatTargetOption) {
    formatTargetLineBy(format, target, option, LineAlignment.Statement);
}

export function formatTargetLinePeriod(format: FormatState, target: string, option: FormatTargetOption) {
    formatTargetLineBy(format, target, option, LineAlignment.Period);
}

export function formatMoveUntilNodeStart(format: FormatState, node: NodesBase) {
    formatMoveUntil(format, node.nodeRange.start.location.start);
}

export function formatMoveUntil(format: FormatState, destination: Position) {
    let cursor = format.getCursor();
    while (format.isFinished() === false) {
        const next = format.map.getTokenAt(cursor);
        if (next === undefined) {
            cursor = stepCursorAlongLines(format.textLines, cursor);
            continue;
        }

        const isReached = cursor.line > destination.line
            || (cursor.line === destination.line && cursor.character >= destination.character);
        if (isReached === false) {
            formatTokenWithSpace(format, next);
            cursor = format.getCursor();
            continue;
        }

        // 目的地に到達
        format.setCursor(destination);
        break;
    }
}

export function formatMoveToNonComment(format: FormatState): TokenizingToken | undefined {
    let cursor = format.getCursor();
    while (format.isFinished() === false) {
        const next = format.map.getTokenAt(cursor);
        if (next === undefined) {
            cursor = stepCursorAlongLines(format.textLines, cursor);
            continue;
        } else if (next.kind === TokenKind.Comment) {
            formatTokenWithSpace(format, next);
            cursor = format.getCursor();
            continue;
        }

        return next;
    }
    return undefined;
}

enum LineAlignment {
    Statement = 'Statement',
    Period = 'Period'
}

function formatTargetLineBy(format: FormatState, target: string, option: FormatTargetOption, alignment: LineAlignment) {
    let cursor = format.getCursor();
    while (format.isFinished() === false) {
        const next = format.map.getTokenAt(cursor);
        if (next === undefined) {
            cursor = stepCursorAlongLines(format.textLines, cursor);
            continue;
        } else if (next.kind === TokenKind.Comment) {
            formatTokenWithSpace(format, next);
            cursor = format.getCursor();
            continue;
        }

        if (format.getTextAt(cursor, target.length) !== target) {
            tracer.verbose(`'${target}' not found at ${cursor.line}:${cursor.character}`);
            return false;
        }

        formatTargetWith(format, target, option, alignment, cursor, next);
        return true;
    }
}

function formatTargetWith(
    format: FormatState,
    target: string,
    option: FormatTargetOption,
    alignment: LineAlignment,
    cursor: Position,
    next: TokenizingToken
) {
    const isCondenseLeft: boolean =
        format.popCondense() || option.condenseSides === true || option.condenseLeft === true;
    const isCondenseRight: boolean =
        option.condenseSides === true || option.condenseRight === true;
    if (isCondenseRight) format.pushCondense();

    const forceWrap: boolean = format.popWrap() || option.forceWrap === true;

    const frontSpace = isCondenseLeft ? '' : ' ';
    const editEnd: Position = {line: next.location.start.line, character: next.location.start.character};
    switch (alignment) {
    case LineAlignment.Statement: {
        const editStart: Position = format.getCursor();
        const walkedBack = walkBackUntilWhitespace(format, editStart);
        if (walkedBack.character === 0) {
            format.pushEdit(walkedBack, editEnd, format.getIndent());
        } else {
            const sameLine = editStart.line === editEnd.line;
            const editStart2: Position = sameLine ? walkedBack : walkBackUntilWhitespace(format, editEnd);
            const newText = sameLine
                ? (forceWrap ? '\n' + format.getIndent() : frontSpace)
                : format.getIndent();
            format.pushEdit(editStart2, editEnd, newText);
        }
        break;
    }
    case LineAlignment.Period: {
        const editStart = format.getCursor();
        format.pushEdit(editStart, editEnd, frontSpace);
        break;
    }
    }

    cursor.character += target.length;
    format.setCursor(cursor);
}

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
    connectTail?: boolean;
}

export function formatMoveUntilNodeStart(format: FormatState, node: NodesBase) {
    formatMoveUntil(format, node.nodeRange.start.location.start);
}

export function formatMoveUntil(format: FormatState, destination: Position) {
    let cursor = format.getCursor();
    while (format.isFinished() === false) {
        if (cursor.line >= format.textLines.length) {
            // ファイル末尾に到達
            const fileTail = {
                line: format.textLines.length - 1,
                character: format.textLines[format.textLines.length - 1].length
            };
            format.pushEdit(format.getCursor(), fileTail, '\n');
            return;
        }

        const next = format.map.getTokenAt(cursor);
        if (next === undefined) {
            // 空白行
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
        // format.setCursor(destination);
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

export function formatTargetBy(format: FormatState, target: string, option: FormatTargetOption) {
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

        executeFormatTargetWith(format, target, option, cursor, next);
        return true;
    }
}

function executeFormatTargetWith(
    format: FormatState,
    target: string,
    option: FormatTargetOption,
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

    if (forceWrap === false && option.connectTail === true) {
        // 文末に接続
        const editStart = walkBackUntilWhitespace(format, format.getCursor());
        format.pushEdit(editStart, editEnd, (editStart.character === 0 ? format.getIndent() : '') + frontSpace);
    } else {
        // 文の語を連結
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
    }

    cursor.character += target.length;
    format.setCursor(cursor);
}

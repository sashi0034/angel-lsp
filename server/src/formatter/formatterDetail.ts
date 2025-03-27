import {Position} from "vscode-languageserver";
import {FormatterState, stepCursorAlongLines} from "./formatterState";
import {TokenObject, TokenKind} from "../compiler_tokenizer/tokenObject";
import {NodeBase} from "../compiler_parser/nodes";
import {logger} from "../core/logger";
import {getGlobalSettings} from "../core/settings";

function isNullOrWhitespace(char: string | undefined): boolean {
    if (char === undefined) return false;
    return /\s/.test(char);
}

function walkBackUntilWhitespace(format: FormatterState, cursor: Position): Position {
    const line = cursor.line;
    let character = cursor.character;

    while (character > 0) {
        if (isNullOrWhitespace(format.getText(line, character - 1)) === false) break;
        character--;
    }

    return {line: line, character: character};
}

function formatTokenWithSpace(format: FormatterState, frontToken: TokenObject) {
    const spaceEnd: Position = {line: frontToken.location.start.line, character: frontToken.location.start.character};

    const spaceStart: Position = walkBackUntilWhitespace(format, spaceEnd);
    if (spaceStart.character === 0) {
        format.setCursorToTail(frontToken);
        return;
    }

    const backToken = format.map.getTokenAt({line: spaceStart.line, character: spaceStart.character - 1});
    const editSpace = canInsertEditSpace(backToken, frontToken) ? ' ' : '';

    format.pushEdit(spaceStart, spaceEnd, (spaceStart.character > 0 ? editSpace : format.getIndent()));
    format.setCursorToTail(frontToken);
}

function canInsertEditSpace(backToken: TokenObject | undefined, frontToken: TokenObject): boolean {
    const backTail = backToken?.location?.end;
    const frontHead = frontToken.location.start;

    // トークンが密接に連結している場合はスペースを入れない
    if (backTail?.line === frontHead.line && backTail.character === frontHead.character) {
        return false;
    }

    // ディレクティブの後ろにスペースを入れない
    if (backToken?.text === '#') return false;

    return true;
}

export interface FormatTargetOption {
    condenseSides?: boolean,
    condenseLeft?: boolean,
    condenseRight?: boolean,
    forceWrap?: boolean;
    connectTail?: boolean;
}

export function formatMoveUntilNodeStart(format: FormatterState, node: NodeBase) {
    formatMoveUntil(format, node.nodeRange.start.location.start);
}

export function formatMoveUntil(format: FormatterState, destination: Position) {
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

        if (cursor.line - format.getCursor().line > 1 + getMaxBlankLines()) {
            // 多すぎる空行の除去
            formatBlankLines(format, format.getCursor().line + 1, cursor.line - 1);
        }

        const isReached = cursor.line > destination.line
            || (cursor.line === destination.line && cursor.character >= destination.character);
        if (isReached === false) {
            formatTokenWithSpace(format, next);
            cursor = format.getCursor();
            continue;
        }

        // 目的地に到達
        // formatter.setCursor(destination);
        break;
    }
}

export function formatMoveToNonComment(format: FormatterState): TokenObject | undefined {
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

export function formatTargetBy(format: FormatterState, target: string, option: FormatTargetOption): boolean {
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
            logger.verbose(`'${target}' not found at ${cursor.line}:${cursor.character}`);
            return false;
        }

        executeFormatTargetWith(format, target, option, cursor, next);
        return true;
    }

    return false;
}

function getMaxBlankLines(): number {
    return Math.max(1, getGlobalSettings().formatter.maxBlankLines);
}

function formatBlankLines(format: FormatterState, startLine: number, endLine: number) {
    for (let i = startLine; i <= endLine; i++) {
        if (/^\s*$/.test(format.textLines[i]) === false) {
            logger.verbose(`Not a blank line at ${i}`);
            return;
        }
    }

    format.pushEdit(
        {line: startLine, character: 0},
        {line: endLine, character: format.textLines[endLine].length - 1},
        '\n'.repeat(getMaxBlankLines() - 1));
    format.setCursor({line: endLine + 1, character: 0});
}

function executeFormatTargetWith(
    format: FormatterState,
    target: string,
    option: FormatTargetOption,
    cursor: Position,
    next: TokenObject
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
        if (cursor.line - format.getCursor().line > 1 + getMaxBlankLines()) {
            // 多すぎる空行の除去
            formatBlankLines(format, format.getCursor().line + 1, cursor.line - 1);
        }

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

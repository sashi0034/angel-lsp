import {Position} from "vscode-languageserver";
import {FormatState, stepCursorAlongLines} from "./formatState";
import {TokenizingToken, TokenKind} from "../compile/tokens";
import {NodesBase} from "../compile/nodes";

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

// export function formatTargetLineHead(format: FormatState, target: string, option: FormatTargetOption) {
//     formatTargetLineBy(format, target, option, LineAlignment.Head);
// }

export function formatTargetLineStatement(format: FormatState, target: string, option: FormatTargetOption) {
    formatTargetLineBy(format, target, option, LineAlignment.Statement);
}

export function formatTargetLinePeriod(format: FormatState, target: string, option: FormatTargetOption) {
    formatTargetLineBy(format, target, option, LineAlignment.Period);
}

export function formatMoveUntilNodeStart(format: FormatState, node: NodesBase) {
    formatMoveUntil(format, node.nodeRange.start.location.start);

    // const editEnd = format.getCursor();
    // const editStart = walkBackUntilWhitespace(format, editEnd);
    // format.pushEdit(editStart, editEnd, format.getIndent());
}

export function formatMoveUntil(format: FormatState, destination: Position) {
    let cursor = format.getCursor();
    for (; ;) {
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

enum LineAlignment {
    Statement = 'Statement',
    Period = 'Period'
}

function formatTargetLineBy(format: FormatState, target: string, option: FormatTargetOption, alignment: LineAlignment) {
    const isCondenseLeft: boolean =
        format.popCondense() || option.condenseSides === true || option.condenseLeft === true;
    const isCondenseRight: boolean =
        option.condenseSides === true || option.condenseRight === true;
    if (isCondenseRight) format.pushCondense();

    let cursor = format.getCursor();
    for (; ;) {
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
            return false;
        }

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
                const editStart2: Position = sameLine ? editStart : walkBackUntilWhitespace(format, editEnd);
                const newText = sameLine
                    ? (option.forceWrap === true ? '\n' + format.getIndent() : frontSpace)
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
        return true;
    }
}

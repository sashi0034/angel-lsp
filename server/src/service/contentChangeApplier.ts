import * as lsp from "vscode-languageserver/node";
import * as assert from "node:assert";

export function moveDiagnosticsByChanges(diagnosticList: lsp.Diagnostic[], changes: lsp.TextDocumentContentChangeEvent[]) {
    for (const change of changes) {
        moveElementsByChange(diagnosticList, change);
    }
}

export function moveInlayHintByChanges(inlayHintList: lsp.InlayHint[], changes: lsp.TextDocumentContentChangeEvent[]) {
    for (const change of changes) {
        moveElementsByChange(inlayHintList, change);
    }
}

function countLineBreaksAndLength(str: string) {
    let lineBreaks = 0;
    // let firstLineLength = 0;
    let lastLineLength = 0;
    let currentLineLength = 0;

    for (let i = 0; i < str.length; i++) {
        const char = str[i];

        if (char === '\r') {
            // if (lineBreaks === 0) firstLineLength = currentLineLength;

            if (str[i + 1] === '\n') i++; // Handle CRLF as one line break
            lineBreaks++;
            currentLineLength = 0;
        } else if (char === '\n') {
            // if (lineBreaks === 0) firstLineLength = currentLineLength;

            lineBreaks++;
            currentLineLength = 0;
        } else {
            currentLineLength++;
        }
    }

    // if (lineBreaks === 0) firstLineLength = currentLineLength;

    lastLineLength = currentLineLength;

    return {lineBreaks, lastLineLength};
}

type MoveElement = {
    range: lsp.Range;
} | {
    position: lsp.Position;
}

function moveElementsByChange(elementList: MoveElement[], change: lsp.TextDocumentContentChangeEvent) {
    assert(lsp.TextDocumentContentChangeEvent.isIncremental(change));

    const changeRange = change.range;
    const changeText = countLineBreaksAndLength(change.text);

    for (const element of elementList) {
        // I hope this will be optimized :)
        const elementRange = 'range' in element
            ? element.range :
            {start: element.position, end: {...element.position}};

        if (changeRange.end.line < elementRange.start.line) {
            // l1: ... <change begin> ...
            // l2: ... <change end> ...
            // l3: ... <diagnostic>

            let lineDiff = -(changeRange.end.line - changeRange.start.line);
            lineDiff += changeText.lineBreaks;

            elementRange.start.line += lineDiff;
            elementRange.end.line += lineDiff;
        } else if (changeRange.end.line === elementRange.start.line &&
            changeRange.end.character <= elementRange.start.character
        ) {
            // l1: ... <change begin> ...
            // l2: ... <change end> ... <diagnostic> ...

            let lineDiff = changeRange.start.line - changeRange.end.line;
            lineDiff += changeText.lineBreaks;

            elementRange.start.line += lineDiff;
            elementRange.end.line += lineDiff;

            if (lineDiff != 0) {
                // l1: ... <change begin> ...
                // l2: ... <change end> ... <diagnostic> ...
                //   |
                //   V
                // l1: ... <replaced> ... <diagnostic> ...
                //   or
                // l1: ... <change begin> ...
                // l2: ... <change end> ... <diagnostic> ...
                //   |
                //   V
                // l1: ... <replaced begin> ...
                // l2: ...
                // l3: ... <replaced end> ... <diagnostic> ...

                let characterStart = elementRange.start.character - changeRange.end.character;
                if (lineDiff < 0) {
                    // l1: ... ... <replaced last line> ... <diagnostic> ...
                    characterStart += changeRange.start.character + changeText.lastLineLength;
                } else { // lineDiff > 0
                    // l3: <replaced last line> ... <diagnostic> ...
                    characterStart += changeText.lastLineLength;
                }

                if (elementRange.start.line === elementRange.end.line) {
                    // If the diagnostic is on the same line, the end of the diagnostic should also be moved.
                    const len = elementRange.end.character - elementRange.start.character;
                    elementRange.end.character = characterStart + len;
                }

                elementRange.start.character = characterStart;
            } else { // lineDiff === 0
                // l1: ... <change begin> ...
                // l2: ... <change end> ... <diagnostic> ...
                //   |
                //   V
                // l1: ...
                // l2: ... <replaced> ... <diagnostic> ...

                let charactorDiff = -(changeRange.end.character - changeRange.start.character);
                charactorDiff += changeText.lastLineLength;

                elementRange.start.character += charactorDiff;
                elementRange.end.character += charactorDiff;
            }
        }
    }
}

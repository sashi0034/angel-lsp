import * as lsp from "vscode-languageserver/node";
import * as assert from "node:assert";

export function moveDiagnosticsByChanges(diagnosticList: lsp.Diagnostic[], changes: lsp.TextDocumentContentChangeEvent[]) {
    for (const change of changes) {
        moveDiagnosticByChange(diagnosticList, change);

        // FIXME: 差分を配列にまとめる必要がありそう
    }
}

function countLineBreaksAndLength(str: string) {
    let lineBreaks = 0;
    let firstLineLength = 0;
    let lastLineLength = 0;
    let currentLineLength = 0;

    for (let i = 0; i < str.length; i++) {
        const char = str[i];

        if (char === '\r') {
            if (lineBreaks === 0) firstLineLength = currentLineLength;

            if (str[i + 1] === '\n') i++; // Handle CRLF as one line break
            lineBreaks++;
            currentLineLength = 0;
        } else if (char === '\n') {
            if (lineBreaks === 0) firstLineLength = currentLineLength;

            lineBreaks++;
            currentLineLength = 0;
        } else {
            currentLineLength++;
        }
    }

    if (lineBreaks === 0) firstLineLength = currentLineLength;

    lastLineLength = currentLineLength;

    return {lineBreaks, firstLineLength, lastLineLength};
}

function moveDiagnosticByChange(diagnosticList: lsp.Diagnostic[], change: lsp.TextDocumentContentChangeEvent) {
    assert(lsp.TextDocumentContentChangeEvent.isIncremental(change));

    const changeRange = change.range;
    const changeText = countLineBreaksAndLength(change.text);

    for (const diagnostic of diagnosticList) {
        const diagnosticRange = diagnostic.range;

        if (changeRange.end.line < diagnosticRange.start.line) {
            // l1: ... <change begin> ...
            // l2: ... <change end> ...
            // l3: ... <diagnostic>

            let lineDiff = -(changeRange.end.line - changeRange.start.line);
            lineDiff += changeText.lineBreaks;

            diagnosticRange.start.line += lineDiff;
            diagnosticRange.end.line += lineDiff;
        } else if (changeRange.end.line === diagnosticRange.start.line &&
            changeRange.end.character <= diagnosticRange.start.character
        ) {
            // l1: ... <change begin> ...
            // l2: ... <change end> ... <diagnostic> ...

            let lineDiff = changeRange.start.line - changeRange.end.line;
            lineDiff += changeText.lineBreaks;

            diagnosticRange.start.line += lineDiff;
            diagnosticRange.end.line += lineDiff;

            if (lineDiff < 0) {
                // l1: ... <change begin> ...
                // l2: ... <change end> ... <diagnostic> ...
                //   |
                //   V
                // l1: ... <replaced> ... <diagnostic> ...

                let characterStart = changeRange.start.character - diagnosticRange.start.character;
                characterStart += changeText.firstLineLength;

                if (diagnosticRange.start.line === diagnosticRange.end.line) {
                    const len = diagnosticRange.end.character - diagnosticRange.start.character;
                    diagnosticRange.end.character = characterStart + len;
                }

                diagnosticRange.start.character = characterStart;
            } else if (lineDiff > 0) {
                // l1: ... <change begin> ...
                // l2: ... <change end> ... <diagnostic> ...
                //   |
                //   V
                // l1: ... <replaced begin> ...
                // l2: ...
                // l3: ... <replaced end> ... <diagnostic> ...

                let characterStart = diagnosticRange.start.character - changeRange.end.character;
                characterStart += changeText.lastLineLength;

                if (diagnosticRange.start.line === diagnosticRange.end.line) {
                    const len = diagnosticRange.end.character - diagnosticRange.start.character;
                    diagnosticRange.end.character = characterStart + len;
                }

                diagnosticRange.start.character = characterStart;
            } else { // lineDiff === 0
                // l1: ... <change begin> ...
                // l2: ... <change end> ... <diagnostic> ...
                //   |
                //   V
                // l1: ...
                // l2: ... <replaced> ... <diagnostic> ...

                let charactorDiff = -(changeRange.end.character - changeRange.start.character);
                charactorDiff += changeText.lastLineLength;

                diagnosticRange.start.character += charactorDiff;
                diagnosticRange.end.character += charactorDiff;
            }
        }
    }
}

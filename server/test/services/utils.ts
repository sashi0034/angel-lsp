import {TextPosition} from "../../src/compiler_tokenizer/textLocation";

interface CaretAndContent {
    caret: TextPosition;
    content: string;
}

/**
 * Returns the caret position and the content of the specified string.
 * Caret should be represented by "<c>".
 */
export function makeCaretAndContent(rawContent: string): CaretAndContent {
    const lines = rawContent.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const caretCharacter = lines[i].indexOf('<c>');

        if (caretCharacter !== -1) {
            return {
                caret: new TextPosition(i, caretCharacter),
                content: rawContent.replace(/<c>/g, '')
            };
        }
    }

    throw new Error("No <c> found in content");
}

interface CaretListAndContent {
    caretList: TextPosition[];
    content: string;
}

/**
 * Returns the list of caret positions and the content of the specified string.
 * Caret should be represented by "<c0>", "<c1>", "<c2>", etc.
 */
export function makeCaretListAndContent(rawContent: string): CaretListAndContent {
    const lines = rawContent.split(/\r?\n/);
    const caretList: TextPosition[] = [];
    // Regex to match markers like <c0>, <c1>, <c2>, etc.
    const markerRegex = /<c\d+>/g;
    const newLines = lines.map((line, lineNumber) => {
        // For each match in the line, record its position.
        let match: RegExpExecArray | null;
        while ((match = markerRegex.exec(line)) !== null) {
            caretList.push(new TextPosition(lineNumber, match.index));

            line = line.replace(markerRegex, '');
        }

        // Remove all markers from the line.
        return line.replace(markerRegex, '');
    });

    return {
        caretList,
        content: newLines.join("\n")
    };
}

import {TextPosition} from '../../src/compiler_tokenizer/textLocation';

interface CaretAndContent {
    caret: TextPosition;
    content: string;
}

/**
 * Return the caret position and the content for the given string.
 * Represent the caret with `$C$`.
 */
export function makeCaretAndContent(rawContent: string): CaretAndContent {
    const lines = rawContent.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const caretCharacter = lines[i].indexOf('$C$');

        if (caretCharacter !== -1) {
            return {
                caret: new TextPosition(i, caretCharacter),
                content: rawContent.replace(/$C$/g, '')
            };
        }
    }

    throw new Error('No $C$ found in content');
}

interface CaretListAndContent {
    caretList: Map<number, TextPosition>;
    actualContent: string;
}

/**
 * Return the caret positions and content for the given string.
 * Represent carets with `$C0$`, `$C1$`, `$C2$`, and so on.
 */
export function makeCaretListAndContent(rawContent: string): CaretListAndContent {
    const lines = rawContent.split(/\r?\n/);
    const caretList: Map<number, TextPosition> = new Map();
    // Match markers such as $C0$, $C1$, $C2$, and so on.
    const markerRegex = /\$C(\d+)\$/;
    const newLines = lines.map((line, lineNumber) => {
        // Record the position of each marker in the line.
        let match: RegExpExecArray | null;
        while ((match = markerRegex.exec(line)) !== null) {
            const markerNumber = parseInt(match[1], 10);
            if (caretList.has(markerNumber)) {
                throw new Error(`Duplicated marker number: ${markerNumber}`);
            }

            caretList.set(markerNumber, new TextPosition(lineNumber, match.index));

            line = line.replace(markerRegex, '');
        }

        // Remove all markers from the line.
        return line.replace(markerRegex, '');
    });

    return {
        caretList,
        actualContent: newLines.join('\n')
    };
}

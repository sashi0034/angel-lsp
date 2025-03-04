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

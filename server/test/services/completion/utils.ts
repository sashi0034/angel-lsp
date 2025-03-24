import {makeCaretListAndContent} from "../utils";
import {flushInspectRecord, getInspectRecord, inspectFile, resetInspect} from "../../../src/inspector/inspector";
import {provideCompletion} from "../../../src/services/completion";

function concatIndexAndItem(item: string, index: number) {
    return `${index}:${item}`;
}

interface FileContent {
    uri: string;
    content: string;
}

function isRawContent(fileContent: string | FileContent[]): fileContent is string {
    return typeof fileContent === "string";
}

export function testCompletion(fileContents: string | FileContent[], ...expectedList: string[][]) {
    const targetUri = isRawContent(fileContents) ? 'file:///path/to/file.as' : fileContents.at(-1)!.uri;
    const rawContent = isRawContent(fileContents) ? fileContents : fileContents.at(-1)!.content;
    const {caretList, content} = makeCaretListAndContent(rawContent);

    if (caretList.length !== expectedList.length) {
        throw new Error(`Expected ${expectedList.length} caret positions, but got ${caretList.length}`);
    }

    it(`completion ${rawContent}`, () => {
        resetInspect();

        if (isRawContent(fileContents)) {
            inspectFile(targetUri, content);
        } else {
            for (const content of fileContents) {
                inspectFile(content.uri, content.content);
            }
        }

        flushInspectRecord();

        const globalScope = getInspectRecord(targetUri).analyzerScope.globalScope;

        // Iterate through each caret position and check if the completions are as expected.
        for (let i = 0; i < caretList.length; i++) {
            const caret = caretList[i];
            const expected =
                expectedList[i].sort().map(concatIndexAndItem).join(", ");
            const completions =
                provideCompletion(globalScope, caret).map(c => c.item.label).sort().map(concatIndexAndItem).join(", ");
            if (completions !== expected) {
                throw new Error(`Incorrect completion.\nexpected: [${expected}]\nactual  : [${completions}]`);
            }
        }
    });
}

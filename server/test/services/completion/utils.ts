import {makeCaretListAndContent} from "../utils";
import {flushInspectRecord, getInspectRecord, inspectFile, resetInspect} from "../../../src/inspector/inspector";
import {provideCompletion} from "../../../src/services/completion";

function concatIndexAndItem(item: string, index: number) {
    return `${index}:${item}`;
}

export function testCompletion(rawContent: string, ...expectedList: string[][]) {
    const {caretList, content} = makeCaretListAndContent(rawContent);

    if (caretList.length !== expectedList.length) {
        throw new Error(`Expected ${expectedList.length} caret positions, but got ${caretList.length}`);
    }

    it(`completion ${rawContent}`, () => {
        resetInspect();

        const uri = "/foo/bar.as";
        inspectFile(uri, content);
        flushInspectRecord();
        const globalScope = getInspectRecord(uri).analyzerScope.globalScope;

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

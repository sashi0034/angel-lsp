import {makeCaretListAndContent} from "../caretUtils";
import {provideCompletion} from "../../../src/services/completion";
import {
    FileContents,
    makeFileContentList,
    inspectFileContents,
} from "../../inspectorUtils";

function concatIndexAndItem(item: string, index: number) {
    return `${index}:${item}`;
}

export function testCompletion(fileContents: FileContents, ...expectedList: string[][]) {
    const fileContentList = makeFileContentList(fileContents);
    const targetUri = fileContentList.at(-1)!.uri;
    const targetContent = fileContentList.at(-1)!.content;

    const {caretList, actualContent} = makeCaretListAndContent(targetContent);
    fileContentList.at(-1)!.content = actualContent;

    if (caretList.length !== expectedList.length) {
        throw new Error(`Expected ${expectedList.length} caret positions, but got ${caretList.length}`);
    }

    it(`[completion] ${targetContent}`, () => {
        const inspector = inspectFileContents(fileContentList);

        const globalScope = inspector.getRecord(targetUri).analyzerScope.globalScope;

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

import {makeCaretListAndContent} from "../caretUtils";
import {provideCompletion} from "../../../src/services/completion";
import {
    FileContents,
    makeFileContentList,
    inspectFileContents,
} from "../../inspectorUtils";
import {CaretMap} from "../caretMap";

function concatIndexAndItem(item: string, index: number) {
    return `${index}:${item}`;
}

export function testCompletion(fileContents: FileContents, ...expectedList: string[][]) {
    const fileContentList = makeFileContentList(fileContents);
    const lastContent = fileContentList.at(-1)!.content;

    const caretMap = new CaretMap();
    caretMap.processFiles(fileContentList);

    if (caretMap.length !== expectedList.length) {
        throw new Error(`Expected ${expectedList.length} caret positions, but got ${caretMap.length}`);
    }

    it(`[completion] ${lastContent}`, () => {
        const inspector = inspectFileContents(fileContentList);

        // Iterate through each caret position and check if the completions are as expected.
        for (let i = 0; i < caretMap.length; i++) {
            const target = caretMap.get(i);
            const globalScope = inspector.getRecord(target.uri).analyzerScope.globalScope;

            const expected =
                expectedList[i]
                    .sort().map(concatIndexAndItem).join(", ");

            const completions =
                provideCompletion(globalScope, target.position).map(c => c.item.label)
                    .sort().map(concatIndexAndItem).join(", ");

            if (completions !== expected) {
                throw new Error(`Incorrect completion.\nexpected: [${expected}]\nactual  : [${completions}]`);
            }
        }
    });
}

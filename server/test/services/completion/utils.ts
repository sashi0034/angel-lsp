import {provideCompletion} from '../../../src/services/completion';
import {copyGlobalSettings, resetGlobalSettings} from '../../../src/core/settings';
import {FileContents, makeFileContentList, inspectFileContents} from '../../inspectorUtils';
import {CaretMap} from '../caretMap';
import {afterEach, beforeEach} from 'mocha';

function concatIndexAndItem(item: string, index: number) {
    return `${index}:${item}`;
}

export function useCompletionWithoutBuiltinItems() {
    beforeEach(() => {
        const settings = copyGlobalSettings();
        settings.completion.builtinItems = false;
        resetGlobalSettings(settings);
    });

    afterEach(() => {
        resetGlobalSettings(undefined);
    });
}

export function testCompletion(fileContents: FileContents, ...expectedList: string[][]) {
    const fileContentList = makeFileContentList(fileContents);

    const caretMap = new CaretMap();
    caretMap.processFiles(fileContentList);

    if (caretMap.length !== expectedList.length) {
        throw new Error(`Expected ${expectedList.length} caret positions, but got ${caretMap.length}`);
    }

    const inspector = inspectFileContents(fileContentList);

    // Iterate through each caret position and check if the completions are as expected.
    for (let i = 0; i < caretMap.length; i++) {
        const target = caretMap.get(i);
        const record = inspector.getRecord(target.uri);
        const globalScope = record.analyzerScope.globalScope;

        const expected = expectedList[i].sort().map(concatIndexAndItem).join(', ');

        const completions = provideCompletion(
            record.preprocessedOutput.preprocessedTokens,
            record.ast,
            globalScope,
            target.position
        )
            .map(c => c.item.label)
            .sort()
            .map(concatIndexAndItem)
            .join(', ');

        if (completions !== expected) {
            throw new Error(
                `Incorrect completion on caret: ${i}.\nexpected: [${expected}]\nactual  : [${completions}]`
            );
        }
    }
}

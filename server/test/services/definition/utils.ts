import {FileContents, inspectFileContents, makeFileContentList} from "../../inspectorUtils";
import {makeCaretListAndContent} from "../caretUtils";
import {Inspector} from "../../../src/inspector/inspector";
import {provideDefinitionAsToken} from "../../../src/services/definition";

export function testDefinition(fileContents: FileContents, mapping?: [number, number][]) {
    const fileContentList = makeFileContentList(fileContents);
    const targetUri = fileContentList.at(-1)!.uri;
    const targetContent = fileContentList.at(-1)!.content;

    const {caretList, actualContent} = makeCaretListAndContent(targetContent);
    fileContentList.at(-1)!.content = actualContent;

    if (caretList.length < 2) {
        throw new Error("Expected at least 2 caret positions");
    }

    if (mapping === undefined) {
        // Create mapping from 1 to 0, 2 to 0, 3 to 0, etc.
        mapping = mapping ?? [];
        for (let i = 1; i < caretList.length; i++) {
            mapping.push([i, 0]);
        }
    } else {
        // Check if all caret positions are mapped.
        for (let i = 0; i < caretList.length; i++) {
            if (mapping.find(([a, b]) => a === i || b === i) === undefined) {
                throw new Error(`Missing mapping for caret $C${i}$`);
            }
        }
    }

    it(`[definition] ${targetContent}`, () => {
        const inspector = inspectFileContents(fileContentList);

        const globalScope = inspector.getRecord(targetUri).analyzerScope.globalScope;
        const allGlobalScopes = inspector.getAllRecords().map(record => record.analyzerScope.globalScope);

        // Iterate through the mapping and check if the definition is correct.
        for (let i = 0; i < mapping.length; i++) {
            const fromCaret = caretList[mapping[i][0]];
            const toCaret = caretList[mapping[i][1]];

            const definitionToken = provideDefinitionAsToken(globalScope, allGlobalScopes, fromCaret);
            if (definitionToken === undefined) {
                throw new Error(`Missing definition for ${fromCaret.simpleFormat()}`);
            }

            const definitionLocation = definitionToken.location;
            if (definitionLocation.positionInRange(toCaret) === false) {
                throw new Error(`Expected definition ${toCaret.simpleFormat()}, but got ${definitionLocation.start.simpleFormat()} - ${definitionLocation.end.simpleFormat()}`);
            }
        }
    });
}

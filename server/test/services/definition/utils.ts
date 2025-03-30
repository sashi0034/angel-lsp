import {FileContents, inspectFileContents, makeFileContentList} from "../../inspectorUtils";
import {provideDefinitionAsToken} from "../../../src/services/definition";
import {CaretMap} from "../caretMap";

export function testDefinition(fileContents: FileContents, mapping?: [number, number][]) {
    const fileContentList = makeFileContentList(fileContents);
    const lastContent = fileContentList.at(-1)!.content;

    const caretMap = new CaretMap();
    caretMap.processFiles(fileContentList);

    if (caretMap.length < 2) {
        throw new Error("Expected at least 2 caret positions");
    }

    if (mapping === undefined) {
        // Create mapping from 1 to 0, 2 to 0, 3 to 0, etc.
        mapping = mapping ?? [];
        for (let i = 1; i < caretMap.length; i++) {
            mapping.push([i, 0]);
        }
    } else {
        // Check if all caret positions are mapped.
        for (let i = 0; i < caretMap.length; i++) {
            if (mapping.find(([a, b]) => a === i || b === i) === undefined) {
                throw new Error(`Missing mapping for caret $C${i}$`);
            }
        }
    }

    it(`[definition] ${lastContent}`, () => {
        const inspector = inspectFileContents(fileContentList);

        // Iterate through the mapping and check if the definition is correct.
        for (let i = 0; i < mapping.length; i++) {
            const fromId = mapping[i][0];
            const toId = mapping[i][1];

            const fromUri = caretMap.get(fromId).uri;
            const toUri = caretMap.get(toId).uri;

            const fromCaret = caretMap.get(fromId).position;
            const toCaret = caretMap.get(toId).position;

            const globalScope = inspector.getRecord(fromUri).analyzerScope.globalScope;
            const allGlobalScopes = inspector.getAllRecords().map(record => record.analyzerScope.globalScope);

            const definitionToken = provideDefinitionAsToken(globalScope, allGlobalScopes, fromCaret);
            if (definitionToken === undefined) {
                throw new Error(`Missing definition for ${fromCaret.simpleFormat()}`);
            }

            const definitionLocation = definitionToken.location;
            if (definitionLocation.positionInRange(toCaret) === false || definitionLocation.path !== toUri) {
                throw new Error(`Expected definition of $C${fromId}$ to be ${toCaret.simpleFormat()}, but got ${definitionLocation.start.simpleFormat()} - ${definitionLocation.end.simpleFormat()}`);
            }
        }
    });
}

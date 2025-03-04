import {makeCaretListAndContent} from "./utils";
import {flushInspectedRecord, getInspectedRecord, inspectFile} from "../../src/inspector/inspector";
import {provideDefinitionAsToken} from "../../src/services/definition";

function testDefinition(rawContent: string) {
    const {caretList, content} = makeCaretListAndContent(rawContent);
    if (caretList.length < 2) {
        throw new Error("Expected at least 2 caret positions");
    }

    it(`definition ${rawContent}`, () => {
        const uri = "/foo/bar.as";
        inspectFile(uri, content);
        flushInspectedRecord();
        const globalScope = getInspectedRecord(uri).analyzerScope.globalScope;

        for (let i = 1; i < caretList.length; i++) {
            const definitionToken = provideDefinitionAsToken(globalScope, caretList[i]);
            if (definitionToken === undefined) {
                throw new Error(`Missing definition for ${caretList[i].formatWithColon()}`);
            }

            const definitionLocation = definitionToken.location;
            if (definitionLocation.positionInRange(caretList[0]) === false) {
                throw new Error(`Expected definition ${caretList[0].formatWithColon()}, but got ${definitionLocation.start.formatWithColon()} - ${definitionLocation.end.formatWithColon()}`);
            }
        }
    });
}

describe("Definition", () => {
    // The definition location is marked by "<c0>",
    // on the other hand, the cursor for go-to definition is marked by "<c1>", "<c2>", etc.

    testDefinition(`
        int sum<c0>(int v) {
            if (v == 0) return 0;
            return v + sum<c1>(v - 1;)
        }`
    );

    testDefinition(`
        int sum(int v<c0>) {
            if (v == 0) return 0;
            return v<c1> + sum(v<c2> - 1;)
        }`
    );

    testDefinition(`
        class Foo {
            int value<c0>;
        
            int add(int v) { return v + value; }
        }

        void main() {
            Foo foo;
            foo.value<c1> = 2;
        }`
    );
});

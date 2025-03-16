import {makeCaretListAndContent} from "./utils";
import {
    flushInspectedRecord,
    getInspectedRecord,
    getInspectedRecordList,
    inspectFile
} from "../../src/inspector/inspector";
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
        const globalScopeList = getInspectedRecordList().map(record => record.analyzerScope.globalScope);

        for (let i = 1; i < caretList.length; i++) {
            const definitionToken = provideDefinitionAsToken(globalScope, globalScopeList, caretList[i]);
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
    // The definition location is marked by "$C0$",
    // on the other hand, the cursor for go-to definition is marked by "$C1$", "$C2$", etc.

    testDefinition(`
        int sum$C0$(int v) {
            if (v == 0) return 0;
            return v + sum$C1$(v - 1;)
        }`
    );

    testDefinition(`
        int sum(int v$C0$) {
            if (v == 0) return 0;
            return v$C1$ + sum(v$C2$ - 1;)
        }`
    );

    testDefinition(`
        class Foo {
            int value$C0$;
        
            int add(int v) { return v + value; }
        }

        void main() {
            Foo foo;
            foo.value$C1$ = 2;
        }`
    );

    testDefinition(`
        void ovl_fn$C0$(int a, int b) { }
        void ovl_fn(float a, float b) { }
        void ovl_fn(double a, double b) { }
        void main() { ovl_fn$C1$(1, 2); }`
    );

    testDefinition(`
        void ovl_fn(int a, int b) { }
        void ovl_fn$C0$(float a, float b) { }
        void ovl_fn(double a, double b) { }
        void main() { ovl_fn$C1$(1.1f, 2.1f); }`
    );

    testDefinition(`
        void ovl_fn(int a, int b) { }
        void ovl_fn(float a, float b) { }
        void ovl_fn$C0$(double a, double b) { }
        void main() { ovl_fn$C1$(1.2, 2.2); }`
    );
});

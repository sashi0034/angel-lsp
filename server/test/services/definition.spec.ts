import {makeCaretListAndContent} from "./caretUtils";
import {
    Inspector
} from "../../src/inspector/inspector";
import {provideDefinitionAsToken} from "../../src/services/definition";

function testDefinition(rawContent: string, mapping?: [number, number][]) {
    const {caretList, actualContent} = makeCaretListAndContent(rawContent);
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

    it(`definition ${rawContent}`, () => {
        const inspector = new Inspector();

        const uri = "/foo/bar.as";
        inspector.inspectFile(uri, actualContent);

        inspector.flushRecord();

        const globalScope = inspector.getRecord(uri).analyzerScope.globalScope;
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

    testDefinition(`
        namespace A$C0$ {
            namespace B$C1$ {
                namespace C_0$C2$ { int c_0$C3$; }
            }
        }
        
        namespace A$C4$ {
            namespace B$C5$ {
                namespace C_1$C6$ { int c_1$C7$; }
            }
        }
        
        enum A$C8$ { Red$C9$ }
        
        void main() {
            A$C10$ :: B$C11$ :: C_0$C12$ :: c_0$C13$ = 1;
            A$C14$ :: B$C15$ :: C_1$C16$ :: c_1$C17$ = 2;
            int v = A$C18$ :: Red$C19$;
        }
    `, [[10, 0], [11, 1], [12, 2], [13, 3], [14, 4], [15, 5], [16, 6], [17, 7], [18, 8], [19, 9]]
        // This mapping is an array of pairs of caret positions in the format [(from), (to)]
    );

    testDefinition(`
        class B { }
        class C { }

        void foo(int a, B b$C0$ = B(), C c = C(), bool d = false, double e = 0) { }

        void main() {
            foo(1, e: 2.0, b$C1$: B(), d: true);
        }
    `);
});

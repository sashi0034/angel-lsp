import {flushInspectedRecord, getInspectedRecord, inspectFile} from "../../src/inspector/inspector";
import {provideCompletion} from "../../src/services/completion";
import {makeCaretListAndContent} from "./utils";

function concatIndexAndItem(item: string, index: number) {
    return `${index}:${item}`;
}

function testCompletion(rawContent: string, ...expectedList: string[][]) {
    const {caretList, content} = makeCaretListAndContent(rawContent);

    if (caretList.length !== expectedList.length) {
        throw new Error(`Expected ${expectedList.length} caret positions, but got ${caretList.length}`);
    }

    it(`completion ${rawContent}`, () => {
        const uri = "/foo/bar.as";
        inspectFile(uri, content);
        flushInspectedRecord();
        const globalScope = getInspectedRecord(uri).analyzerScope.globalScope;

        // Iterate through each caret position and check if the completions are as expected.
        for (let i = 0; i < caretList.length; i++) {
            const caret = caretList[i];
            const expected =
                expectedList[i].sort().map(concatIndexAndItem).join(", ");
            const completions =
                provideCompletion(globalScope, caret).map(c => c.label).sort().map(concatIndexAndItem).join(", ");
            if (completions !== expected) {
                throw new Error(`Incorrect completion.\nexpected: [${expected}]\nactual  : [${completions}]`);
            }
        }
    });
}

describe("Completion", () => {
    // Caret is marked by "$C0$", "$C2$", etc.

    testCompletion(`
        void foo() { 
            int x = 1; 
        }
        
        void bar() {
            int y = 1;
            while (y < 10) {
                $C0$
            }
        }    
        `, ["foo", "bar", "y"]
    );

    testCompletion(`
        class Player {
            int x, y;
            
            void attack() { $C0$ }
            
            private void move() { }
        }
        
        void bar() {
            int y = 1;
            Player player;
            player.$C1$
        }    
        `,  /* $C0$ */ ["Player", "x", "y", "this", "attack", "move", "bar"]
        , /* $C1$ */ ["x", "y", "attack"]
    );

    testCompletion(`
        namespace foo {
            namespace bar {
                void call_baz() { }
            }
            
            void call_foo() { }
        }
        
        void main() {
            foo::$C0$
        }
    `, ["bar", "call_foo"]
    );

    testCompletion(`
        namespace foo {
            namespace bar {
                void call_baz() { }
            }
            
            void call_foo() { }
        }
        
        void main() {
            foo::bar::$C0$
        }
    `, ["call_baz"]
    );

    testCompletion(`
        class Foo {
            int x;
            private int z;
            protected int y;
            
            void a() { }
            private void b() { }
            protected void c() { }
        }
        
        class Bar : Foo {
            int w;
            void d() { $C0$ }
            
            private int v;
            private void e() { }
        }
        
        void main() {
            Bar bar;
            bar.$C1$
        }`
        , /* $C0 */ ["Foo", "Bar", "x", "y", "a", "c", "this", "w", "v", "d", "e", "main"]
        , /* $C1 */ ["w", "d", "x", "a"]
    );

    testCompletion(`
        class A {
            void apple();
        }
        
        namespace A {
            namespace B {
                void beta_0() { }
                
                namespace C_0 { int c_0; }
            }

            void alpha_0() { }
        }
        
        namespace A {
            namespace B {
                void beta_1() { }
                
                namespace C_1 { int c_1; }
            }

            void alpha_1() { }
        }
        
        void main() {
            A::$C0$B::$C1$ int value; // We want to complement even though it is invalid syntax.
            
            A a;
            a.$C2$
        }`
        , /* $C0$ */ ["B", "alpha_0", "alpha_1"]
        , /* $C1$ */ ["beta_0", "beta_1", "C_0", "C_1"]
        , /* $C2$ */ ["apple"]
    );
});

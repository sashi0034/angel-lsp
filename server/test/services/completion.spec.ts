import {flushInspectedRecord, getInspectedRecord, inspectFile} from "../../src/inspector/inspector";
import {provideCompletions} from "../../src/services/completion";
import {makeCaretAndContent} from "./utils";

function testCompletion(rawContent: string, expected: string[]) {
    const {caret, content} = makeCaretAndContent(rawContent);

    it(`completion ${rawContent}`, () => {
        const uri = "/foo/bar.as";
        inspectFile(uri, content);
        flushInspectedRecord();
        const globalScope = getInspectedRecord(uri).analyzerScope.globalScope;

        const completions = provideCompletions(globalScope, caret).map(c => c.label);
        if (completions.length !== expected.length) {
            throw new Error(`Expected completions [${expected.join(", ")}], but got [${completions.join(", ")}]`);
        }

        let remainingCandidates = expected;
        completions.map((item) => {
            remainingCandidates = remainingCandidates.filter((candidate) => candidate !== item);
        });

        if (remainingCandidates.length > 0) {
            throw new Error(`Expected completions [${expected.join(", ")}], but got [${completions.join(", ")}]`);
        }
    });
}

describe("Completion", () => {
    // Caret is marked by "$C$"

    testCompletion(`
        void foo() { 
            int x = 1; 
        }
        
        void bar() {
            int y = 1;
            while (y < 10) {
                $C$
            }
        }    
        `, ["foo", "bar", "y"]
    );

    testCompletion(`
        class Player {
            int x, y;
            
            void attack() { }
            
            private void move() { }
        }
        
        void bar() {
            int y = 1;
            Player player;
            player.$C$
        }    
        `, ["x", "y", "attack"]
    );

    testCompletion(`
        class Player {
            int x, y;
            
            void attack() { $C$ }
            
            private void move() { }
        }
        
        void bar() { }    
        `, ["Player", "x", "y", "this", "attack", "move", "bar"]
    );

    testCompletion(`
        namespace foo {
            namespace bar {
                void call_baz() { }
            }
            
            void call_foo() { }
        }
        
        void main() {
            foo::$C$
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
            foo::bar::$C$
        }
    `, ["call_baz"]
    );
});

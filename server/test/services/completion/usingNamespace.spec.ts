import {testCompletion} from "./utils";

describe('completion/usingNamespace', () => {
    testCompletion(`// Completion with using namespace in a statement block
        namespace foo {
            namespace bar {
                void call_baz() { }
            }
        }
        
        void fn_0() {
            using namespace foo;
            $C0$
        }

        void fn_1() {
            using namespace foo;
            bar::$C1$
        }
    `
        , /* $C0$ */ ["bar", "fn_0", "fn_1", "foo"]
        , /* $C1$ */ ["call_baz"]
    );

    testCompletion(`// Completion with using namespace in a statement block
        namespace foo {
            namespace bar {
                void call_baz() { }
            }
        }
        
        using namespace foo::bar;

        void fn_1() {
            $C0$
        }
    `
        , ["call_baz", "fn_1", "foo"]
    );
});

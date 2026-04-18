import {testCompletion, useCompletionWithoutBuiltinItems} from './utils';

describe('completion/declarationPart', () => {
    useCompletionWithoutBuiltinItems();

    it('omits completions while declaring a local variable type', () => {
        testCompletion(
            `
            struct MyObj { }
            
            void f() {
                MyObj $C0$
            }
        `,
            /* $C0$ */ []
        );
    });

    it('omits completions while declaring a function parameter name', () => {
        testCompletion(
            `
            struct MyObj { }
            
            void f(const MyObj& in $C0$) {
            }
        `,
            /* $C0$ */ []
        );
    });

    it('omits completions at declaration names and parameter names', () => {
        testCompletion(
            `
            struct MyObj { }

            int $C0$value = 2;

            void $C1$ my_$C2$ (const MyObj& in $C3$, MyObj $C4$myObj) {
                MyObj $C5$
            }
            `,
            /* $C0$ */ [],
            /* $C1$ */ [],
            /* $C2$ */ [],
            /* $C3$ */ [],
            /* $C4$ */ [],
            /* $C5$ */ []
        );
    });
});

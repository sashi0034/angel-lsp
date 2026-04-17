import {testCompletion, useCompletionWithoutBuiltinItems} from './utils';

describe('completion/function', () => {
    useCompletionWithoutBuiltinItems();

    it('completes functions and locals in a statement block', () => {
        testCompletion(
            `// Basic function completion
            void foo() {
                int x = 1;
            }

            void bar() {
                int y = 1;
                while (y < 10) {
                    $C0$
                }
            }
            `,
            ['foo', 'bar', 'y']
        );
    });
});

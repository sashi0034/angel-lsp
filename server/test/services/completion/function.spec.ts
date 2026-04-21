import {testCompletion, useCompletionWithoutBuiltinKeywords} from './utils';

describe('completion/function', () => {
    useCompletionWithoutBuiltinKeywords();

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

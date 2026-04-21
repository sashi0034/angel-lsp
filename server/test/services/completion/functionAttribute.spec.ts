import {functionAttributeCompletionKeywords} from '../../../src/services/completion/functionSection';
import {testCompletion, useCompletionWithoutBuiltinKeywords} from './utils';

describe('completion/functionAttribute', () => {
    useCompletionWithoutBuiltinKeywords();

    it('provides function suffix keywords after a parameter list', () => {
        testCompletion(
            `
            int unrelatedSymbol;

            class MyClass {
                void f() $C0$ {
                }
            }
            `,
            /* $C0$ */ [...functionAttributeCompletionKeywords]
        );
    });

    it('omits const after it is already present', () => {
        testCompletion(
            `
            int unrelatedSymbol;

            class MyClass {
                void f() const $C0$ {
                }
            }
            `,
            /* $C0$ */ functionAttributeCompletionKeywords.filter(keyword => keyword !== 'const')
        );
    });

    it('omits already used function attributes', () => {
        testCompletion(
            `
            int unrelatedSymbol;

            class MyClass {
                void f() const override $C0$ {
                }
            }
            `,
            /* $C0$ */ functionAttributeCompletionKeywords.filter(
                keyword => keyword !== 'const' && keyword !== 'override'
            )
        );
    });

    it('does not provide function suffix keywords outside the suffix position', () => {
        testCompletion(
            `
            int unrelatedSymbol;

            class MyClass {
                void f($C0$) {
                    $C1$
                }
            }
            `,
            /* $C0$ */ ['MyClass', 'f', 'this', 'unrelatedSymbol'],
            /* $C1$ */ ['MyClass', 'f', 'this', 'unrelatedSymbol']
        );
    });

    it('does not provide function suffix keywords before an existing suffix keyword', () => {
        testCompletion(
            `
            class MyClass {
                void f() $C0$ const {
                }
            }
            `,
            /* $C0$ */ []
        );
    });

    it('provides function suffix keywords after an existing suffix keyword', () => {
        testCompletion(
            `
            class MyClass {
                void f() const ov$C0$  {
                }
            }
            `,
            /* $C0$ */ functionAttributeCompletionKeywords.filter(keyword => keyword !== 'const')
        );
    });
});

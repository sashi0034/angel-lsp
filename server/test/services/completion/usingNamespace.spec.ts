import {testCompletion} from './utils';

describe('completion/usingNamespace', () => {
    it('completes namespaces introduced in a statement block', () => {
        testCompletion(
            `// Completion with using namespace in a statement block
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
        `,
            /* $C0$ */ ['bar', 'fn_0', 'fn_1', 'foo'],
            /* $C1$ */ ['call_baz']
        );
    });

    it('completes symbols from a file-level using namespace directive', () => {
        testCompletion(
            `// Completion with using namespace in a statement block
            namespace foo {
                namespace bar {
                    void call_baz() { }
                }
            }

            using namespace foo::bar;

            void fn_1() {
                $C0$
            }
        `,
            ['call_baz', 'fn_1', 'foo']
        );
    });

    it('does not duplicate namespaces from included using directives', () => {
        testCompletion(
            [
                {
                    uri: 'file:///path/to/file_1.as',
                    content: `
                namespace foo {
                    int bar;
                }

                using namespace foo;
                `
                },
                {
                    uri: 'file:///path/to/file_2.as',
                    content: `
                #include "file_1.as"
                using namespace foo;
            `
                },
                {
                    uri: 'file:///path/to/file_3.as',
                    content: `// 'foo' must not appear twice. (#223)
                #include "file_2.as"
                void main() {
                    $C0$
                }
            `
                }
            ],
            /* $C0$ */ ['foo', 'bar', 'main'] // Before the bug was fixed, foo appeared twice in the suggestions.
        );
    });
});

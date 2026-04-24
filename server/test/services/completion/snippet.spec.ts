import {SnippetContext, snippetDefinitions} from '../../../src/services/completion/snippet';
import {copyGlobalSettings, resetGlobalSettings} from '../../../src/core/settings';
import {testCompletion} from './utils';
import {ok} from 'node:assert';

function snippetsInContext(context: string): string[] {
    return snippetDefinitions
        .filter(
            snippet =>
                (snippet.contexts as readonly string[]).includes(SnippetContext.Everywhere) ||
                (snippet.contexts as readonly string[]).includes(context)
        )
        .map(snippet => snippet.label);
}

function snippetInScript(): string[] {
    return snippetsInContext(SnippetContext.Script);
}

function snippetInClass(): string[] {
    return snippetsInContext(SnippetContext.Class);
}

function snippetInStatement(): string[] {
    return snippetsInContext(SnippetContext.Statement);
}

function snippetEverywhere(): string[] {
    return snippetsInContext(SnippetContext.Everywhere);
}

describe('completion/snippet', () => {
    beforeEach(() => {
        const settings = copyGlobalSettings();
        settings.completion.builtinKeywords = false;
        settings.completion.snippets = true;
        resetGlobalSettings(settings);
    });

    afterEach(() => {
        resetGlobalSettings(undefined);
    });

    it('provides context-specific snippets', () => {
        ok(snippetInStatement().includes('for'));
        ok(!snippetInScript().includes('for'));
        ok(!snippetInClass().includes('for'));

        ok(!snippetInStatement().includes('funcdef'));
        ok(snippetInScript().includes('funcdef'));
        ok(snippetInClass().includes('funcdef'));

        ok(snippetInStatement().includes('cast'));
        ok(snippetInScript().includes('cast'));
        ok(snippetInClass().includes('cast'));
    });

    it('provides statement snippets in statement blocks only', () => {
        testCompletion(
            `
            class MyObj { }

            void f() {
                $C0$

                switch (undefined_value) {
                    case 0:
                        $C1$
                        break;
                    default:
                        $C2$
                        break;
                }

                if (true) {
                    i$C3$
                }
            }
        `,
            /* $C0$ */ ['MyObj', 'f', ...snippetInStatement()],
            /* $C1$ */ ['MyObj', 'f', ...snippetInStatement()],
            /* $C2$ */ ['MyObj', 'f', ...snippetInStatement()],
            /* $C3$ */ ['MyObj', 'f', ...snippetInStatement()]
        );
    });

    it('provides script snippets at file and namespace scope only', () => {
        testCompletion(
            `
            $C0$

            namespace N {
                $C1$
            }
        `,
            /* $C0$ */ ['N', ...snippetInScript()],
            /* $C1$ */ ['N', ...snippetInScript()]
        );
    });

    it('provides class member snippets in class scope only', () => {
        testCompletion(
            `
            class MyObj {
                $C0$
            }
        `,
            /* $C0$ */ ['MyObj', 'this', ...snippetInClass()]
        );
    });

    it('provides only context-free snippets inside declarations', () => {
        testCompletion(
            `
            void f($C0$) {
            }

            class MyObj {
                void method($C1$) {
                    $C2$
                }
            }
        `,
            /* $C0$ */ ['MyObj', 'f', ...snippetEverywhere()],
            /* $C1$ */ ['MyObj', 'f', 'method', 'this', ...snippetEverywhere()],
            /* $C2$ */ ['MyObj', 'f', 'method', 'this', ...snippetInStatement()]
        );
    });

    it('provides cast snippets inside expressions', () => {
        testCompletion(
            `
            void f(int source) {
                int value = ca$C0$;
                if (ca$C1$) {
                }
            }
        `,
            /* $C0$ */ ['f', 'source', 'value', ...snippetEverywhere()],
            /* $C1$ */ ['f', 'source', 'value', ...snippetEverywhere()]
        );
    });

    it('keeps class snippets at class scope but hides them in member declarations', () => {
        testCompletion(
            `
            class MyObj {
                $C0$
                void method() {
                }
            }
        `,
            /* $C0$ */ ['MyObj', 'method', 'this', ...snippetInClass()]
        );
    });
});

import {copyGlobalSettings, resetGlobalSettings} from '../../../src/core/settings';
import {directiveCompletionDefinitions} from '../../../src/services/completion/directive';
import {testCompletion} from './utils';

function directiveCompletions(): string[] {
    return directiveCompletionDefinitions.map(definition => definition.label);
}

describe('completion/directive', () => {
    beforeEach(() => {
        const settings = copyGlobalSettings();
        settings.completion.builtinKeywords = true;
        settings.completion.snippets = true;
        resetGlobalSettings(settings);
    });

    afterEach(() => {
        resetGlobalSettings(undefined);
    });

    it('provides only directive completions after #', () => {
        testCompletion(
            `
            #$C0$
            #el$C1$
            void f() {
                ;
                #$C2$
            }
        `,
            /* $C0$ */ directiveCompletions(),
            /* $C1$ */ directiveCompletions(),
            /* $C2$ */ directiveCompletions()
        );
    });

    it('provides preprocessor symbol completions in conditional directives', () => {
        const settings = copyGlobalSettings();
        settings.definedSymbols = ['EXTERNAL_SYMBOL'];
        resetGlobalSettings(settings);

        testCompletion(
            `
            #define LOCAL_SYMBOL

            #$C0$if LOCAL_SYMBOL
            #endif

            #if$C1$ LOCAL_SYMBOL
            #endif

            #if LOCAL_SYMBOL $C2$
            #endif

            #if $C3$
            #endif

            #if LOCAL$C4$
            #endif

            #if 0
            #elif $C5$
            #endif
        `,
            /* $C0$ */ ['EXTERNAL_SYMBOL', 'LOCAL_SYMBOL'],
            /* $C1$ */ ['EXTERNAL_SYMBOL', 'LOCAL_SYMBOL'],
            /* $C2$ */ ['EXTERNAL_SYMBOL', 'LOCAL_SYMBOL'],
            /* $C3$ */ ['EXTERNAL_SYMBOL', 'LOCAL_SYMBOL'],
            /* $C4$ */ ['EXTERNAL_SYMBOL', 'LOCAL_SYMBOL'],
            /* $C5$ */ ['EXTERNAL_SYMBOL', 'LOCAL_SYMBOL']
        );
    });
});

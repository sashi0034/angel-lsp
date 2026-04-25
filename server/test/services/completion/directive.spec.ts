import {copyGlobalSettings, resetGlobalSettings} from '../../../src/core/settings';
import {directiveCompletionDefinitions} from '../../../src/services/completion/directive';
import {testCompletion} from './utils';

function directiveCompletions(): string[] {
    return directiveCompletionDefinitions.map(definition => definition.label);
}

describe('completion/directive', () => {
    beforeEach(() => {
        const settings = copyGlobalSettings();
        settings.completion.builtinKeywords = false;
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
});

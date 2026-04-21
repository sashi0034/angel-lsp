import {copyGlobalSettings, resetGlobalSettings} from '../../../src/core/settings';
import {testCompletion, useCompletionWithoutBuiltinKeywords} from './utils';
import {afterEach, beforeEach} from 'mocha';
import {builtinCompletionKeywords} from '../../../src/services/completion';

describe('completion/builtinKeyword', () => {
    describe('when enabled', () => {
        beforeEach(() => {
            const settings = copyGlobalSettings();
            settings.completion.builtinKeywords = true;
            settings.completion.snippets = false;
            resetGlobalSettings(settings);
        });

        afterEach(() => {
            resetGlobalSettings(undefined);
        });

        it('completes built-in types, literals, and modifiers', () => {
            testCompletion(
                `
                $C0$
                
                void main($C1$) {
                    $C2$
                }
                
                $C3$
                `,
                /* $C0$ */ ['main', ...builtinCompletionKeywords],
                /* $C1$ */ ['main', ...builtinCompletionKeywords],
                /* $C2$ */ ['main', ...builtinCompletionKeywords],
                /* $C3$ */ ['main', ...builtinCompletionKeywords]
            );
        });
    });

    describe('when disabled', () => {
        useCompletionWithoutBuiltinKeywords();

        it('omits built-in types, literals, and modifiers', () => {
            testCompletion(
                `
                void main() {
                    $C0$
                }
                `,
                /* $C0$ */ ['main']
            );
        });
    });
});

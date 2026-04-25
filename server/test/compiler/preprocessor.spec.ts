import {afterEach, describe, it} from 'mocha';
import {copyGlobalSettings, resetGlobalSettings} from '../../src/core/settings';
import {inspectFileContents} from '../inspectorUtils';
import {ok} from 'node:assert';

const uri = 'file:///path/to/file.as';

function getPreprocessedTokenTexts(content: string): string[] {
    const inspector = inspectFileContents([{uri, content}]);
    return inspector.getRecord(uri).preprocessedOutput.preprocessedTokens.map(token => token.text);
}

describe('compiler/preprocessor', () => {
    afterEach(() => {
        resetGlobalSettings(undefined);
    });

    it('uses configured preprocessor defined symbols', () => {
        const content = `
#if ENABLE_SYMBOL
int featureEnabled;
#endif

int alwaysEnabled;
`;
        const settings = copyGlobalSettings();
        settings.definedSymbols = ['ENABLE_SYMBOL'];
        resetGlobalSettings(settings);

        const tokenTexts = getPreprocessedTokenTexts(content);

        ok(tokenTexts.includes('featureEnabled'));
        ok(tokenTexts.includes('alwaysEnabled'));
    });

    it('omits inactive #if blocks without configured symbols', () => {
        const content = `
#if ENABLE_SYMBOL
int featureEnabled;
#endif

int alwaysEnabled;
`;
        resetGlobalSettings(undefined);

        const tokenTexts = getPreprocessedTokenTexts(content);

        ok(!tokenTexts.includes('featureEnabled'));
        ok(tokenTexts.includes('alwaysEnabled'));
    });

    it('uses the first active #elif branch', () => {
        const content = `
#if DISABLED_SYMBOL
int disabledBranch;
#elif ENABLE_SYMBOL
int elifBranch;
#else
int elseBranch;
#endif
`;
        const settings = copyGlobalSettings();
        settings.definedSymbols = ['ENABLE_SYMBOL'];
        resetGlobalSettings(settings);

        const tokenTexts = getPreprocessedTokenTexts(content);

        ok(!tokenTexts.includes('disabledBranch'));
        ok(tokenTexts.includes('elifBranch'));
        ok(!tokenTexts.includes('elseBranch'));
    });

    it('uses #else when no previous branch is active', () => {
        const content = `
#if DISABLED_SYMBOL
int disabledBranch;
#elif ALSO_DISABLED
int elifBranch;
#else
int elseBranch;
#endif
`;

        const tokenTexts = getPreprocessedTokenTexts(content);

        ok(!tokenTexts.includes('disabledBranch'));
        ok(!tokenTexts.includes('elifBranch'));
        ok(tokenTexts.includes('elseBranch'));
    });

    it('evaluates numeric #if conditions', () => {
        const content = `
#if 0
int zeroBranch;
#endif

#if 1
int oneBranch;
#endif
`;

        const tokenTexts = getPreprocessedTokenTexts(content);

        ok(!tokenTexts.includes('zeroBranch'));
        ok(tokenTexts.includes('oneBranch'));
    });
});

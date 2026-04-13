import {afterEach, describe, it} from 'mocha';
import * as assert from 'assert';
import {copyGlobalSettings, resetGlobalSettings} from '../../src/core/settings';
import {inspectFileContents} from '../inspectorUtils';

const uri = 'file:///path/to/file.as';
const content = `
#if ENABLE_SYMBOL
int featureEnabled;
#endif

int alwaysEnabled;
`;

function getPreprocessedTokenTexts(): string[] {
    const inspector = inspectFileContents([{uri, content}]);
    return inspector.getRecord(uri).preprocessedOutput.preprocessedTokens.map(token => token.text);
}

describe('compiler/preprocessor', () => {
    afterEach(() => {
        resetGlobalSettings(undefined);
    });

    it('uses configured preprocessor defined symbols', () => {
        const settings = copyGlobalSettings();
        settings.definedSymbols = ['ENABLE_SYMBOL'];
        resetGlobalSettings(settings);

        const tokenTexts = getPreprocessedTokenTexts();

        assert(tokenTexts.includes('featureEnabled'));
        assert(tokenTexts.includes('alwaysEnabled'));
    });

    it('omits inactive #if blocks without configured symbols', () => {
        resetGlobalSettings(undefined);

        const tokenTexts = getPreprocessedTokenTexts();

        assert(!tokenTexts.includes('featureEnabled'));
        assert(tokenTexts.includes('alwaysEnabled'));
    });
});

import {expectSuccess} from './utils';
import {afterEach, beforeEach} from 'mocha';
import {copyGlobalSettings, resetGlobalSettings} from '../../../src/core/settings';

describe('analyzer/implicitMutualInclusion', () => {
    beforeEach(() => {
        const settings = copyGlobalSettings();
        settings.implicitMutualInclusion = true;
        resetGlobalSettings(settings);
    });

    afterEach(() => {
        resetGlobalSettings(undefined);
    });

    it('accepts analyzer case 1', () => {
        expectSuccess([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                    class Vector {
                        float x, y, z;
                    }`
            },
            {
                uri: 'file:///path/to/file_1.as',
                content: `
                    class File1 {
                        File2 file2;
                    }`
            },
            {
                uri: 'file:///path/to/file_2.as',
                content: `// Circular include is allowed.
                    class File2 : File1 {
                        Vector vector;
                    }`
            }
        ]);
    });
});

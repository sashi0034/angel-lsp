import {expectSuccess} from "./utils";
import {copyGlobalSettings, resetGlobalSettings} from "../../../src/core/settings";

describe('analyzer/implicitMutualInclusion', () => {
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
        }, {
            uri: 'file:///path/to/file_2.as',
            content: `// Circular include is allowed.
                class File2 : File1 {
                    Vector vector;
                }`
        }]).onBegin(() => {
        const settings = copyGlobalSettings();
        settings.implicitMutualInclusion = true;
        resetGlobalSettings(settings);
    });
});

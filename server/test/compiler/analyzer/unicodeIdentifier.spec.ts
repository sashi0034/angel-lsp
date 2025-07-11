import {expectError, expectSuccess} from "./utils";
import {copyGlobalSettings, resetGlobalSettings} from "../../../src/core/settings";

describe('analyzer/unicodeIdentifier', () => {
    expectSuccess(`// Unicode identifiers are allowed if the setting is enabled.
        void cjk() {
            int こんにちは = 1;
            こんにちは = 2;
        
            int 你好 = 2;
            你好 = 3;
        
            int 안녕하세요 = 3;
            안녕하세요 = 4;
        }
    `).onBegin(() => {
        const settings = copyGlobalSettings();
        settings.allowUnicodeIdentifiers = true;
        resetGlobalSettings(settings);
    });

    expectError(`// Unicode identifiers are not allowed if the setting is disabled.
        void cjk() {
            int こんにちは = 1;
            こんにちは = 2;
        
            int 你好 = 2;
            你好 = 3;
        
            int 안녕하세요 = 3;
            안녕하세요 = 4;
        }
    `).onBegin(() => {
        const settings = copyGlobalSettings();
        settings.allowUnicodeIdentifiers = false;
        resetGlobalSettings(settings);
    });
});

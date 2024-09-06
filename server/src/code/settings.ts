/**
 * LanguageServer settings.
 * See package.json because the settings in VSCode are defined in it.
 */
export interface LanguageServerSettings {
    implicitMutualInclusion: boolean;
    builtinStringTypes: string[];
    formatter: {
        maxBlankLines: number;
        indentSpaces: number;
        useTabIndent: boolean;
    };
    trace: {
        server: 'off' | 'messages' | 'verbose';
    };
}

const defaultSettings: LanguageServerSettings = {
    implicitMutualInclusion: false,
    builtinStringTypes: ["string", "String"],
    formatter: {
        maxBlankLines: 1,
        indentSpaces: 4,
        useTabIndent: false
    },
    trace: {
        server: 'off'
    }
};

let globalSettings: LanguageServerSettings = defaultSettings;

/**
 * Change the instance of global settings.
 */
export function changeGlobalSettings(config: any) {
    globalSettings = globalSettings = <LanguageServerSettings>(config || defaultSettings);
}

/**
 * Get the global settings.
 * The behavior of the LanguageServer configuration is controlled from here.
 */
export function getGlobalSettings(): LanguageServerSettings {
    return globalSettings;
}

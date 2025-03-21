/**
 * LanguageServer settings.
 * See package.json because the settings in VSCode are defined in it.
 */
export interface LanguageServerSettings {
    suppressAnalyzerErrors: boolean;
    implicitMutualInclusion: boolean;
    hoistEnumParentScope: boolean;
    explicitPropertyAccessor: boolean;
    supportsForEach: boolean;
    characterLiterals: boolean;
    supportsTypedEnumerations: boolean;
    experimental: {
        inlineHints: boolean;
    };
    builtinStringTypes: string[];
    builtinArrayType: string,
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
    suppressAnalyzerErrors: true,
    implicitMutualInclusion: false,
    hoistEnumParentScope: false,
    explicitPropertyAccessor: false,
    supportsForEach: false,
    characterLiterals: false,
    supportsTypedEnumerations: false,
    experimental: {
        inlineHints: false
    },
    builtinStringTypes: ["string", "String"],
    builtinArrayType: "array",
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
export function getGlobalSettings(): Readonly<LanguageServerSettings> {
    return globalSettings;
}

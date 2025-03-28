/**
 * LanguageServer settings.
 * See package.json because the settings in VSCode are defined in it.
 */
interface LanguageServerSettings {
    suppressAnalyzerErrors: boolean;
    includePath: string[];
    implicitMutualInclusion: boolean;
    hoistEnumParentScope: boolean;
    explicitPropertyAccessor: boolean;
    supportsForEach: boolean;
    characterLiterals: boolean;
    supportsTypedEnumerations: boolean;
    builtinStringType: string;
    builtinArrayType: string;
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
    includePath: [],
    implicitMutualInclusion: false,
    hoistEnumParentScope: false,
    explicitPropertyAccessor: false,
    supportsForEach: false,
    characterLiterals: false,
    supportsTypedEnumerations: false,
    builtinStringType: "string",
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
 * Reset the instance of global settings.
 */
export function resetGlobalSettings(config: any) {
    globalSettings = <LanguageServerSettings>(config ?? defaultSettings);
}

/**
 * Get the global settings.
 * The behavior of the LanguageServer configuration is controlled from here.
 */
export function getGlobalSettings(): Readonly<LanguageServerSettings> {
    return globalSettings;
}

import {string} from "vscode-languageserver/lib/common/utils/is";

/**
 * LanguageServer settings.
 * See package.json because the settings in VSCode are defined in it.
 */
interface LanguageServerSettings {
    suppressAnalyzerErrors: boolean;
    includePath: string[];
    forceIncludePredefined: string[];
    implicitMutualInclusion: boolean;
    hoistEnumParentScope: boolean;
    explicitPropertyAccessor: boolean;
    allowUnicodeIdentifiers: boolean;
    supportsForEach: boolean;
    characterLiterals: boolean;
    supportsTypedEnumerations: boolean;
    supportsDigitSeparators: boolean;
    builtinStringType: string;
    builtinArrayType: string;
    files: {
        angelScript: string[];
        exclude: string[];
    };
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
    forceIncludePredefined: [],
    implicitMutualInclusion: false,
    hoistEnumParentScope: false,
    explicitPropertyAccessor: false,
    allowUnicodeIdentifiers: false,
    supportsForEach: true,
    characterLiterals: false,
    supportsTypedEnumerations: false,
    supportsDigitSeparators: false,
    builtinStringType: "string",
    builtinArrayType: "array",
    files: {
        angelScript: ["*.as"],
        exclude: []
    },
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

export function copyGlobalSettings(): LanguageServerSettings {
    return structuredClone(globalSettings);
}

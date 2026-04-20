import {withDefaults} from '../utils/utilities';

/**
 * Language server settings.
 * The VS Code settings schema is defined in `package.json`.
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
    definedSymbols: string[];
    completion: {
        builtinItems: boolean;
        snippets: boolean;
    };
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
    builtinStringType: 'string',
    builtinArrayType: 'array',
    definedSymbols: [],
    completion: {
        builtinItems: true,
        snippets: true
    },
    files: {
        angelScript: ['*.as'],
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
 * Reset the global settings instance.
 */
export function resetGlobalSettings(config: any) {
    globalSettings = withDefaults(config, defaultSettings);
}

/**
 * Return the current global settings.
 * Language server behavior is controlled from here.
 */
export function getGlobalSettings(): Readonly<LanguageServerSettings> {
    return globalSettings;
}

export function copyGlobalSettings(): LanguageServerSettings {
    return structuredClone(globalSettings);
}

export interface LanguageServerSettings {
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

export function changeGlobalSettings(config: any) {
    globalSettings = globalSettings = <LanguageServerSettings>(config || defaultSettings);
}

export function getGlobalSettings(): LanguageServerSettings {
    return globalSettings;
}

export interface LanguageServerSettings {
    formatter: {
        maxBlankLines: number;
    };
    trace: {
        server: 'off' | 'messages' | 'verbose';
    };
}

const defaultSettings: LanguageServerSettings = {
    formatter: {
        maxBlankLines: 1
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

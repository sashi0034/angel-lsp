export interface LanguageServerSettings {
    maxNumberOfProblems: number;
    trace: {
        server: 'off' | 'messages' | 'verbose';
    };
}

const defaultSettings: LanguageServerSettings = {
    maxNumberOfProblems: 1000,
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

export interface LanguageServerSettings {
    maxNumberOfProblems: number;
    formatter: {
        maxBlankLines: number;
    };
    trace: {
        server: 'off' | 'messages' | 'verbose';
    };
}

const defaultSettings: LanguageServerSettings = {
    maxNumberOfProblems: 1000,
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

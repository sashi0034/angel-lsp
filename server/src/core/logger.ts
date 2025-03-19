import {getGlobalSettings} from "./settings";

export function message(info: string) {
    if (getGlobalSettings().trace.server === 'off') return;
    console.log(info);
}

export function error(info: string) {
    if (getGlobalSettings().trace.server === 'off') return;
    console.error(info);
}

export function verbose(info: string) {
    if (getGlobalSettings().trace.server !== 'verbose') return;
    console.log(info);
}

export const logger = {
    message,
    error,
    verbose,
} as const;

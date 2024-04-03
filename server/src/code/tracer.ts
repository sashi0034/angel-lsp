import {getGlobalSettings} from "./settings";

export function message(info: string) {
    if (getGlobalSettings().trace.server === 'off') return;
    console.log(info);
}

export function verbose(info: string) {
    if (getGlobalSettings().trace.server !== 'verbose') return;
    console.log(info);
}

export const tracer = {
    message,
    verbose,
} as const;

import {Range} from "vscode-languageserver";
import {Diagnostic, DiagnosticSeverity} from "vscode-languageserver/node";

const s_diagnostics: Diagnostic[] = [];

// type DiagnosticResolve = ((value: (PromiseLike<Diagnostic[]>)) => void);
// const s_resolves: {[uri: string]: DiagnosticResolve} = {};

let s_resolves: ((value: (Diagnostic[] | PromiseLike<Diagnostic[]>)) => void) | null = null;

function isPending(): boolean {
    return s_resolves !== null;
}

function get(): Diagnostic[] {
    return s_diagnostics;
}

function getAsync(): Promise<Diagnostic[]> {
    return new Promise((resolve) => {
        if (s_resolves !== null) {
            s_resolves(s_diagnostics);
            return;
        }
        s_resolves = resolve;
    });
}

function commit() {
    if (s_resolves === null) return;
    s_resolves(s_diagnostics);
    s_resolves = null;
}

function addError(range: Range, message: string): void {
    s_diagnostics.push({
        range: range,
        message: message,
        severity: DiagnosticSeverity.Error,
        source: "AngelScript",
    });
}

function clear(): void {
    s_diagnostics.length = 0;
}

export const diagnostic = {
    get,
    isPending,
    getAsync,
    commit,
    addError,
    clear,
};

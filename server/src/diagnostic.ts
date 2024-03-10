import {Range} from "vscode-languageserver";
import {Diagnostic, DiagnosticSeverity} from "vscode-languageserver/node";

const s_diagnostics: Diagnostic[] = [];

const s_resolves: ((value: (Diagnostic[] | PromiseLike<Diagnostic[]>)) => void)[] = [];

function get(): Diagnostic[] {
    return s_diagnostics;
}

function getAsync(): Promise<Diagnostic[]> {
    return new Promise((resolve) => {
        s_resolves.push(resolve);
    });
}

function commit() {
    for (const resolve of s_resolves) {
        resolve(s_diagnostics);
        console.log("resolved");
    }
    s_resolves.length = 0;
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
    getAsync,
    commit,
    addError,
    clear,
};

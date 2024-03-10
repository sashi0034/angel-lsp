import {Range} from "vscode-languageserver";
import {Diagnostic, DiagnosticSeverity} from "vscode-languageserver/node";

const s_diagnostics: Diagnostic[] = [];

function get(): Diagnostic[] {
    return s_diagnostics;
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
    addError,
    clear,
};

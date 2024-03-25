import {Range} from "vscode-languageserver";
import {Diagnostic, DiagnosticSeverity} from "vscode-languageserver/node";

let s_diagnostics: Diagnostic[] = [];

function reset(): void {
    s_diagnostics = [];
}

function get(): Diagnostic[] {
    return s_diagnostics;
}

function pushDiagnostic(range: Range, message: string, severity: DiagnosticSeverity): void {
    s_diagnostics.push({
        range: range,
        message: message,
        severity: severity,
        source: "AngelScript",
    });
}

function addError(range: Range, message: string): void {
    pushDiagnostic(range, message, DiagnosticSeverity.Error);
}

export const diagnostic = {
    reset,
    get,
    addError,
};

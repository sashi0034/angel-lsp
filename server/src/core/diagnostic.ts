import * as lsp from "vscode-languageserver";

type DiagnosticList = lsp.Diagnostic[];

const s_diagnosticStack: DiagnosticList[] = [];

let s_currentDiagnostics: DiagnosticList = [];

function beginSession(): void {
    s_currentDiagnostics = [];
    s_diagnosticStack.push(s_currentDiagnostics);
}

function endSession(): DiagnosticList {
    const result = s_currentDiagnostics;
    s_diagnosticStack.pop();
    if (s_diagnosticStack.length > 0) s_currentDiagnostics = s_diagnosticStack[s_diagnosticStack.length - 1];
    return result;
}

function pushDiagnostic(range: lsp.Range, message: string, severity: lsp.DiagnosticSeverity): void {
    s_currentDiagnostics.push({
        range: range,
        message: message,
        severity: severity,
        source: "AngelScript",
    });
}

function addError(range: lsp.Range, message: string): void {
    pushDiagnostic(range, message, lsp.DiagnosticSeverity.Error);
}

export const diagnostic = {
    beginSession: beginSession,
    endSession: endSession,
    addError,
} as const;

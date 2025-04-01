import * as lsp from "vscode-languageserver";

let s_currentDiagnostics: lsp.Diagnostic[] = [];

function beginSession(): void {
    if (s_currentDiagnostics.length > 0) {
        console.error("diagnostic.endSession() was not called before diagnostic.beginSession()");
    }

    s_currentDiagnostics = [];
}

function endSession(): lsp.Diagnostic[] {
    const result = s_currentDiagnostics;
    s_currentDiagnostics = [];
    return result;
}

function pushDiagnostic(range: lsp.Range, message: string, severity: lsp.DiagnosticSeverity): void {
    s_currentDiagnostics.push({
        range: structuredClone(range),
        message: message,
        severity: severity,
        source: "AngelScript",
    });
}

function error(range: lsp.Range, message: string): void {
    pushDiagnostic(range, message, lsp.DiagnosticSeverity.Error);
}

export const diagnostic = {
    beginSession: beginSession,
    endSession: endSession,
    error: error,
} as const;

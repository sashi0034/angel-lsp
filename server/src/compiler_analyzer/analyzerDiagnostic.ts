import * as lsp from "vscode-languageserver/node";
import {getGlobalSettings} from "../core/settings";
import {TextLocation} from "../compiler_tokenizer/textLocation";
import {ActionHint} from "./actionHint";

const sourceName = 'AngelScript - Analyzer';

const s_diagnostics: lsp.Diagnostic[] = [];

function beginSession() {
    s_diagnostics.length = 0;
}

function error(location: TextLocation, message: string) {
    const severity = getGlobalSettings().suppressAnalyzerErrors ? lsp.DiagnosticSeverity.Warning : lsp.DiagnosticSeverity.Error;

    s_diagnostics.push({
        severity: severity,
        range: location.clone(),
        message: message,
        source: sourceName,
    });
}

function hint(location: TextLocation, hint: ActionHint, message: string) {
    s_diagnostics.push({
        severity: lsp.DiagnosticSeverity.Hint,
        range: location.clone(),
        message: message,
        source: sourceName,
        data: hint
    });
}

function endSession(): lsp.Diagnostic[] {
    const result = s_diagnostics.slice();
    s_diagnostics.length = 0;
    return result;
}

export const analyzerDiagnostic = {
    beginSession,
    error,
    hint,
    endSession,
} as const;

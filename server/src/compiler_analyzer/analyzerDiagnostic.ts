import {Diagnostic, DiagnosticSeverity} from "vscode-languageserver/node";
import {getGlobalSettings} from "../core/settings";
import {TextLocation} from "../compiler_tokenizer/textLocation";
import {ActionHint} from "./actionHint";

const sourceName = 'AngelScript - Analyzer';

const s_diagnostics: Diagnostic[] = [];

function reset() {
    s_diagnostics.length = 0;
}

function error(location: TextLocation, message: string) {
    const severity = getGlobalSettings().suppressAnalyzerErrors ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error;

    s_diagnostics.push({
        severity: severity,
        range: location,
        message: message,
        source: sourceName,
    });
}

function hint(location: TextLocation, hint: ActionHint, message: string) {
    s_diagnostics.push({
        severity: DiagnosticSeverity.Hint,
        range: location,
        message: message,
        source: sourceName,
        data: hint
    });
}

function flush(): Diagnostic[] {
    const result = s_diagnostics.slice();
    s_diagnostics.length = 0;
    return result;
}

export const analyzerDiagnostic = {
    reset,
    error,
    hint,
    flush,
} as const;

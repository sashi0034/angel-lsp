import {Diagnostic, DiagnosticSeverity} from "vscode-languageserver/node";
import {getGlobalSettings} from "../code/settings";
import {LocationInfo} from "../compiler_tokenizer/tokens";

// TODO: Processing multiple files simultaneously?

const s_diagnostics: Diagnostic[] = [];

function reset() {
    s_diagnostics.length = 0;
}

function add(location: LocationInfo, message: string) {
    const severity = getGlobalSettings().suppressAnalyzerErrors ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error;

    s_diagnostics.push({
        severity: severity,
        range: location,
        message: message,
        source: 'AngelScript - Analyzer',
    });
}

function flush(): Diagnostic[] {
    const result = s_diagnostics.slice();
    s_diagnostics.length = 0;
    return result;
}

export const analyzerDiagnostic = {
    reset,
    add,
    flush,
} as const;

import {Range} from "vscode-languageserver";
import {Diagnostic} from "vscode-languageserver/node";

const s_diagnostics: Diagnostic[] = [];

export function getDiagnostics(): Diagnostic[] {
    return s_diagnostics;
}

export function addDiagnostic(range: Range, message: string): void {
    s_diagnostics.push({
        range: range,
        message: message,
    });
}

export function clearDiagnostics(): void {
    s_diagnostics.length = 0;
}

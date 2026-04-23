/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as path from 'path';

export let doc: vscode.TextDocument;
export let editor: vscode.TextEditor;
export let documentEol: string;
export let platformEol: string;

/**
 * Activates the AngelScript extension.
 */
export async function activate(docUri: vscode.Uri) {
    const ext = vscode.extensions.getExtension('sashi0034.angel-lsp')!;
    await ext.activate();
    doc = await vscode.workspace.openTextDocument(docUri);
    editor = await vscode.window.showTextDocument(doc);
    await waitForLanguageServer(docUri);
}

export async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const getDocPath = (p: string) => {
    return path.resolve(__dirname, '../../testFixture', p);
};
export const getDocUri = (p: string) => {
    return vscode.Uri.file(getDocPath(p));
};

export async function setTestContent(content: string): Promise<boolean> {
    const all = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
    return editor.edit(eb => eb.replace(all, content));
}

export function positionOf(text: string, needle: string, offset = 0): vscode.Position {
    const index = text.indexOf(needle, offset);
    if (index < 0) {
        throw new Error(`Could not find "${needle}" in test document.`);
    }

    return doc.positionAt(index);
}

export function positionAfter(text: string, needle: string, offset = 0): vscode.Position {
    const index = text.indexOf(needle, offset);
    if (index < 0) {
        throw new Error(`Could not find "${needle}" in test document.`);
    }

    return doc.positionAt(index + needle.length);
}

export async function waitForDiagnostics(
    docUri: vscode.Uri,
    predicate: (diagnostics: vscode.Diagnostic[]) => boolean,
    timeoutMs = 5000
): Promise<vscode.Diagnostic[]> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const diagnostics = vscode.languages.getDiagnostics(docUri);
        if (predicate(diagnostics)) {
            return diagnostics;
        }

        await sleep(100);
    }

    return vscode.languages.getDiagnostics(docUri);
}

async function waitForLanguageServer(docUri: vscode.Uri): Promise<void> {
    await waitForDiagnostics(docUri, () => true, 1000);
}

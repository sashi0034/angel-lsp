import * as assert from 'assert';
import * as vscode from 'vscode';
import {activate, doc, getDocUri, positionAfter, positionOf, waitForDiagnostics} from './helper';

suite('AngelScript language features', () => {
    test('reports analyzer diagnostics for real AngelScript files', async () => {
        const docUri = getDocUri('diagnostics.as');
        await activate(docUri);

        const diagnostics = await waitForDiagnostics(docUri, items =>
            items.some(item => item.message.includes("Function 'repeated' is already declared"))
        );

        const duplicate = diagnostics.find(item => item.message.includes("Function 'repeated' is already declared"));
        assert.ok(duplicate, `Expected duplicate-function diagnostic, got: ${formatDiagnostics(diagnostics)}`);
        assert.equal(duplicate.severity, vscode.DiagnosticSeverity.Warning);
        assert.equal(duplicate.source, 'AngelScript - Analyzer');
    });

    test('provides symbol completion after member access', async () => {
        const docUri = getDocUri('main.as');
        await activate(docUri);

        const text = doc.getText();
        const position = positionAfter(text, 'player.');
        const completions = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            docUri,
            position,
            '.'
        )) as vscode.CompletionList;

        const labels = completions.items.map(item => item.label);
        assert.ok(labels.includes('health'), `Expected health in completions, got: ${labels.join(', ')}`);
        assert.ok(labels.includes('name'), `Expected name in completions, got: ${labels.join(', ')}`);
        assert.ok(labels.includes('heal'), `Expected heal in completions, got: ${labels.join(', ')}`);
    });

    test('resolves definitions across includes', async () => {
        const docUri = getDocUri('main.as');
        const utilityUri = getDocUri('utility.as');
        await activate(docUri);

        const text = doc.getText();
        const callPosition = positionOf(text, 'makeScore(player.health)');
        const definitions = (await vscode.commands.executeCommand(
            'vscode.executeDefinitionProvider',
            docUri,
            callPosition
        )) as vscode.Location[];

        assert.ok(definitions.length > 0, 'Expected at least one definition.');
        assert.equal(definitions[0].uri.toString(), utilityUri.toString());
        assert.equal(definitions[0].range.start.line, 0);
    });

    test('shows hover content for evaluated constants', async () => {
        const docUri = getDocUri('main.as');
        await activate(docUri);

        const text = doc.getText();
        const position = positionOf(text, 'MAX_HEALTH', text.indexOf('player.health'));
        const hover = (await vscode.commands.executeCommand('vscode.executeHoverProvider', docUri, position)) as
            | vscode.Hover[]
            | undefined;

        assert.ok(hover && hover.length > 0, 'Expected hover result.');
        assert.ok(formatHover(hover).includes('const int MAX_HEALTH = 100;'), formatHover(hover));
    });

    test('formats documents through the extension provider', async () => {
        const docUri = getDocUri('formatting.as');
        await activate(docUri);

        const edits = (await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', docUri, {
            tabSize: 4,
            insertSpaces: true
        })) as vscode.TextEdit[];

        assert.ok(edits.length > 0, 'Expected document formatting edits.');
        const formatted = applyTextEdits(doc.getText(), edits);
        assert.ok(formatted.includes('void main() {'), formatted);
        assert.ok(formatted.includes('    int x; // comment    is    here'), formatted);
        assert.ok(formatted.includes('    pos.x = 1;'), formatted);
    });
});

function formatDiagnostics(diagnostics: vscode.Diagnostic[]): string {
    return diagnostics.map(item => `${item.severity}: ${item.message}`).join('\n');
}

function formatHover(hover: vscode.Hover[]): string {
    return hover
        .flatMap(item => item.contents)
        .map(content => (typeof content === 'string' ? content : content.value))
        .join('\n');
}

function applyTextEdits(text: string, edits: vscode.TextEdit[]): string {
    const sortedEdits = edits.slice().sort((a, b) => {
        const lineDiff = b.range.start.line - a.range.start.line;
        return lineDiff !== 0 ? lineDiff : b.range.start.character - a.range.start.character;
    });

    let result = text;
    for (const edit of sortedEdits) {
        const start = offsetAt(result, edit.range.start);
        const end = offsetAt(result, edit.range.end);
        result = result.slice(0, start) + edit.newText + result.slice(end);
    }

    return result;
}

function offsetAt(text: string, position: vscode.Position): number {
    let offset = 0;
    const lines = text.split('\n');
    for (let line = 0; line < position.line; line++) {
        offset += lines[line].length + 1;
    }

    return offset + position.character;
}

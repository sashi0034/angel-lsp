import {LanguageClient} from 'vscode-languageclient/node';
import {commands, Position, Range, window, workspace, WorkspaceEdit} from 'vscode';

// Obsolete for now.
// I plan to reimplement this feature later.
export async function executeSmartBackspace(client: LanguageClient) {
    const editor = window.activeTextEditor;
    if (!editor) {
        return;
    }

    commands.executeCommand('deleteLeft');

    // 1. Send an `onTypeFormatting` request to the server using this temporary workaround.
    const doc = editor.document;
    const position = editor.selection.active; // Current cursor position.
    const textDocumentIdentifier = {uri: doc.uri.toString()};

    // Example `onTypeFormatting` request parameters.
    const params = {
        textDocument: textDocumentIdentifier,
        position: position,
        ch: '\b', // Normally unexpected, but supplied manually here.
        options: {
            // Formatting options, such as the tab size, passed to the formatter.
            tabSize: 4,
            insertSpaces: true
        }
    };

    // 2. Request `onTypeFormatting` from the server manually.
    const edits = await client.sendRequest('textDocument/onTypeFormatting', params);

    // 3. Apply the returned `TextEdit`s to the editor.
    if (edits && Array.isArray(edits) && edits.length > 0) {
        const workspaceEdit = new WorkspaceEdit();
        for (const edit of edits) {
            workspaceEdit.replace(
                doc.uri,
                new Range(
                    new Position(edit.range.start.line, edit.range.start.character),
                    new Position(edit.range.end.line, edit.range.end.character)
                ),
                edit.newText
            );
        }

        await workspace.applyEdit(workspaceEdit);
    }
}

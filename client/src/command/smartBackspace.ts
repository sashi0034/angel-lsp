import {LanguageClient} from "vscode-languageclient/node";
import {commands, Position, Range, window, workspace, WorkspaceEdit} from "vscode";

// obsoleted
// I'll re-implement this feature in the future
export async function executeSmartBackspace(client: LanguageClient) {
    const editor = window.activeTextEditor;
    if (!editor) {
        return;
    }

    commands.executeCommand('deleteLeft');

    // 1. Send onTypeFormatting request to server based on the hack logic
    const doc = editor.document;
    const position = editor.selection.active; // Current cursor position
    const textDocumentIdentifier = {uri: doc.uri.toString()};

    // Example parameters for onTypeFormatting
    const params = {
        textDocument: textDocumentIdentifier,
        position: position,
        ch: "\b",  // Normally unexpected, but manually provided
        options: {
            // Formatting options (e.g., tab size) sent to formatter
            tabSize: 4,
            insertSpaces: true
        }
    };

    // 2. Manually request onTypeFormatting from the server
    const edits = await client.sendRequest("textDocument/onTypeFormatting", params);

    // 3. Apply returned TextEdits to the editor
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

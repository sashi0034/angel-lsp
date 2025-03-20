import * as path from 'path';
import {workspace, ExtensionContext, commands, window, WorkspaceEdit, Range, Position} from 'vscode';

import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';
import {executeSmartBackspace} from "./command/smartBackspace";

let s_client: LanguageClient;

export function activate(context: ExtensionContext) {
    // The server is implemented in node
    const serverModule = context.asAbsolutePath(
        path.join('server', 'out', 'server.js')
    );

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: {module: serverModule, transport: TransportKind.ipc},
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
        }
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for plain text documents
        documentSelector: [
            {scheme: 'file', language: 'angelscript'},
            {scheme: 'file', language: 'angelscript-predefined'}
        ],
        synchronize: {
            // Notify the server about file changes to '.clientrc files contained in the workspace
            fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
        }
    };

    // Create the language client and start the client.
    s_client = new LanguageClient(
        'angelScript',
        'AngelScript Language Server',
        serverOptions,
        clientOptions
    );

    // Register smart backspace command
    context.subscriptions.push(commands.registerCommand("angelScript.smartBackspace", async () => {
        await executeSmartBackspace(s_client);
    }));

    // Start the client. This will also launch the server
    s_client.start();
}

export function deactivate(): Thenable<void> | undefined {
    if (!s_client) {
        return undefined;
    }
    return s_client.stop();
}

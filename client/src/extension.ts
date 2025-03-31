import * as path from 'path';
import {workspace, ExtensionContext, commands, debug, window, WorkspaceEdit, Range, Position, DebugConfigurationProvider, WorkspaceFolder, DebugConfiguration, CancellationToken, ProviderResult} from 'vscode';

import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';
import * as vscode from "vscode";

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

    // Register custom command
    s_client.onRequest("angelScript/smartBackspace", params1 => {
        console.log(params1); // TODO: Implement this!
    });

    subscribeCommands(context);

    // Start the client. This will also launch the server
    s_client.start();
}

export function deactivate(): Thenable<void> | undefined {
    if (!s_client) {
        return undefined;
    }
    return s_client.stop();
}

// -----------------------------------------------

class AngelScriptConfigurationProvider implements DebugConfigurationProvider {
    resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {
        return config;
    }

    resolveDebugConfigurationWithSubstitutedVariables(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {
        return config;
    }
}

class AngelScriptDebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
    async createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): Promise<vscode.DebugAdapterDescriptor> {
        return new vscode.DebugAdapterServer(session.configuration.port, session.configuration.address);
    }
}

class AngelScriptDebugAdapterTrackerFactory implements vscode.DebugAdapterTrackerFactory {
	createDebugAdapterTracker(session: vscode.DebugSession): ProviderResult<vscode.DebugAdapterTracker> {
		return {};
	}
}

function subscribeCommands(context: ExtensionContext) {
    context.subscriptions.push(
        commands.registerCommand('angelScript.debug.printGlobalScope', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const uri = editor.document.uri.toString();
                const result = await s_client.sendRequest("angelScript/printGlobalScope", {uri: uri});
                vscode.window.showInformationMessage(`Print Global Scope: ${result}`);
            } else {
                vscode.window.showInformationMessage('No active editor');
            }
        })
    );
    context.subscriptions.push(debug.registerDebugConfigurationProvider("angel-lsp-dap", new AngelScriptConfigurationProvider()));
    context.subscriptions.push(debug.registerDebugAdapterDescriptorFactory("angel-lsp-dap", new AngelScriptDebugAdapterServerDescriptorFactory()));
    context.subscriptions.push(debug.registerDebugAdapterTrackerFactory("angel-lsp-dap", new AngelScriptDebugAdapterTrackerFactory()));
}
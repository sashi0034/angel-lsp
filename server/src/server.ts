import {
    createConnection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    DocumentDiagnosticReportKind,
    type DocumentDiagnosticReport,
    SemanticTokensBuilder, Files,
} from 'vscode-languageserver/node';

import {
    TextDocument
} from 'vscode-languageserver-textdocument';
import {highlightModifiers, highlightTokens} from "./code/highlight";
import {getFileLocationOfToken, serveDefinition} from "./serve/definition";
import {getInspectedResult, getInspectedResultList, inspectFile} from "./serve/inspector";
import {serveCompletions} from "./serve/completion";
import {serveSemanticTokens} from "./serve/semantiTokens";
import {pathToFileURL} from "node:url";
import {getDocumentPath} from "./serve/documentPath";
import {serveReferences} from "./serve/reference";
import {TextEdit} from "vscode-languageserver-types/lib/esm/main";
import {Location} from "vscode-languageserver";
import {changeGlobalSettings} from "./code/settings";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    hasDiagnosticRelatedInformationCapability = !!(
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            definitionProvider: true,
            declarationProvider: true,
            referencesProvider: true,
            renameProvider: true,
            // Tell the client that this server supports code completion.
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: [' ', '.', ':', '(', '[']
            },
            diagnosticProvider: {
                interFileDependencies: false,
                workspaceDiagnostics: false
            },
            semanticTokensProvider: {
                legend: {
                    tokenTypes: highlightTokens,
                    tokenModifiers: highlightModifiers
                },
                range: false, // if true, the server supports range-based requests
                full: true
            },
            documentFormattingProvider: true
        }
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true
            }
        };
    }
    return result;
});

function reloadSettings() {
    connection.workspace.getConfiguration('angelScript').then((config) => {
        changeGlobalSettings(config);
    });
}

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log('Workspace folder change event received.');
        });
    }

    // ワークスペース設定の読み込み
    reloadSettings();
});

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.

connection.onDidChangeConfiguration(change => {
    reloadSettings();

    connection.languages.diagnostics.refresh();
});

// Only keep settings for open documents
documents.onDidClose(e => {
});

connection.languages.diagnostics.on(async (params) => {
    return {
        kind: DocumentDiagnosticReportKind.Full,
        items: getInspectedResult(getDocumentPath(params)).diagnostics
    } satisfies DocumentDiagnosticReport;
});

connection.languages.semanticTokens.on((params) => {
    return serveSemanticTokens(getInspectedResult(getDocumentPath(params)).tokenizedTokens);
});

// 定義ジャンプ
connection.onDefinition((params) => {
    const document = documents.get(params.textDocument.uri);
    if (document === undefined) return;

    const analyzedScope = getInspectedResult(getDocumentPath(params)).analyzedScope;
    if (analyzedScope === undefined) return;

    const caret = params.position;

    const jumping = serveDefinition(analyzedScope, caret);
    if (jumping === null) return;

    return getFileLocationOfToken(jumping);
});

// 参照表示
function getReferenceLocations(params: TextDocumentPositionParams): Location[] {
    const document = documents.get(params.textDocument.uri);
    if (document === undefined) return [];

    const analyzedScope = getInspectedResult(getDocumentPath(params)).analyzedScope;
    if (analyzedScope === undefined) return [];

    const caret = params.position;

    const references = serveReferences(analyzedScope, getInspectedResultList().map(result => result.analyzedScope.fullScope), caret);
    return references.map(ref => getFileLocationOfToken(ref));
}

connection.onReferences((params) => {
    return getReferenceLocations(params);
});

// リネーム機能
connection.onRenameRequest((params) => {
    const locations = getReferenceLocations(params);

    const changes: { [uri: string]: TextEdit[] } = {};
    locations.forEach(location => {
        const uri = location.uri;
        if (changes[uri] === undefined) changes[uri] = [];
        changes[uri].push({
            range: location.range,
            newText: params.newName
        });
    });

    return {changes};
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
    inspectFile(change.document.getText(), getDocumentPath(change));
});

connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VSCode
    connection.console.log('We received a file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
    (params: TextDocumentPositionParams): CompletionItem[] => {
        // The pass parameter contains the position of the text document in
        // which code complete got requested. For the example we ignore this
        // info and always provide the same completion items.

        const path = getDocumentPath(params);
        const diagnosedScope = getInspectedResult(getDocumentPath(params)).analyzedScope;
        if (diagnosedScope === undefined) return [];
        return serveCompletions(diagnosedScope.fullScope, params.position, path);

        // return [
        //     {
        //         label: 'TypeScript',
        //         kind: CompletionItemKind.Text,
        //         data: 1
        //     },
        //     {
        //         label: 'AngelAngel2',
        //         kind: CompletionItemKind.Text,
        //         data: 2
        //     }
        // ];
    }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
    // TODO
    (item: CompletionItem): CompletionItem => {
        if (item.data === 1) {
            item.detail = 'TypeScript details';
            item.documentation = 'TypeScript documentation';
        } else if (item.data === 2) {
            item.detail = 'AngelScript details';
            item.documentation = 'AngelScript documentation';
        }
        return item;
    }
);

connection.onDocumentFormatting((params) => {
    const format: TextEdit[] = [];
    format.push({
        range: {
            start: {line: 0, character: 0},
            end: {line: 0, character: 0}
        },
        newText: '/* format */'
    });
    return format;
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

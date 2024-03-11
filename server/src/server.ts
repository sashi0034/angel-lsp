/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
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
    SemanticTokensBuilder,
} from 'vscode-languageserver/node';

import {
    TextDocument
} from 'vscode-languageserver-textdocument';
import {RowToken, tokenize} from './compile/tokenizer';
import {highlightModifiers, highlightTokens} from "./code/highlight";
import {parseFromTokens} from './compile/parser';
import {diagnostic} from './code/diagnostic';
import {analyzeFromParsed} from "./compile/analyzer";
import {SymbolScope} from "./compile/symbolics";
import {jumpDefinition} from "./serve/definition";
import {profiler} from "./debug/profiler";

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
            definitionProvider: true, // TODO
            declarationProvider: true, // TODO
            // Tell the client that this server supports code completion.
            completionProvider: {
                resolveProvider: true
            },
            // diagnosticProvider: {
            //     interFileDependencies: false,
            //     workspaceDiagnostics: false
            // },
            semanticTokensProvider: {
                legend: {
                    tokenTypes: highlightTokens,
                    tokenModifiers: highlightModifiers
                },
                range: false, // if true, the server supports range-based requests
                full: true
            }
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
});

// The example settings
interface ExampleSettings {
    maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = {maxNumberOfProblems: 1000};
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    } else {
        globalSettings = <ExampleSettings>(
            (change.settings.languageServerExample || defaultSettings)
        );
    }
    // Refresh the diagnostics since the `maxNumberOfProblems` could have changed.
    // We could optimize things here and re-fetch the setting first can compare it
    // to the existing setting, but this is out of scope for this example.
    connection.languages.diagnostics.refresh();
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'languageServerExample'
        });
        documentSettings.set(resource, result);
    }
    return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
});

// connection.languages.diagnostics.on(async (params) => {
//     if (diagnostic.isPending()) {
//         return {
//             kind: DocumentDiagnosticReportKind.Unchanged,
//             resultId: 'pending'
//         } satisfies DocumentDiagnosticReport;
//     }
//     const document = documents.get(params.textDocument.uri);
//     const items = document !== undefined ? await diagnostic.getAsync() : [];
//     return {
//         kind: DocumentDiagnosticReportKind.Full,
//         items: items
//     } satisfies DocumentDiagnosticReport;
// });

// TODO: 複数ファイルに対応
let s_analyzedScope: SymbolScope = {
    parentScope: null,
    childScopes: [],
    symbols: [],
};

connection.languages.semanticTokens.on(async (params) => {
    diagnostic.clear();
    const builder = new SemanticTokensBuilder();
    const document = documents.get(params.textDocument.uri);

    if (document === undefined) return builder.build();

    profiler.restart();
    const tokens = tokenize(document.getText(), params.textDocument.uri);
    profiler.stamp("tokenizer");
    // console.log(tokens);
    const parsed = parseFromTokens(tokens.filter(t => t.kind !== 'comment'));
    profiler.stamp("parser");
    // console.log(parsed);
    s_analyzedScope = analyzeFromParsed(parsed);
    profiler.stamp("analyzer");
    // console.log(analyzed);

    tokens.forEach((token, i) => {
        // TODO: 複数行のコメントや文字列のときに特殊処理
        builder.push(
            token.location.start.line,
            token.location.start.character,
            token.text.length,
            token.highlight.token,
            token.highlight.modifier);
    });

    await connection.sendDiagnostics({
        uri: document.uri,
        diagnostics: diagnostic.get()
    });

    return builder.build();
});

connection.onDefinition((params) => {
    const document = documents.get(params.textDocument.uri);
    if (document === undefined) return;
    const caret = params.position;
    const jumping = jumpDefinition(s_analyzedScope, caret);
    if (jumping === null) return;
    return {
        uri: jumping.location.uri,
        range: {
            start: jumping.location.start,
            end: jumping.location.end
        }
    };
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
    // いらない?
    // validateTextDocument(change.document);
});

connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VSCode
    connection.console.log('We received a file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
    (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        // The pass parameter contains the position of the text document in
        // which code complete got requested. For the example we ignore this
        // info and always provide the same completion items.
        return [
            {
                label: 'TypeScript',
                kind: CompletionItemKind.Text,
                data: 1
            },
            {
                label: 'AngelAngel',
                kind: CompletionItemKind.Text,
                data: 2
            }
        ];
    }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
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

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

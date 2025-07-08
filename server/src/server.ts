import * as lsp from 'vscode-languageserver/node';
import * as lsp_textDocument from 'vscode-languageserver-textdocument';

import {highlightForModifierList, highlightForTokenList} from "./core/highlight";
import {provideDefinitionAsToken} from "./services/definition";
import {
    Inspector
} from "./inspector/inspector";
import {CompletionItemWrapper, provideCompletion} from "./services/completion";
import {provideSemanticTokens} from "./services/semanticTokens";
import {provideReferences} from "./services/reference";
import {TextEdit} from "vscode-languageserver-types/lib/esm/main";
import {Location} from "vscode-languageserver";
import {resetGlobalSettings} from "./core/settings";
import {formatFile} from "./formatter/formatter";
import {provideSignatureHelp} from "./services/signatureHelp";
import {TextLocation, TextPosition, TextRange} from "./compiler_tokenizer/textLocation";
import {provideInlayHint} from "./services/inlayHint";
import {DiagnosticSeverity} from "vscode-languageserver-types";
import {CodeAction} from "vscode-languageserver-protocol";
import {provideCodeAction} from "./services/codeAction";
import {provideCompletionOfToken} from "./services/completionExtension";
import {provideCompletionResolve} from "./services/completionResolve";
import {logger} from "./core/logger";
import {provideHover} from "./services/hover";
import {provideDocumentSymbol} from "./services/documentSymbol";
import {documentOnTypeFormattingProvider} from "./services/documentOnTypeFormatting";
import {SimpleProfiler} from "./utils/simpleProfiler";
import {printSymbolScope} from "./compiler_analyzer/symbolUtils";
import {safeWriteFile} from "./utils/fileUtils";
import {moveInlayHintByChanges} from "./service/contentChangeApplier";
import {provideDefinitionFallback} from "./services/definitionExtension";
import {CodeActionWrapper} from "./actions/utils";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const s_connection = lsp.createConnection(lsp.ProposedFeatures.all);

let s_hasConfigurationCapability = false;

let s_hasWorkspaceFolderCapability = false;

let s_hasWorkspaceDiagnosticsRefreshCapability = false;

let s_hasDiagnosticRelatedInformationCapability = false;

s_connection.onInitialize((params: lsp.InitializeParams) => {
    const capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.

    s_hasConfigurationCapability =
        capabilities.workspace?.configuration ?? false;

    s_hasWorkspaceFolderCapability =
        capabilities.workspace?.workspaceFolders ?? false;

    s_hasWorkspaceDiagnosticsRefreshCapability =
        capabilities.workspace?.diagnostics?.refreshSupport ?? false;

    s_hasDiagnosticRelatedInformationCapability =
        capabilities.textDocument?.publishDiagnostics?.relatedInformation ?? false;

    const result: lsp.InitializeResult = {
        capabilities: {
            textDocumentSync: lsp.TextDocumentSyncKind.Incremental,
            definitionProvider: true,
            declarationProvider: true,
            referencesProvider: true,
            documentSymbolProvider: true,
            codeActionProvider: {
                codeActionKinds: ["quickfix"], // FIXME
                resolveProvider: true,
            },
            renameProvider: true,
            hoverProvider: true,
            signatureHelpProvider: {
                triggerCharacters: ["(", ")", ","],
                retriggerCharacters: ["="],
            },
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: [
                    '.', ':', // for autocomplete symbol
                    '/' // for autocomplete file path
                ]
            },
            // diagnosticProvider: {
            //     interFileDependencies: false,
            //     workspaceDiagnostics: false
            // },
            semanticTokensProvider: {
                legend: {
                    tokenTypes: highlightForTokenList,
                    tokenModifiers: highlightForModifierList
                },
                range: false, // if true, the server supports range-based requests
                full: true
            },
            inlayHintProvider: true,
            documentFormattingProvider: true,
            documentRangeFormattingProvider: true,
            documentOnTypeFormattingProvider: {
                firstTriggerCharacter: ';',
                moreTriggerCharacter: ['}', '\n'],
            }
        }
    };

    if (s_hasWorkspaceFolderCapability) {
        const filters = {
            scheme: 'file',
            pattern: {glob: '**/{as.predefined,*.as}',}
        };

        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true
            },
            fileOperations: {
                didRename: {
                    filters: [filters]
                },
                didDelete: {
                    filters: [filters]
                }
            }
        };
    }

    return result;
});

function reloadSettings() {
    s_connection.workspace.getConfiguration('angelScript').then((config) => {
        resetGlobalSettings(config);
        s_inspector.reinspectAllFiles();
        if (s_hasWorkspaceDiagnosticsRefreshCapability) {
            s_connection.languages.diagnostics.refresh();
        }
    });
}

s_connection.onInitialized(() => {
    if (s_hasConfigurationCapability) {
        // Register for all configuration changes.
        s_connection.client.register(lsp.DidChangeConfigurationNotification.type, undefined);
    }

    if (s_hasWorkspaceFolderCapability) {
        s_connection.workspace.onDidChangeWorkspaceFolders(_event => {
            s_connection.console.log('Workspace folder change event received.');
        });
    }

    // Reload for workspace settings.
    reloadSettings();
});

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.

s_connection.onDidChangeConfiguration(change => {
    reloadSettings();
});

// connection.languages.diagnostics.on(async (params) => {
//     return {
//         kind: DocumentDiagnosticReportKind.Full,
//         items: [
//             ...getInspectedResult(params.textDocument.uri).diagnosticsInAnalyzer,
//             ...getInspectedResult(params.textDocument.uri).diagnosticsInParser
//         ]
//     } satisfies DocumentDiagnosticReport;
// });

// -----------------------------------------------
// Text Document Events

// Reference: https://github.com/microsoft/vscode-languageserver-node/blob/df05883f34b39255d40d68cef55caf2e93cff35f/server/src/common/textDocuments.ts#L185

const s_documentMap = new Map<string, lsp_textDocument.TextDocument>();

const s_inspector = new Inspector();

s_connection.onDidOpenTextDocument(params => {
    const document = params.textDocument;
    s_documentMap.set(
        params.textDocument.uri,
        lsp_textDocument.TextDocument.create(document.uri, document.languageId, document.version, document.text)
    );

    if (s_inspector.getRecord(document.uri).content === document.text) {
        // No need to re-inspect because the contents of the file are identical.
        return;
    }

    s_inspector.inspectFile(document.uri, document.text, {isOpen: true});
});

s_connection.onDidChangeTextDocument((params) => {
    const document = s_documentMap.get(params.textDocument.uri);
    if (document === undefined) {
        s_connection.console.error('Missing a document: ' + params.textDocument.uri);
        return;
    }

    lsp_textDocument.TextDocument.update(document, params.contentChanges, params.textDocument.version);

    // profileInspect(document); // for debug

    s_inspector.inspectFile(document.uri, document.getText(), {isOpen: true, changes: params.contentChanges});

    const inlayHints = s_inlayHintsCache.get(document.uri);
    if (inlayHints !== undefined) {
        moveInlayHintByChanges(inlayHints, params.contentChanges);
    }

    // connection.sendRequest('angelScript/smartBackspace', 'TODO! Implement this?');
});

s_connection.onDidCloseTextDocument(params => {
    // s_inspector.sleepRecord(params.textDocument.uri);
});

s_connection.workspace.onDidRenameFiles(params => {
    for (const renamed of params.files) {
        s_inspector.deleteRecord(renamed.oldUri);
        // FIXME: Handle for the new name?
    }
});

s_connection.workspace.onDidDeleteFiles(params => {
    for (const deleted of params.files) {
        s_inspector.deleteRecord(deleted.uri);
    }
});

// FIXME: Should we also handle `onWillSaveTextDocument`, `onWillSaveTextDocumentWaitUntil` and `onDidSaveTextDocument`?

s_connection.onDidChangeWatchedFiles(params => {
    // Maybe we don't need to do anything here, right?
    // https://github.com/microsoft/vscode-discussions/discussions/511
});

function profileInspect(document: lsp_textDocument.TextDocument) {
    const profiler = new SimpleProfiler('inspect');
    for (let i = 0; i < 100; i++) {
        profiler.beginSession();
        s_inspector.inspectFile(document.uri, document.getText());
        s_inspector.flushRecord(document.uri);
        profiler.endSession();
    }

    profiler.outputResult();
}

// -----------------------------------------------
// Semantic Tokens Provider
s_connection.languages.semanticTokens.on((params) => {
    return provideSemanticTokens(s_inspector.getRecord(params.textDocument.uri).rawTokens);
});

// -----------------------------------------------
// Inlay Hints Provider

const s_inlayHintsCache: Map<string, lsp.InlayHint[]> = new Map();

s_connection.languages.inlayHint.on((params) => {
    const uri = params.textDocument.uri;
    const range = TextRange.create(params.range);
    const record = s_inspector.getRecord(uri);

    if (record.isAnalyzerPending) {
        return s_inlayHintsCache.get(uri);
    }

    const inlineHints =
        provideInlayHint(record.analyzerScope.globalScope, new TextLocation(uri, range.start, range.end));

    s_inlayHintsCache.set(uri, inlineHints);

    return inlineHints;
});

// -----------------------------------------------
// Definition Provider
s_connection.onDefinition((params) => {
    const record = s_inspector.getRecord(params.textDocument.uri);
    const globalScope = record.analyzerScope.globalScope;

    const caret = TextPosition.create(params.position);

    const definition = provideDefinitionAsToken(globalScope, getAllGlobalScopes(), caret);
    if (definition !== undefined) return definition.location.toServerLocation();

    return provideDefinitionFallback(record.rawTokens, globalScope, caret);
});

function getAllGlobalScopes() {
    return s_inspector.getAllRecords().map(result => result.analyzerScope.globalScope);
}

// Search for references of a symbol
function getReferenceLocations(params: lsp.TextDocumentPositionParams): Location[] {
    s_inspector.flushRecord(params.textDocument.uri); // FIXME: Should we flush all records?

    const globalScope = s_inspector.getRecord(params.textDocument.uri).analyzerScope.globalScope;

    const caret = TextPosition.create(params.position);

    const references = provideReferences(
        globalScope,
        getAllGlobalScopes(),
        caret);
    return references.map(ref => ref.location.toServerLocation());
}

s_connection.onReferences((params) => {
    return getReferenceLocations(params);
});

// -----------------------------------------------
// Selection Range Provider
s_connection.onDocumentSymbol(params => {
    return provideDocumentSymbol(s_inspector.getRecord(params.textDocument.uri).analyzerScope.globalScope);
});

// -----------------------------------------------
// Code Action Provider

let s_lastCodeAction: CodeActionWrapper [] = [];

s_connection.onCodeAction((params) => {
    const globalScope = s_inspector.getRecord(params.textDocument.uri).analyzerScope.globalScope;

    const range = TextRange.create(params.range);

    s_lastCodeAction = provideCodeAction(globalScope, getAllGlobalScopes(), range);

    s_lastCodeAction.forEach((action, i) => action.action.data = i);

    return s_lastCodeAction.map(action => action.action);
});

s_connection.onCodeActionResolve((action) => {
    const index = action.data as number;

    const resolvedAction = s_lastCodeAction[index];
    if (resolvedAction === undefined) {
        logger.error('Received an invalid code action.');
        return action;
    }

    resolvedAction.resolver(action);

    return action;
});

// -----------------------------------------------
// Rename Provider
s_connection.onRenameRequest((params) => {
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

// -----------------------------------------------
// Hover Provider
s_connection.onHover((params) => {
    s_inspector.flushRecord(params.textDocument.uri);

    const globalScope = s_inspector.getRecord(params.textDocument.uri).analyzerScope.globalScope;

    const caret = TextPosition.create(params.position);

    return provideHover(globalScope, caret);
});

// -----------------------------------------------
// Completion Provider
const s_lastCompletion: { uri: string; items: CompletionItemWrapper[] } = {uri: '', items: [],};

s_connection.onCompletion((params: lsp.TextDocumentPositionParams): lsp.CompletionItem[] => {
    const uri = params.textDocument.uri;
    const caret = TextPosition.create(params.position);

    // See if we can autocomplete file paths, etc.
    const completionsOfToken = provideCompletionOfToken(s_inspector.getRecord(uri).rawTokens, caret);
    if (completionsOfToken !== undefined) return completionsOfToken;

    s_inspector.flushRecord(uri);

    const globalScope = s_inspector.getRecord(uri).analyzerScope;
    if (globalScope === undefined) return [];

    // Collect completion candidates for symbols.
    const items = provideCompletion(globalScope.globalScope, TextPosition.create(params.position));

    items.forEach((item, index) => {
        // Attach the index to the data field so that we can resolve the item later.
        item.item.data = index;
    });

    // Store the completion items for later resolution.
    s_lastCompletion.uri = uri;
    s_lastCompletion.items = items;

    return items.map(item => item.item);
});

// This handler resolves additional information for the item selected in the completion list.
s_connection.onCompletionResolve((item: lsp.CompletionItem): lsp.CompletionItem => {
    const globalScope = s_inspector.getRecord(s_lastCompletion.uri).analyzerScope.globalScope;

    if (typeof item.data !== 'number') return item;

    const itemWrapper = s_lastCompletion.items[item.data];
    if (itemWrapper.item.label !== item.label) {
        logger.error('Received an invalid completion item.');
    }

    return provideCompletionResolve(globalScope, itemWrapper);
});

// -----------------------------------------------
// Signature Help Provider
s_connection.onSignatureHelp((params) => {
    const uri = params.textDocument.uri;

    s_inspector.flushRecord(uri);

    const diagnosedScope = s_inspector.getRecord(uri).analyzerScope;
    if (diagnosedScope === undefined) return null;

    return provideSignatureHelp(diagnosedScope.globalScope, params.position, uri);
});

// -----------------------------------------------
// Document Formatting Provider
s_connection.onDocumentFormatting((params) => {
    s_inspector.flushRecord();
    const record = s_inspector.getRecord(params.textDocument.uri);
    return formatFile(record.content, record.rawTokens, record.ast);
});

s_connection.onExecuteCommand((params) => {

});

// -----------------------------------------------
// Document on Type Formatting Provider
s_connection.onDocumentOnTypeFormatting((params) => {
    const record = s_inspector.getRecord(params.textDocument.uri);

    const result = documentOnTypeFormattingProvider(
        record.rawTokens,
        record.analyzerScope.globalScope,
        TextPosition.create(params.position),
        params.ch,
    );

    return result;
});

// -----------------------------------------------
// Extended Features

s_connection.onRequest('angelScript/printGlobalScope', params => {
    const uri = params.uri as string;

    const globalScope = s_inspector.getRecord(uri).analyzerScope.globalScope;
    const content = printSymbolScope(globalScope);

    const outputFilepath = uri + '.out';
    const wrote = safeWriteFile(outputFilepath, content);

    return wrote ? outputFilepath : undefined;
});

// -----------------------------------------------

// Listen on the connection
s_connection.listen();

s_inspector.registerDiagnosticsCallback(s_connection.sendDiagnostics);

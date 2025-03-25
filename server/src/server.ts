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
import {changeGlobalSettings, getGlobalSettings} from "./core/settings";
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
import {provideWeakDefinition} from "./services/definitionExtension";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = lsp.createConnection(lsp.ProposedFeatures.all);

// Create a simple text document manager.
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: lsp.InitializeParams) => {
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
                    ' ', '.', ':', // for autocomplete symbol
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
        s_inspector.reinspectAllFiles();
        connection.languages.diagnostics.refresh();
    });
}

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(lsp.DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log('Workspace folder change event received.');
        });
    }

    // Reload for workspace settings.
    reloadSettings();
});

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.

connection.onDidChangeConfiguration(change => {
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

connection.onDidOpenTextDocument(params => {
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

connection.onDidChangeTextDocument((params) => {
    const document = s_documentMap.get(params.textDocument.uri);
    if (document === undefined) {
        connection.console.error('Missing a document: ' + params.textDocument.uri);
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

connection.onDidCloseTextDocument(params => {
    s_inspector.sleepRecord(params.textDocument.uri);
});

// TODO: We want to observe the deletion of a file, but it seems that the LSP doesn't provide such an event?

// FIXME: Should we also handle `onWillSaveTextDocument`, `onWillSaveTextDocumentWaitUntil` and `onDidSaveTextDocument`?

connection.onDidChangeWatchedFiles(params => {
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
connection.languages.semanticTokens.on((params) => {
    return provideSemanticTokens(s_inspector.getRecord(params.textDocument.uri).rawTokens);
});

// -----------------------------------------------
// Inlay Hints Provider

const s_inlayHintsCache: Map<string, lsp.InlayHint[]> = new Map();

connection.languages.inlayHint.on((params) => {
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
connection.onDefinition((params) => {
    const record = s_inspector.getRecord(params.textDocument.uri);
    const globalScope = record.analyzerScope.globalScope;

    const caret = TextPosition.create(params.position);

    const definition = provideDefinitionAsToken(globalScope, getAllGlobalScopes(), caret);
    if (definition !== undefined) return definition.location.toServerLocation();

    return provideWeakDefinition(record.rawTokens, globalScope, caret);
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

connection.onReferences((params) => {
    return getReferenceLocations(params);
});

// -----------------------------------------------
// Selection Range Provider
connection.onDocumentSymbol(params => {
    return provideDocumentSymbol(s_inspector.getRecord(params.textDocument.uri).analyzerScope.globalScope);
});

// -----------------------------------------------
// Code Action Provider

interface CodeActionContext {
    uri: string;
}

connection.onCodeAction((params) => {
    const result: CodeAction[] = [];
    const context: CodeActionContext = {uri: params.textDocument.uri};

    for (const diagnostic of params.context.diagnostics) {
        if (diagnostic.severity == DiagnosticSeverity.Hint) {
            result.push({
                title: diagnostic.message, // FIXME?
                diagnostics: [diagnostic],
                data: context
            });
        }
    }

    return result;
});

connection.onCodeActionResolve((action) => {
    const context = action.data as CodeActionContext;
    const uri = context.uri;

    if (action.diagnostics === undefined || action.diagnostics.length === 0) return action;

    const range = TextRange.create(action.diagnostics[0].range);

    const edits = provideCodeAction(
        s_inspector.getRecord(uri).analyzerScope.globalScope,
        getAllGlobalScopes(),
        new TextLocation(uri, range.start, range.end),
        action.diagnostics[0].data
    );

    action.edit = {changes: {[uri]: edits}};

    return action;
});

// -----------------------------------------------
// Rename Provider
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

// -----------------------------------------------
// Hover Provider
connection.onHover((params) => {
    s_inspector.flushRecord(params.textDocument.uri);

    const globalScope = s_inspector.getRecord(params.textDocument.uri).analyzerScope.globalScope;

    const caret = TextPosition.create(params.position);

    return provideHover(globalScope, caret);
});

// -----------------------------------------------
// Completion Provider
const s_lastCompletion: { uri: string; items: CompletionItemWrapper[] } = {uri: '', items: [],};

connection.onCompletion((params: lsp.TextDocumentPositionParams): lsp.CompletionItem[] => {
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
connection.onCompletionResolve((item: lsp.CompletionItem): lsp.CompletionItem => {
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
connection.onSignatureHelp((params) => {
    const uri = params.textDocument.uri;

    s_inspector.flushRecord(uri);

    const diagnosedScope = s_inspector.getRecord(uri).analyzerScope;
    if (diagnosedScope === undefined) return null;

    return provideSignatureHelp(diagnosedScope.globalScope, params.position, uri);
});

// -----------------------------------------------
// Document Formatting Provider
connection.onDocumentFormatting((params) => {
    s_inspector.flushRecord();
    const record = s_inspector.getRecord(params.textDocument.uri);
    return formatFile(record.content, record.rawTokens, record.ast);
});

connection.onExecuteCommand((params) => {

});

// -----------------------------------------------
// Document on Type Formatting Provider
connection.onDocumentOnTypeFormatting((params) => {
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

connection.onRequest('angelScript/printGlobalScope', params => {
    const uri = params.uri as string;

    const globalScope = s_inspector.getRecord(uri).analyzerScope.globalScope;
    const content = printSymbolScope(globalScope);

    const outputFilepath = uri + '.out';
    const wrote = safeWriteFile(outputFilepath, content);

    return wrote ? outputFilepath : undefined;
});

// -----------------------------------------------

// Listen on the connection
connection.listen();

s_inspector.registerDiagnosticsCallback(connection.sendDiagnostics);

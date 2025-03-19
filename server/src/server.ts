import {
    createConnection,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
} from 'vscode-languageserver/node';

import {
    TextDocument
} from 'vscode-languageserver-textdocument';
import {highlightForModifierList, highlightForTokenList} from "./core/highlight";
import {provideDefinition, provideDefinitionAsToken} from "./services/definition";
import {
    getInspectedRecord,
    getInspectedRecordList,
    inspectFile,
    reinspectAllFiles,
    registerDiagnosticsCallback,
    flushInspectedRecord
} from "./inspector/inspector";
import {CompletionItemWrapper, provideCompletion} from "./services/completion";
import {provideSemanticTokens} from "./services/semanticTokens";
import {provideReferences} from "./services/reference";
import {TextEdit} from "vscode-languageserver-types/lib/esm/main";
import {Location} from "vscode-languageserver";
import {changeGlobalSettings, getGlobalSettings} from "./core/settings";
import {formatFile} from "./formatter/formatter";
import {stringifySymbolObject} from "./compiler_analyzer/symbolUtils";
import {provideSignatureHelp} from "./services/signatureHelp";
import {TextLocation, TextPosition, TextRange} from "./compiler_tokenizer/textLocation";
import {provideInlineHint} from "./services/inlineHint";
import {DiagnosticSeverity} from "vscode-languageserver-types";
import {CodeAction} from "vscode-languageserver-protocol";
import {provideCodeAction} from "./services/codeAction";
import {provideCompletionOfToken} from "./services/completionExtension";
import {provideCompletionResolve} from "./services/completionResolve";
import {logger} from "./core/logger";
import {getDocumentCommentOfSymbol} from "./services/utils";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
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
            codeActionProvider: {
                codeActionKinds: ["quickfix"],
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
        reinspectAllFiles();
        connection.languages.diagnostics.refresh();
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

const s_documentMap = new Map<string, TextDocument>();

connection.onDidOpenTextDocument(params => {
    const document = params.textDocument;
    s_documentMap.set(
        params.textDocument.uri,
        TextDocument.create(document.uri, document.languageId, document.version, document.text)
    );

    if (getInspectedRecord(document.uri).content === document.text) {
        // No need to re-inspect because the contents of the file are identical.
        return;
    }

    inspectFile(document.uri, document.text);
});

connection.onDidChangeTextDocument((params) => {
    const document = s_documentMap.get(params.textDocument.uri);
    if (document === undefined) {
        connection.console.error('Missing a document: ' + params.textDocument.uri);
        return;
    }

    TextDocument.update(document, params.contentChanges, params.textDocument.version);

    // TODO: We should implement incremental compilation.
    inspectFile(params.textDocument.uri, document.getText());
});

connection.onDidCloseTextDocument(params => {
    // s_documentMap.delete(params.textDocument.uri); // FIXME?
});

// TODO: We want to observe the deletion of a file, but it seems that the LSP doesn't provide such an event?

// FIXME: Should we also handle `onWillSaveTextDocument`, `onWillSaveTextDocumentWaitUntil` and `onDidSaveTextDocument`?

connection.onDidChangeWatchedFiles(params => {
    // Maybe we don't need to do anything here, right?
    // https://github.com/microsoft/vscode-discussions/discussions/511
});

// -----------------------------------------------
// Semantic Tokens Provider
connection.languages.semanticTokens.on((params) => {
    return provideSemanticTokens(getInspectedRecord(params.textDocument.uri).tokenizedTokens);
});

// -----------------------------------------------
// Inlay Hints Provider
connection.languages.inlayHint.on((params) => {
    if (!getGlobalSettings().experimental.inlineHints) return []; // TODO: Delete after the preview ends.

    const uri = params.textDocument.uri;
    const range = TextRange.create(params.range);

    return provideInlineHint(
        getInspectedRecord(uri).analyzerScope.globalScope,
        new TextLocation(uri, range.start, range.end)
    );
});

// -----------------------------------------------
// Definition Provider
connection.onDefinition((params) => {
    const globalScope = getInspectedRecord(params.textDocument.uri).analyzerScope;
    if (globalScope === undefined) return;

    const caret = TextPosition.create(params.position);

    const definition = provideDefinitionAsToken(globalScope.globalScope, getAllGlobalScopes(), caret);
    return definition?.location.toServerLocation();
});

function getAllGlobalScopes() {
    return getInspectedRecordList().map(result => result.analyzerScope.globalScope);
}

// Search for references of a symbol
function getReferenceLocations(params: TextDocumentPositionParams): Location[] {
    flushInspectedRecord(params.textDocument.uri);
    const analyzedScope = getInspectedRecord(params.textDocument.uri).analyzerScope;
    if (analyzedScope === undefined) return [];

    const caret = TextPosition.create(params.position);

    const references = provideReferences(
        analyzedScope.globalScope,
        getInspectedRecordList().map(result => result.analyzerScope.globalScope),
        caret);
    return references.map(ref => ref.location.toServerLocation());
}

connection.onReferences((params) => {
    return getReferenceLocations(params);
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
        getInspectedRecord(uri).analyzerScope.globalScope,
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
    flushInspectedRecord(params.textDocument.uri);

    const analyzedScope = getInspectedRecord(params.textDocument.uri).analyzerScope;
    if (analyzedScope === undefined) return;

    const caret = TextPosition.create(params.position);

    const definition = provideDefinition(analyzedScope.globalScope, caret);
    if (definition === undefined) return;

    const documentComment = getDocumentCommentOfSymbol(definition);

    return {
        contents: {
            kind: 'markdown',
            // FIXME: Currently colored in C++, because AngelScript support in linguist looks poor.
            // I would like to see someone motivated to be a linguist contributor! https://github.com/github-linguist/linguist
            value: "```cpp\n" + stringifySymbolObject(definition) + ";\n```" + `\n***\n${documentComment}`
            // value: "```AngelScript\n" + stringifySymbolObject(definition) + "\n```"
        }
    };
});

// -----------------------------------------------
// Completion Provider
const s_lastCompletion: { uri: string; items: CompletionItemWrapper[] } = {uri: '', items: [],};

connection.onCompletion(
    (params: TextDocumentPositionParams): CompletionItem[] => {
        const uri = params.textDocument.uri;
        const caret = TextPosition.create(params.position);

        // See if we can autocomplete file paths, etc.
        const completionsOfToken = provideCompletionOfToken(getInspectedRecord(uri).tokenizedTokens, caret);
        if (completionsOfToken !== undefined) return completionsOfToken;

        flushInspectedRecord(uri);

        const globalScope = getInspectedRecord(uri).analyzerScope;
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
    }
);

// This handler resolves additional information for the item selected in the completion list.
connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
        const globalScope = getInspectedRecord(s_lastCompletion.uri).analyzerScope;
        if (globalScope === undefined) return item;

        if (typeof item.data !== 'number') return item;

        const itemWrapper = s_lastCompletion.items[item.data];
        if (itemWrapper.item.label !== item.label) {
            logger.error('Received an invalid completion item.');
        }

        return provideCompletionResolve(globalScope.globalScope, itemWrapper);
    }
);

// -----------------------------------------------
// Signature Help Provider
connection.onSignatureHelp((params) => {
    const uri = params.textDocument.uri;

    flushInspectedRecord(uri);

    const diagnosedScope = getInspectedRecord(uri).analyzerScope;
    if (diagnosedScope === undefined) return null;

    return provideSignatureHelp(diagnosedScope.globalScope, params.position, uri);
});

// -----------------------------------------------
// Document Formatting Provider
connection.onDocumentFormatting((params) => {
    flushInspectedRecord();
    const inspected = getInspectedRecord(params.textDocument.uri);
    return formatFile(inspected.content, inspected.tokenizedTokens, inspected.ast);
});

// Listen on the connection
connection.listen();

registerDiagnosticsCallback(connection.sendDiagnostics);

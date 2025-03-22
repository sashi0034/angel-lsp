import * as lsp from "vscode-languageserver/node";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {NodeScript} from "../compiler_parser/nodes";
import {SymbolGlobalScope} from "../compiler_analyzer/symbolScope";
import {logger} from "../core/logger";
import {Profiler} from "../core/profiler";
import {tokenize} from "../compiler_tokenizer/tokenizer";
import {preprocessAfterTokenized, PreprocessedOutput} from "../compiler_parser/parserPreprocess";
import {parseAfterPreprocessed} from "../compiler_parser/parser";
import {DelayedTask} from "../utils/delayedTask";
import {diagnostic} from "../core/diagnostic";
import {AnalysisResolver, DiagnosticsCallback} from "./analysisResolver";
import {AnalyzerScope} from "../compiler_analyzer/analyzerScope";
import {TextPosition} from "../compiler_tokenizer/textLocation";
import {findScopeContainingPosition} from "../complement/utils";

interface InspectRecord {
    content: string;
    uri: string;
    isOpen: boolean;
    diagnosticsInParser: lsp.Diagnostic[]; // A diagnosed messages occurred in the parser or tokenizer
    diagnosticsInAnalyzer: lsp.Diagnostic[];
    rawTokens: TokenObject[];
    preprocessedOutput: PreprocessedOutput;
    ast: NodeScript;
    analyzerTask: DelayedTask;
    analyzerScope: AnalyzerScope;
}

const s_inspectorResults: Map<string, InspectRecord> = new Map();

let s_diagnosticsCallback: DiagnosticsCallback = () => {
    return;
};

export function registerDiagnosticsCallback(callback: DiagnosticsCallback): void {
    s_diagnosticsCallback = callback;
}

const s_analysisResolver: AnalysisResolver = new AnalysisResolver(
    s_inspectorResults,
    (params) => s_diagnosticsCallback(params)
);

function createEmptyRecord(uri: string, content: string): InspectRecord {
    return {
        content: content,
        uri: uri,
        isOpen: false,
        diagnosticsInParser: [],
        diagnosticsInAnalyzer: [],
        rawTokens: [],
        preprocessedOutput: {preprocessedTokens: [], includePathTokens: []},
        ast: [],
        analyzerTask: new DelayedTask(),
        analyzerScope: new AnalyzerScope(uri, new SymbolGlobalScope(uri)),
    };
}

function insertNewRecord(uri: string, content: string): InspectRecord {
    const record = createEmptyRecord(uri, content);
    s_inspectorResults.set(uri, record);
    return record;
}

/**
 * Get the inspected record of the specified file.
 */
export function getInspectRecord(uri: string): Readonly<InspectRecord> {
    const result = s_inspectorResults.get(uri);
    if (result === undefined) return createEmptyRecord(uri, '');
    return result;
}

/**
 * Get the list of all inspected records as a list.
 */
export function getInspectRecordList(): Readonly<InspectRecord>[] {
    return Array.from(s_inspectorResults.values());
}

/**
 * Flush the inspected record of the specified file since the analyzer runs asynchronously.
 */
export function flushInspectRecord(uri?: string): void {
    s_analysisResolver.flush(uri);
}

const profilerDescriptionLength = 12;

interface InspectOption {
    isOpen?: boolean;
    changes?: lsp.TextDocumentContentChangeEvent[];
}

export function inspectFile(uri: string, content: string, option?: InspectOption): void {
    logger.message(`[Tokenizer and Parser]\n${uri}`);

    const record = s_inspectorResults.get(uri) ?? insertNewRecord(uri, content);

    // Update the content
    record.content = content;

    record.isOpen = option?.isOpen === true;

    // -----------------------------------------------
    diagnostic.beginSession();

    const profiler = new Profiler();

    // Execute the tokenizer
    record.rawTokens = tokenize(uri, content);
    profiler.mark('Tokenizer'.padEnd(profilerDescriptionLength));

    // Execute the preprocessor
    record.preprocessedOutput = preprocessAfterTokenized(record.rawTokens);
    profiler.mark('Preprocessor'.padEnd(profilerDescriptionLength));

    // Execute the parser
    record.ast = parseAfterPreprocessed(record.preprocessedOutput.preprocessedTokens);
    profiler.mark('Parser'.padEnd(profilerDescriptionLength));

    record.diagnosticsInParser = diagnostic.endSession();
    // -----------------------------------------------

    // Send the diagnostics on the way to the client
    s_diagnosticsCallback({
        uri: uri,
        diagnostics: [...record.diagnosticsInParser, ...record.diagnosticsInAnalyzer],
    });

    // Request delayed execution of the analyzer
    s_analysisResolver.request(record, shouldReanalyzeDependents(record.analyzerScope.globalScope, option?.changes));

    logger.message(`(${process.memoryUsage().heapUsed / 1024 / 1024} MB used)`);
}

function shouldReanalyzeDependents(globalScope: SymbolGlobalScope, change?: lsp.TextDocumentContentChangeEvent[]): boolean {
    if (change === undefined) return true;

    for (const changeEvent of change) {
        if (isChangeInAnonymousScope(globalScope, changeEvent) === false) {
            // If the change is not in an anonymous scope, reanalyze the dependents.
            return true;
        }
    }

    return false;
}

function isChangeInAnonymousScope(globalScope: SymbolGlobalScope, change: lsp.TextDocumentContentChangeEvent): boolean {
    if (lsp.TextDocumentContentChangeEvent.isIncremental(change) === false) {
        return false;
    }

    const changedStart = TextPosition.create(change.range.start);
    const changedScope = findScopeContainingPosition(globalScope, changedStart);
    return changedScope.scope.isAnonymousScope() && changedScope.location?.contains(change.range) === true;
}

export function sleepInspectFile(uri: string): void {
    const record = s_inspectorResults.get(uri);
    if (record === undefined) return;

    record.isOpen = false;
}

/**
 * Re-inspect all files that have already been inspected.
 * This method is used to fully apply the configuration settings.
 */
export function reinspectAllFiles() {
    for (const uri of s_inspectorResults.keys()) {
        inspectFile(uri, s_inspectorResults.get(uri)!.content);
    }
}
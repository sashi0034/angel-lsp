import {Diagnostic} from "vscode-languageserver/node";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {NodeScript} from "../compiler_parser/nodes";
import {AnalyzedScope, SymbolScope} from "../compiler_analyzer/symbolScope";
import {URI} from "vscode-languageserver";
import {tracer} from "../code/tracer";
import {Profiler} from "../code/profiler";
import {tokenize} from "../compiler_tokenizer/tokenizer";
import {preprocessAfterTokenized, PreprocessedOutput} from "../compiler_parser/parserPreprocess";
import {parseAfterPreprocessed} from "../compiler_parser/parser";
import {DelayedTask} from "../utils/delayedTask";
import {diagnostic} from "../code/diagnostic";
import {AnalysisResolver, DiagnosticsCallback} from "./analysisResolver";

interface InspectRecord {
    content: string;
    uri: string;
    diagnosticsInParser: Diagnostic[]; // A diagnosed messages occurred in the parser or tokenizer
    diagnosticsInAnalyzer: Diagnostic[];
    tokenizedTokens: TokenObject[];
    preprocessedOutput: PreprocessedOutput;
    ast: NodeScript;
    analyzerTask: DelayedTask;
    analyzedScope: AnalyzedScope;
}

const s_inspectedResults: Map<string, InspectRecord> = new Map();

let s_diagnosticsCallback: DiagnosticsCallback = () => {
    return;
};

export function registerDiagnosticsCallback(callback: DiagnosticsCallback): void {
    s_diagnosticsCallback = callback;
}

const s_analysisResolver: AnalysisResolver = new AnalysisResolver(
    s_inspectedResults,
    (params) => s_diagnosticsCallback(params)
);

function createEmptyRecord(): InspectRecord {
    return {
        content: "",
        uri: "",
        diagnosticsInParser: [],
        diagnosticsInAnalyzer: [],
        tokenizedTokens: [],
        preprocessedOutput: {preprocessedTokens: [], includePathTokens: []},
        ast: [],
        analyzerTask: new DelayedTask(),
        analyzedScope: new AnalyzedScope('', new SymbolScope(undefined, '', undefined)),
    };
}

function insertNewRecord(uri: string, content: string): InspectRecord {
    const record = createEmptyRecord();
    record.content = content;
    record.uri = uri;
    s_inspectedResults.set(uri, record);
    return record;
}

/**
 * Get the inspected record of the specified file.
 */
export function getInspectedRecord(uri: URI): Readonly<InspectRecord> {
    const result = s_inspectedResults.get(uri);
    if (result === undefined) return createEmptyRecord();
    return result;
}

/**
 * Get the list of all inspected records as a list.
 */
export function getInspectedRecordList(): Readonly<InspectRecord>[] {
    return Array.from(s_inspectedResults.values());
}

const profilerDescriptionLength = 12;

export function inspectFile(uri: URI, content: string): void {
    tracer.message(`[Tokenizer and Parser]\n${uri}`);

    const record = s_inspectedResults.get(uri) ?? insertNewRecord(uri, content);

    diagnostic.beginSession();

    const profiler = new Profiler();

    // Execute the tokenizer
    record.tokenizedTokens = tokenize(uri, content);
    profiler.mark('Tokenizer'.padEnd(profilerDescriptionLength));

    // Execute the preprocessor
    record.preprocessedOutput = preprocessAfterTokenized(record.tokenizedTokens);
    profiler.mark('Preprocessor'.padEnd(profilerDescriptionLength));

    // Execute the parser
    record.ast = parseAfterPreprocessed(record.preprocessedOutput.preprocessedTokens);
    profiler.mark('Parser'.padEnd(profilerDescriptionLength));

    record.diagnosticsInParser = diagnostic.endSession();

    // Send the diagnostics on the way to the client
    s_diagnosticsCallback({
        uri: uri,
        diagnostics: [...record.diagnosticsInParser, ...record.diagnosticsInAnalyzer],
    });

    // Request delayed execution of the analyzer
    s_analysisResolver.request(uri);
}

/**
 * Re-inspect all files that have already been inspected.
 * This method is used to fully apply the configuration settings.
 */
export function reinspectAllFiles() {
    for (const uri of s_inspectedResults.keys()) {
        inspectFile(uri, s_inspectedResults.get(uri)!.content);
    }
}


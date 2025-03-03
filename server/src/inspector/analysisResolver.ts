import {Diagnostic} from "vscode-languageserver/node";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {NodeScript} from "../compiler_parser/nodes";
import {DelayedTask} from "../utils/delayedTask";
import {AnalyzerScope} from "../compiler_analyzer/symbolScope";
import {PublishDiagnosticsParams} from "vscode-languageserver-protocol";
import {getGlobalSettings} from "../code/settings";
import {PreprocessedOutput} from "../compiler_parser/parserPreprocess";
import {getParentDirectoryList, readFileContent, resolveUri} from "./fileUtils";
import {diagnostic} from "../code/diagnostic";
import {analyzerDiagnostic} from "../compiler_analyzer/analyzerDiagnostic";
import {Profiler} from "../code/profiler";
import {hoistAfterParsed} from "../compiler_analyzer/hoist";
import {analyzeAfterHoisted} from "../compiler_analyzer/analyzer";
import {tracer} from "../code/tracer";
import {inspectFile} from "./inspector";
import {fileURLToPath} from "node:url";
import * as fs from "fs";

interface PartialInspectRecord {
    uri: string;
    diagnosticsInParser: Diagnostic[];
    diagnosticsInAnalyzer: Diagnostic[];
    tokenizedTokens: TokenObject[];
    preprocessedOutput: PreprocessedOutput;
    ast: NodeScript;
    analyzerTask: DelayedTask;
    analyzerScope: AnalyzerScope;
}

export type DiagnosticsCallback = (params: PublishDiagnosticsParams) => void;

const predefinedFileName = 'as.predefined';

const profilerDescriptionLength = 12;

const mediumWaitTime = 500; // ms

const shortWaitTime = 10; // ms

// TODO: Fix memory leak

export class AnalysisResolver {
    private readonly _analyzerTask: DelayedTask = new DelayedTask();

    private _analysisQueue: PartialInspectRecord[] = [];
    private _reanalysisQueue: PartialInspectRecord[] = [];

    public constructor(
        public readonly recordList: Map<string, PartialInspectRecord>,
        private readonly diagnosticsCallback: DiagnosticsCallback,
    ) {
    }

    public request(uri: string) {
        this.pushAnalysisQueue(uri);

        this._analyzerTask.reschedule(() => {
            this.startAnalyze();
        }, mediumWaitTime);
    }

    private pushAnalysisQueue(uri: string) {
        if (this._analysisQueue.some(record => record.uri === uri)) return;

        this._analysisQueue.push(this.recordList.get(uri)!);

        this._reanalysisQueue = this._reanalysisQueue.filter(record => record.uri !== uri);
    }

    private pushReanalysisQueue(uri: string) {
        if (this._analysisQueue.some(record => record.uri === uri)) return;

        if (this._reanalysisQueue.some(record => record.uri === uri)) return;

        this._reanalysisQueue.push(this.recordList.get(uri)!);
    }

    private startAnalyze() {
        // Analyze the file in the queue
        let record = this._analysisQueue.shift();
        let shouldReanalyze = true;

        if (record === undefined) {
            // If the analysis queue is empty, analyze the file in the reanalysis queue
            record = this._reanalysisQueue.shift();
            if (record === undefined) return;

            shouldReanalyze = false;
        }

        this.analyzeFile(record);

        if (shouldReanalyze) {
            this.reanalyzeFilesWithDependency(record.uri);
        }

        if (this._analysisQueue.length > 0 || this._reanalysisQueue.length > 0) {
            this._analyzerTask.reschedule(() => {
                this.startAnalyze();
            }, shortWaitTime);
        }
    }

    private analyzeFile(record: PartialInspectRecord) {
        const predefinedUri = this.findPredefinedUri(record.uri);

        tracer.message(`[Analyzer]\n${record.uri}`);

        // Collect scopes in included files
        const includedScopes = this.collectIncludedScope(record, predefinedUri);

        analyzerDiagnostic.reset();

        const profiler = new Profiler();

        // Execute the hoist
        const hoistResult = hoistAfterParsed(record.ast, record.uri, includedScopes);
        profiler.mark('Hoist'.padEnd(profilerDescriptionLength));

        // Execute the analyzer
        record.analyzerScope = analyzeAfterHoisted(record.uri, hoistResult);
        profiler.mark('Analyzer'.padEnd(profilerDescriptionLength));

        record.diagnosticsInAnalyzer = analyzerDiagnostic.flush();

        this.diagnosticsCallback({
            uri: record.uri,
            diagnostics: [...record.diagnosticsInParser, ...record.diagnosticsInAnalyzer]
        });
    }

    // We will reanalyze the files that include the file specified by the given URI.
    // FIXME?
    private reanalyzeFilesWithDependency(targetUri: string) {
        const dependedFiles = Array.from(this.recordList.values()).filter(r =>
            this.resolveIncludePaths(r, this.findPredefinedUri(r.uri))
                .some(relativePath => resolveUri(r.uri, relativePath) === targetUri));

        for (const dependedFile of dependedFiles) {
            this.pushReanalysisQueue(dependedFile.uri);
        }
    }

    private resolveIncludePaths(record: PartialInspectRecord, predefinedUri: string | undefined): string[] {
        let includePaths =
            record.preprocessedOutput.includePathTokens.map(token => token.getStringContent());

        if (getGlobalSettings().implicitMutualInclusion) {
            // If implicit mutual inclusion is enabled, include all files under the directory where 'as.predefined' is located.
            if (record.uri.endsWith(predefinedFileName) === false && predefinedUri !== undefined) {
                const predefinedDirectory = resolveUri(predefinedUri, '.');
                includePaths =
                    Array.from(this.recordList.keys()).filter(uri => uri.startsWith(predefinedDirectory))
                        .filter(uri => uri.endsWith('.as') && uri !== record.uri);
            }
        }

        return includePaths;
    }

    private findPredefinedUri(targetUri: string): string | undefined {
        const dirs = getParentDirectoryList(targetUri);

        // Search for nearest 'as.predefined'
        for (const dir of dirs) {
            const predefinedUri = dir + `/${predefinedFileName}`;

            // Return the record if the file has already been analyzed
            if (this.recordList.get(predefinedUri) !== undefined) return predefinedUri;

            const content = readFileContent(predefinedUri);
            if (content === undefined) continue;

            // If the file is found, inspect it
            inspectFile(predefinedUri, content);

            // Inspect all files under the directory where 'as.predefined' is located
            this.inspectUnderDirectory(resolveUri(predefinedUri, '.'));

            return predefinedUri;
        }

        return undefined;
    }

    private inspectUnderDirectory(dirUri: string) {
        const entries = fs.readdirSync(fileURLToPath(dirUri), {withFileTypes: true});
        for (const entry of entries) {
            const fileUri = resolveUri(dirUri, entry.name);
            if (entry.isDirectory()) {
                this.inspectUnderDirectory(`${fileUri}/`);
            } else if (entry.isFile() && fileUri.endsWith('.as')) {
                const content = readFileContent(fileUri);
                if (content !== undefined) inspectFile(fileUri, content);
            }
        }
    }

    private collectIncludedScope(
        record: PartialInspectRecord, predefinedUri: string | undefined
    ): AnalyzerScope[] {
        const preprocessOutput = record.preprocessedOutput;
        const targetUri = record.uri;

        // Collect scopes in included files
        const includePaths = this.resolveIncludePaths(record, predefinedUri);

        const includedScopes = [];

        // Load as.predefined
        if (targetUri !== predefinedUri && predefinedUri !== undefined) {
            const predefinedResult = this.recordList.get(predefinedUri);
            if (predefinedResult !== undefined) includedScopes.push(predefinedResult.analyzerScope);
        }

        // Get the analyzed scope of included files
        for (const relativeUri of includePaths) {
            const uri = resolveUri(targetUri, relativeUri);

            const includedRecord = this.recordList.get(uri);
            if (includedRecord !== undefined) {
                includedScopes.push(includedRecord.analyzerScope);
                continue;
            }

            // If the file has not been analyzed, start inspecting it
            const content = readFileContent(uri);
            if (content !== undefined) {
                inspectFile(uri, content);
                continue;
            }

            // If the file is not found, notify the error
            const includePathToken =
                preprocessOutput.includePathTokens.find(token => token.getStringContent() === relativeUri)!;
            diagnostic.addError(includePathToken.location, `File not found: ${relativeUri}`);
        }

        return includedScopes;
    }
}

import * as lsp from 'vscode-languageserver/node';
import {TokenObject} from '../compiler_tokenizer/tokenObject';
import {Node_Script} from '../compiler_parser/nodeObject';
import {SymbolGlobalScope} from '../compiler_analyzer/symbolScope';
import {logger} from '../core/logger';
import {Profiler} from '../core/profiler';
import {tokenize} from '../compiler_tokenizer/tokenizer';
import {preprocessAfterTokenize, PreprocessedOutput} from '../compiler_parser/parserPreprocess';
import {parseAfterPreprocess} from '../compiler_parser/parser';
import {diagnostic} from '../core/diagnostic';
import {AnalysisResolver, DiagnosticsCallback} from './analysisResolver';
import {AnalyzerScope} from '../compiler_analyzer/analyzerScope';
import {TextPosition} from '../compiler_tokenizer/textLocation';
import {findScopeContainingPosition} from '../service/utils';
import {moveDiagnosticsByChanges} from '../service/contentChangeApplier';
import {getGlobalSettings} from '../core/settings';

interface InspectRecord {
    content: string;
    uri: string;
    // isOpen: boolean;
    diagnosticsInParser: lsp.Diagnostic[]; // Diagnostics reported by the tokenizer or parser
    diagnosticsInAnalyzer: lsp.Diagnostic[];
    rawTokens: TokenObject[];
    preprocessedOutput: PreprocessedOutput;
    ast: Node_Script;
    isAnalyzerPending: boolean;
    analyzerScope: AnalyzerScope;
}

function createEmptyRecord(uri: string, content: string): InspectRecord {
    return {
        content: content,
        uri: uri,
        // isOpen: false,
        diagnosticsInParser: [],
        diagnosticsInAnalyzer: [],
        rawTokens: [],
        preprocessedOutput: {preprocessedTokens: [], includePathTokens: [], definedSymbols: new Set()},
        ast: [],
        isAnalyzerPending: false,
        analyzerScope: new AnalyzerScope(uri, new SymbolGlobalScope(uri))
    };
}

const profilerDescriptionLength = 12;

interface InspectOption {
    isOpen?: boolean;
    changes?: lsp.TextDocumentContentChangeEvent[];
}

export class Inspector {
    private readonly _inspectRecords: Map<string, InspectRecord> = new Map();

    private _diagnosticsCallback: DiagnosticsCallback = () => {
        return;
    };

    private readonly _analysisResolver: AnalysisResolver = new AnalysisResolver(
        this._inspectRecords,
        (uri, content) => this.inspectFile(uri, content),
        params => this._diagnosticsCallback(params)
    );

    public registerDiagnosticsCallback(callback: DiagnosticsCallback): void {
        this._diagnosticsCallback = callback;
    }

    private createRecordAndInsert(uri: string, content: string): InspectRecord {
        const record = createEmptyRecord(uri, content);
        this._inspectRecords.set(uri, record);
        return record;
    }

    /**
     * Return the inspected record for the specified file.
     */
    public getRecord(uri: string): Readonly<InspectRecord> {
        const result = this._inspectRecords.get(uri);
        if (result === undefined) {
            return createEmptyRecord(uri, '');
        }

        return result;
    }

    /**
     * Return all inspected records as a list.
     */
    public getAllRecords(): Readonly<InspectRecord>[] {
        return Array.from(this._inspectRecords.values());
    }

    /**
     * Flush the inspected record for the specified file because the analyzer runs asynchronously.
     */
    public flushRecord(uri?: string): void {
        this._analysisResolver.flush(uri);
    }

    public inspectFile(uri: string, content: string, option?: InspectOption): void {
        logger.message(`[Tokenizer and Parser]\n${uri}`);

        const record = this._inspectRecords.get(uri) ?? this.createRecordAndInsert(uri, content);

        // Update the file content.
        record.content = content;

        // record.isOpen = option?.isOpen === true;

        // -----------------------------------------------
        diagnostic.beginSession();

        const profiler = new Profiler();

        // Run the tokenizer.
        record.rawTokens = tokenize(uri, content);
        profiler.mark('Tokenizer'.padEnd(profilerDescriptionLength));

        // Run the preprocessor.
        record.preprocessedOutput = preprocessAfterTokenize(record.rawTokens, getGlobalSettings().definedSymbols);
        profiler.mark('Preprocessor'.padEnd(profilerDescriptionLength));

        // Run the parser.
        record.ast = parseAfterPreprocess(record.preprocessedOutput.preprocessedTokens);
        profiler.mark('Parser'.padEnd(profilerDescriptionLength));

        record.diagnosticsInParser = diagnostic.endSession();
        // -----------------------------------------------

        if (option?.changes !== undefined) {
            // Shift analyzer diagnostics to match the content changes in the editor.
            moveDiagnosticsByChanges(record.diagnosticsInAnalyzer, option.changes);
        }

        record.isAnalyzerPending = true;

        // Send the current diagnostics back to the client.
        this._diagnosticsCallback({
            uri: uri,
            diagnostics: [...record.diagnosticsInParser, ...record.diagnosticsInAnalyzer]
        });

        // Schedule the analyzer to run later.
        this._analysisResolver.request(
            record,
            shouldReanalyzeDependents(record.analyzerScope.globalScope, option?.changes)
        );

        logger.message(`(${process.memoryUsage().heapUsed / 1024 / 1024} MB used)`);
    }

    // public sleepRecord(uri: string): void {
    //     const record = this._inspectRecords.get(uri);
    //     if (record === undefined) return;
    //
    //     record.isOpen = false;
    // }

    public deleteRecord(uri: string): void {
        this._inspectRecords.delete(uri);
    }

    /**
     * Reinspect every file that has already been inspected.
     * This fully reapplies the current configuration.
     */
    public reinspectAllFiles() {
        for (const uri of this._inspectRecords.keys()) {
            this.inspectFile(uri, this._inspectRecords.get(uri)!.content);
        }
    }

    public reset() {
        this._inspectRecords.clear();
        this._analysisResolver.reset();
    }
}

function shouldReanalyzeDependents(
    globalScope: SymbolGlobalScope,
    change?: lsp.TextDocumentContentChangeEvent[]
): boolean {
    if (change === undefined) {
        return true;
    }

    for (const changeEvent of change) {
        if (isChangeInAnonymousScope(globalScope, changeEvent) === false) {
            // Reanalyze dependents unless the change is confined to an anonymous scope.
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

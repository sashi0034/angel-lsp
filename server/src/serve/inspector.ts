import {TokenizingToken, TokenKind} from "../compile/tokens";
import {Profiler} from "../code/profiler";
import {tokenize} from "../compile/tokenizer";
import {parseFromTokenized} from "../compile/parser";
import {analyzeFromParsed} from "../compile/analyzer";
import {convertToParsingTokens, ParsingToken} from "../compile/parsingToken";
import {findFileInCurrentDirectory} from "../utils/findFile";
import {diagnostic} from '../code/diagnostic';
import {Diagnostic} from "vscode-languageserver/node";
import {AnalyzedScope, createSymbolScope} from "../compile/scope";
import {DocumentPath} from "./documentPath";
import {tracer} from "../code/tracer";

interface InspectResult {
    diagnostics: Diagnostic[];
    tokenizedTokens: TokenizingToken[];
    analyzedScope: AnalyzedScope;
}

const s_inspectedResults: { [path: string]: InspectResult } = {};

let s_predefinedPath = '';

const emptyResult: InspectResult = {
    diagnostics: [],
    tokenizedTokens: [],
    analyzedScope: new AnalyzedScope('', createSymbolScope(undefined, undefined, ''))
} as const;

export function getInspectedResult(document: DocumentPath): InspectResult {
    const path = document.path;
    const result = s_inspectedResults[path];
    if (result === undefined) return emptyResult;
    return result;
}

export function getInspectedResultList(): InspectResult[] {
    return Object.values(s_inspectedResults);
}

export function inspectFile(content: string, document: DocumentPath) {
    const path = document.path;

    // 事前定義ファイルの読み込み
    checkInspectPredefined();

    // 解析結果をキャッシュ
    s_inspectedResults[path] = inspectInternal(content, path);
}

function checkInspectPredefined() {
    if (s_inspectedResults[s_predefinedPath] !== undefined) return;

    const predefined = findFileInCurrentDirectory('as.predefined');
    if (predefined === undefined) return;

    s_inspectedResults[predefined.fullPath] = inspectInternal(predefined.content, predefined.fullPath);
    s_predefinedPath = predefined.fullPath;
}

function inspectInternal(content: string, path: string): InspectResult {
    tracer.message(`🔬 Inspect "${path}"`);

    diagnostic.reset();

    const profiler = new Profiler("Inspector");

    // 字句解析
    const tokenizedTokens = tokenize(content, path);
    profiler.stamp("Tokenizer");

    // 構文解析
    const parsed = parseFromTokenized(convertToParsingTokens(tokenizedTokens));
    profiler.stamp("Parser");

    // 型解析
    const includedScopes = getIncludedScope(path);

    const analyzedScope = analyzeFromParsed(parsed, path, includedScopes);
    profiler.stamp("Analyzer");

    return {
        diagnostics: diagnostic.get(),
        tokenizedTokens: tokenizedTokens,
        analyzedScope: analyzedScope
    };
}

function getIncludedScope(path: string) {
    const includedScopes = []; // TODO: #include 対応

    // 事前定義ファイルの読み込み
    const predefinedResult = s_inspectedResults[s_predefinedPath];
    if (path !== s_predefinedPath && predefinedResult !== undefined) includedScopes.push(predefinedResult.analyzedScope);
    return includedScopes;
}

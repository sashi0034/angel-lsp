import {TokenizingToken, TokenKind} from "../compile/token";
import {profiler} from "../debug/profiler";
import {tokenize} from "../compile/tokenizer";
import {parseFromTokenized} from "../compile/parser";
import {analyzeFromParsed} from "../compile/analyzer";
import {URI} from "vscode-languageserver";
import {convertToParsingTokens, ParsingToken} from "../compile/parsing";
import {fileURLToPath} from 'url';
import {findFileInCurrentDirectory} from "../utils/findFile";
import {diagnostic} from '../code/diagnostic';
import {Diagnostic} from "vscode-languageserver/node";
import {AnalyzedScope, createSymbolScope} from "../compile/scope";

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
    analyzedScope: new AnalyzedScope('', createSymbolScope(undefined, undefined))
} as const;

export function getInspectedResultFromUri(uri: URI): InspectResult {
    const result = s_inspectedResults[fileURLToPath(uri)];
    if (result === undefined) return emptyResult;
    return result;
}

export function inspectFile(document: string, uri: URI) {
    const path = fileURLToPath(uri);

    // 事前定義ファイルの読み込み
    checkInspectPredefined();

    // 解析結果をキャッシュ
    s_inspectedResults[path] = inspectInternal(document, path);
}

function checkInspectPredefined() {
    if (s_inspectedResults[s_predefinedPath] !== undefined) return;

    const predefined = findFileInCurrentDirectory('as.predefined');
    if (predefined === undefined) return;

    s_inspectedResults[predefined.fullPath] = inspectInternal(predefined.content, predefined.fullPath);
    s_predefinedPath = predefined.fullPath;
}

function inspectInternal(document: string, path: string): InspectResult {
    diagnostic.reset();

    profiler.restart();

    // 字句解析
    const tokenizedTokens = tokenize(document, path);
    profiler.stamp("tokenizer");

    // 構文解析
    const parsed = parseFromTokenized(convertToParsingTokens(tokenizedTokens));
    profiler.stamp("parser");

    // 型解析
    const includedScopes = getIncludedScope(path);

    const analyzedScope = analyzeFromParsed(parsed, path, includedScopes);
    profiler.stamp("analyzer");

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


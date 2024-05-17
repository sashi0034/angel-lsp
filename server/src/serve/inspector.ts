import {TokenizingToken} from "../compile/tokens";
import {Profiler} from "../code/profiler";
import {tokenize} from "../compile/tokenizer";
import {parseFromTokenized} from "../compile/parser";
import {analyzeFromParsed} from "../compile/analyzer";
import {convertToParsingTokens} from "../compile/parsingToken";
import {diagnostic} from '../code/diagnostic';
import {Diagnostic, TextDocuments} from "vscode-languageserver/node";
import {AnalyzedScope, createSymbolScope} from "../compile/scope";
import {tracer} from "../code/tracer";
import {NodeScript} from "../compile/nodes";
import {URI} from "vscode-languageserver";
import {TextDocument} from "vscode-languageserver-textdocument";
import * as url from "url";
import * as path from "node:path";
import * as fs from "fs";
import {fileURLToPath} from "node:url";

interface InspectResult {
    content: string;
    diagnostics: Diagnostic[];
    tokenizedTokens: TokenizingToken[];
    parsedAst: NodeScript;
    analyzedScope: AnalyzedScope;
}

const s_inspectedResults: { [uri: string]: InspectResult } = {};

const emptyResult: InspectResult = {
    content: '',
    diagnostics: [],
    tokenizedTokens: [],
    parsedAst: [],
    analyzedScope: new AnalyzedScope('', createSymbolScope(undefined, undefined, ''))
} as const;

export function getInspectedResult(uri: URI): InspectResult {
    const result = s_inspectedResults[uri];
    if (result === undefined) return emptyResult;
    return result;
}

export function getInspectedResultList(): InspectResult[] {
    return Object.values(s_inspectedResults);
}

export function inspectFile(document: TextDocuments<TextDocument>, targetUri: URI) {
    // 事前定義ファイルの読み込み
    const predefinedUri = checkInspectPredefined(document, targetUri);

    // 解析結果をキャッシュ
    s_inspectedResults[targetUri] = inspectInternal(
        document.get(targetUri)?.getText() ?? '', targetUri, predefinedUri);
}

function checkInspectPredefined(documents: TextDocuments<TextDocument>, targetUri: URI) {
    const dirs = splitUriIntoDirectories(targetUri);

    // 既に事前定義ファイルを解析済みの場合、その URI を返す
    for (const dir of dirs) {
        const predefinedUri = dir + '/as.predefined';

        const predefinedResult = s_inspectedResults[predefinedUri];
        if (predefinedResult !== undefined) return predefinedUri;
    }

    // 事前定義ファイルが解析されていないとき、ファイルを探索して as.predefined があれば解析する
    for (const dir of dirs) {
        const predefinedUri = dir + '/as.predefined';

        const content = readFileFromUri(predefinedUri);
        if (content === undefined) continue;

        s_inspectedResults[predefinedUri] = inspectInternal(content, predefinedUri, undefined);
        return predefinedUri;
    }

    return undefined;
}

function readFileFromUri(uri: string): string | undefined {
    try {
        const predefinedPath = fileURLToPath(uri);
        if (fs.existsSync(predefinedPath) === false) return undefined;

        return fs.readFileSync(predefinedPath, 'utf8');
    } catch (error) {
        return undefined;
    }
}

function splitUriIntoDirectories(fileUri: string): string[] {
    const parsedUrl = url.parse(fileUri);
    const currentPath = parsedUrl.pathname;
    if (currentPath === null) return [];

    const directories: string[] = [];
    let parentPath = currentPath;

    // ディレクトリがルートに達するまで繰り返す
    while (parentPath !== path.dirname(parentPath)) {
        parentPath = path.dirname(parentPath);
        directories.push(url.format({
            protocol: parsedUrl.protocol,
            slashes: true,
            hostname: parsedUrl.hostname,
            pathname: parentPath
        }));
    }

    return directories;
}

function inspectInternal(content: string, targetUri: URI, predefinedUri: URI | undefined): InspectResult {
    tracer.message(`🔬 Inspect "${targetUri}"`);

    diagnostic.reset();

    const profiler = new Profiler("Inspector");

    // 字句解析
    const tokenizedTokens = tokenize(content, targetUri);
    profiler.stamp("Tokenizer");

    // 構文解析
    const parsedAst = parseFromTokenized(convertToParsingTokens(tokenizedTokens));
    profiler.stamp("Parser");

    // 型解析
    const includedScopes = getIncludedScope(targetUri, predefinedUri);

    const analyzedScope = analyzeFromParsed(parsedAst, targetUri, includedScopes);
    profiler.stamp("Analyzer");

    return {
        content: content,
        diagnostics: diagnostic.get(),
        tokenizedTokens: tokenizedTokens,
        parsedAst: parsedAst,
        analyzedScope: analyzedScope
    };
}

function getIncludedScope(uri: URI, predefinedUri: URI | undefined) {
    const includedScopes = []; // TODO: #include 対応

    // 事前定義ファイルの読み込み
    if (uri !== predefinedUri && predefinedUri !== undefined) {
        const predefinedResult = s_inspectedResults[predefinedUri];
        if (predefinedResult !== undefined) includedScopes.push(predefinedResult.analyzedScope);
    }

    return includedScopes;
}

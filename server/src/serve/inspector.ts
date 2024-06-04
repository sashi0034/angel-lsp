import {TokenizingToken} from "../compile/tokens";
import {Profiler} from "../code/profiler";
import {tokenize} from "../compile/tokenizer";
import {parseFromTokenized} from "../compile/parser";
import {analyzeFromParsed} from "../compile/analyzer";
import {diagnostic} from '../code/diagnostic';
import {Diagnostic} from "vscode-languageserver/node";
import {AnalyzedScope, createSymbolScope} from "../compile/scope";
import {tracer} from "../code/tracer";
import {NodeScript} from "../compile/nodes";
import {URI} from "vscode-languageserver";
import * as url from "url";
import * as path from "node:path";
import * as fs from "fs";
import {fileURLToPath} from "node:url";
import {URL} from 'url';
import {preprocessTokensForParser} from "../compile/parsingPreprocess";

interface InspectResult {
    content: string;
    diagnostics: Diagnostic[];
    tokenizedTokens: TokenizingToken[];
    parsedAst: NodeScript;
    analyzedScope: AnalyzedScope;
}

const s_inspectedResults: { [uri: string]: InspectResult } = {};

function createEmptyResult(): InspectResult {
    return {
        content: '',
        diagnostics: [],
        tokenizedTokens: [],
        parsedAst: [],
        analyzedScope: new AnalyzedScope('', createSymbolScope(undefined, undefined, ''))
    } as const;
}

export function getInspectedResult(uri: URI): InspectResult {
    const result = s_inspectedResults[uri];
    if (result === undefined) return createEmptyResult();
    return result;
}

export function getInspectedResultList(): InspectResult[] {
    return Object.values(s_inspectedResults);
}

export function inspectFile(content: string, targetUri: URI) {
    // 事前定義ファイルの読み込み
    const predefinedUri = checkInspectPredefined(targetUri);

    // 解析結果をキャッシュ
    s_inspectedResults[targetUri] = inspectInternal(content, targetUri, predefinedUri);
}

function checkInspectPredefined(targetUri: URI) {
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
        const path = fileURLToPath(uri);
        if (fs.existsSync(path) === false) return undefined;

        return fs.readFileSync(path, 'utf8');
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
    const preprocessedTokens = preprocessTokensForParser(tokenizedTokens);
    profiler.stamp("Preprocess");

    const parsedAst = parseFromTokenized(preprocessedTokens.parsingTokens);
    profiler.stamp("Parser");

    // 型解析
    const includedScopes = getIncludedScope(targetUri, predefinedUri, preprocessedTokens.includeFiles);

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

function resolveUri(dir: string, relativeUri: string): string {
    const u = new URL(dir);
    return url.format(new URL(relativeUri, u));
}

function getIncludedScope(target: URI, predefinedUri: URI | undefined, includedUris: TokenizingToken[]) {
    const includedScopes = [];

    // as.predefined の読み込み
    if (target !== predefinedUri && predefinedUri !== undefined) {
        const predefinedResult = s_inspectedResults[predefinedUri];
        if (predefinedResult !== undefined) includedScopes.push(predefinedResult.analyzedScope);
    }

    // #include されたファイルの解析済みスコープを取得
    for (const includeToken of includedUris) {
        const relativeUri = includeToken.text.substring(1, includeToken.text.length - 1);
        const uri = resolveUri(target, relativeUri);

        if (s_inspectedResults[uri] === undefined) {
            const content = readFileFromUri(uri);
            if (content === undefined) {
                diagnostic.addError(includeToken.location, `File not found: "${fileURLToPath(uri)}"`);
                continue;
            }

            // 循環参照によるループを回避するため、空を一時的に設定
            s_inspectedResults[uri] = createEmptyResult();

            s_inspectedResults[uri] = inspectInternal(content, uri, undefined);
        }

        const result = s_inspectedResults[uri];
        if (result !== undefined) includedScopes.push(result.analyzedScope);
    }

    return includedScopes;
}

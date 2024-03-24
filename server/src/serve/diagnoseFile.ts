import {TokenizingToken} from "../compile/token";
import {profiler} from "../debug/profiler";
import {tokenize} from "../compile/tokenizer";
import {parseFromTokenized} from "../compile/parser";
import {analyzeFromParsed} from "../compile/analyzer";
import {URI} from "vscode-languageserver";
import {AnalyzedScope, createSymbolScope} from "../compile/symbolic";
import {ParsingToken} from "../compile/parsing";
import {fileURLToPath} from 'url';
import {findFileInCurrentDirectory} from "../utils/findFile";
import {diagnostic} from '../code/diagnostic';

interface DiagnoseResult {
    tokenizedTokens: TokenizingToken[];
    analyzedScope: AnalyzedScope;
}

const s_diagnosedResults: { [path: string]: DiagnoseResult } = {};

let s_predefinedPath = '';

const emptyResult: DiagnoseResult = {
    tokenizedTokens: [],
    analyzedScope: new AnalyzedScope('', createSymbolScope(undefined, undefined))
} as const;

export function getDiagnosedResultFromUri(uri: string): DiagnoseResult {
    const result = s_diagnosedResults[fileURLToPath(uri)];
    if (result === undefined) return emptyResult;
    return result;
}

export function diagnoseFile(document: string, uri: URI) {
    const path = fileURLToPath(uri);

    // 事前定義ファイルの読み込み
    checkDiagnosedPredefined();

    // 解析結果をキャッシュ
    s_diagnosedResults[path] = diagnoseInternal(document, path);
}

function checkDiagnosedPredefined() {
    if (s_diagnosedResults[s_predefinedPath] !== undefined) return;

    const predefined = findFileInCurrentDirectory('as.predefined');
    if (predefined === undefined) return;

    s_diagnosedResults[predefined.fullPath] = diagnoseInternal(predefined.content, predefined.fullPath);
    s_predefinedPath = predefined.fullPath;
}

function diagnoseInternal(document: string, path: string): DiagnoseResult {
    diagnostic.clear();

    profiler.restart();

    // 字句解析
    const tokenizedTokens = tokenize(document, path);
    profiler.stamp("tokenizer");

    // 構文解析
    const parsed = parseFromTokenized(filterTokens(tokenizedTokens));
    profiler.stamp("parser");

    // 型解析
    const includedScopes = getIncludedScope();

    const analyzedScope = analyzeFromParsed(parsed, path, includedScopes);
    profiler.stamp("analyzer");

    return {tokenizedTokens: tokenizedTokens, analyzedScope: analyzedScope};
}

function getIncludedScope() {
    const includedScopes = []; // TODO: #include 対応

    // 事前定義ファイルの読み込み
    const predefinedResult = s_diagnosedResults[s_predefinedPath];
    if (predefinedResult !== undefined) includedScopes.push(predefinedResult.analyzedScope);
    return includedScopes;
}

function filterTokens(tokens: TokenizingToken[]): ParsingToken[] {
    // コメント除去
    const actualTokens: ParsingToken[] = tokens.filter(t => t.kind !== 'comment').map(token => {
        return {
            ...token,
            index: -1,
            next: undefined
        };
    });

    // 連続する文字列の結合
    for (let i = actualTokens.length - 1; i >= 1; i--) {
        const isContinuousString = actualTokens[i].kind === 'string' && actualTokens[i - 1].kind === 'string';
        if (isContinuousString === false) continue;

        // 結合した要素を新規生成
        actualTokens[i - 1] = createConnectedStringTokenAt(actualTokens, i);
        actualTokens.splice(i, 1);
    }

    for (let i = 0; i < actualTokens.length; i++) {
        actualTokens[i].index = i;
        actualTokens[i].next = i != actualTokens.length - 1 ? actualTokens[i + 1] : undefined;
    }
    return actualTokens;
}

function createConnectedStringTokenAt(actualTokens: ParsingToken[], index: number): ParsingToken {
    return {
        kind: 'string',
        text: actualTokens[index].text + actualTokens[index + 1].text,
        location: {
            path: actualTokens[index].location.path,
            start: actualTokens[index].location.start,
            end: actualTokens[index + 1].location.end
        },
        highlight: actualTokens[index].highlight,
        index: -1,
        next: undefined
    };
}

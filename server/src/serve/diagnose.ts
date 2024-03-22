import {SemanticTokensBuilder} from "vscode-languageserver/node";
import {TokenizedToken} from "../compile/token";
import {profiler} from "../debug/profiler";
import {tokenize} from "../compile/tokenizer";
import {parseFromTokenized} from "../compile/parser";
import {analyzeFromParsed} from "../compile/analyzer";
import {URI} from "vscode-languageserver";
import {createSymbolScope, SymbolScope} from "../compile/symbolic";
import {SemanticTokens} from "vscode-languageserver-protocol";
import {ParsedToken} from "../compile/parsing";

interface DiagnoseResult {
    tokenizedTokens: TokenizedToken[];
    analyzedScope: SymbolScope;
}

const s_diagnosedResults: { [uri: string]: DiagnoseResult } = {};

const emptyResult: DiagnoseResult = {
    tokenizedTokens: [],
    analyzedScope: createSymbolScope(undefined, undefined)
} as const;

export function getDiagnosedResult(uri: string): DiagnoseResult {
    const result = s_diagnosedResults[uri];
    if (result === undefined) return emptyResult;
    return result;
}

export function startDiagnose(document: string, uri: URI) {
    profiler.restart();

    // 字句解析
    const tokenizedTokens = tokenize(document, uri);
    profiler.stamp("tokenizer");
    // console.log(tokens);

    // 構文解析
    const parsed = parseFromTokenized(filterTokens(tokenizedTokens));
    profiler.stamp("parser");
    // console.log(parsed);

    // 型解析
    const analyzeScope = analyzeFromParsed(parsed);
    profiler.stamp("analyzer");
    // console.log(analyzed);

    // 解析結果をキャッシュ
    s_diagnosedResults[uri] = {
        tokenizedTokens: tokenizedTokens,
        analyzedScope: analyzeScope
    };
}

function filterTokens(tokens: TokenizedToken[]): ParsedToken[] {
    // コメント除去
    const actualTokens: ParsedToken[] = tokens.filter(t => t.kind !== 'comment').map(token => {
        return {
            ...token,
            index: -1,
            next: undefined
        };
    });

    // 連続する文字列の結合
    for (let i = actualTokens.length - 1; i >= 1; i--) {
        if (actualTokens[i].kind === 'string' && actualTokens[i - 1].kind === 'string') {
            // 結合した要素を新規生成
            actualTokens[i - 1] = {
                kind: 'string',
                text: actualTokens[i - 1].text + actualTokens[i].text,
                location: {
                    uri: actualTokens[i - 1].location.uri,
                    start: actualTokens[i - 1].location.start,
                    end: actualTokens[i].location.end
                },
                highlight: actualTokens[i - 1].highlight,
                index: -1,
                next: undefined
            };
            actualTokens.splice(i, 1);
        }
    }

    for (let i = 0; i < actualTokens.length; i++) {
        actualTokens[i].index = i;
        actualTokens[i].next = i != actualTokens.length - 1 ? actualTokens[i + 1] : undefined;
    }
    return actualTokens;
}

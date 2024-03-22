import {SemanticTokensBuilder} from "vscode-languageserver/node";
import {ProgramToken} from "../compile/asToken";
import {profiler} from "../debug/profiler";
import {asTokenize} from "../compile/asTokenizer";
import {asParse} from "../compile/asParser";
import {asAnalyze} from "../compile/asAnalyzer";
import {URI} from "vscode-languageserver";
import {createSymbolScope, SymbolScope} from "../compile/asSymbolic";
import {SemanticTokens} from "vscode-languageserver-protocol";
import {ParsingToken} from "../compile/asParsing";

interface DiagnoseResult {
    tokenizedTokens: ProgramToken[];
    analyzedScope: SymbolScope;
}

// TODO: 複数ファイルに対応、まじで
const s_diagnosedResult: DiagnoseResult = {
    tokenizedTokens: [],
    analyzedScope: createSymbolScope(undefined, undefined)
};

export function getDiagnosedResult() {
    return s_diagnosedResult;
}

export function serveDiagnose(document: string, uri: URI) {
    profiler.restart();
    const tokenizedTokens = asTokenize(document, uri);
    profiler.stamp("tokenizer");
    // console.log(tokens);
    const parsed = asParse(filterTokens(tokenizedTokens));
    profiler.stamp("parser");
    // console.log(parsed);
    const analyzeScope = asAnalyze(parsed);
    profiler.stamp("analyzer");
    // console.log(analyzed);

    s_diagnosedResult.tokenizedTokens = tokenizedTokens;
    s_diagnosedResult.analyzedScope = analyzeScope;
}

function filterTokens(tokens: ProgramToken[]): ParsingToken[] {
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

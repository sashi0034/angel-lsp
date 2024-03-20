import {SemanticTokensBuilder} from "vscode-languageserver/node";
import {ProgramToken} from "../compile/token";
import {profiler} from "../debug/profiler";
import {tokenize} from "../compile/tokenizer";
import {parseFromTokens} from "../compile/parser";
import {analyzeFromParsed} from "../compile/analyzer";
import {URI} from "vscode-languageserver";
import {SymbolScope} from "../compile/symbolics";
import {SemanticTokens} from "vscode-languageserver-protocol";
import {ParsingToken} from "../compile/parsing";

// TODO: 複数ファイルに対応
let s_diagnosedScope: SymbolScope | undefined = undefined;

export function getDiagnosedScope() {
    return s_diagnosedScope;
}

export function startDiagnose(document: string, uri: URI): SemanticTokens {
    const builder = new SemanticTokensBuilder();
    profiler.restart();
    const tokens = tokenize(document, uri);
    profiler.stamp("tokenizer");
    // console.log(tokens);
    const parsed = parseFromTokens(filterTokens(tokens));
    profiler.stamp("parser");
    // console.log(parsed);
    s_diagnosedScope = analyzeFromParsed(parsed);
    profiler.stamp("analyzer");
    // console.log(analyzed);

    tokens.forEach((token, i) => {
        pushTokenToBuilder(builder, token);
    });

    return builder.build();
}

function filterTokens(tokens: ProgramToken[]): ParsingToken[] {
    // コメント除去
    const actualTokens = tokens.filter(t => t.kind !== 'comment').map(token => {
        return {
            ...token,
            index: -1
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
                index: -1
            };
            actualTokens.splice(i, 1);
        }
    }

    for (let i = 0; i < actualTokens.length; i++) {
        actualTokens[i].index = i;
    }
    return actualTokens;
}

function pushTokenToBuilder(builder: SemanticTokensBuilder, token: ProgramToken) {
    builder.push(
        token.location.start.line,
        token.location.start.character,
        token.text.length,
        token.highlight.token,
        token.highlight.modifier);

    if (token.location.start.line === token.location.end.line) return;

    // 複数行のトークンは行分割
    for (let i = token.location.start.line + 1; i < token.location.end.line; i++) {
        builder.push(
            i,
            0,
            token.text.length,
            token.highlight.token,
            token.highlight.modifier);
    }
    builder.push(
        token.location.end.line,
        0,
        token.location.end.character,
        token.highlight.token,
        token.highlight.modifier);
}
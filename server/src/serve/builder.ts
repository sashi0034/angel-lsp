import {SemanticTokensBuilder} from "vscode-languageserver/node";
import {TokenObject} from "../compile/token";
import {profiler} from "../debug/profiler";
import {tokenize} from "../compile/tokenizer";
import {parseFromTokens} from "../compile/parser";
import {analyzeFromParsed} from "../compile/analyzer";
import {URI} from "vscode-languageserver";
import {SymbolScope} from "../compile/symbolics";
import {SemanticTokens} from "vscode-languageserver-protocol";

// TODO: 複数ファイルに対応
let s_builtAnalyzed: SymbolScope | null = null;

export function getBuiltAnalyzed() {
    return s_builtAnalyzed;
}

export function buildSemanticTokens(document: string, uri: URI): SemanticTokens {
    const builder = new SemanticTokensBuilder();
    profiler.restart();
    const tokens = tokenize(document, uri);
    profiler.stamp("tokenizer");
    // console.log(tokens);
    const parsed = parseFromTokens(tokens.filter(t => t.kind !== 'comment'));
    profiler.stamp("parser");
    // console.log(parsed);
    s_builtAnalyzed = analyzeFromParsed(parsed);
    profiler.stamp("analyzer");
    // console.log(analyzed);

    tokens.forEach((token, i) => {
        pushTokenToBuilder(builder, token);
    });

    return builder.build();
}

function pushTokenToBuilder(builder: SemanticTokensBuilder, token: TokenObject) {
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
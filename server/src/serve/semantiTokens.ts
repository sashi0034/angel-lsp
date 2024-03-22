import {SemanticTokensBuilder} from "vscode-languageserver/node";
import {ProgramToken} from "../compile/asToken";
import {SemanticTokens} from "vscode-languageserver-protocol";

export function buildSemanticTokens(tokens: ProgramToken[]): SemanticTokens {
    const builder = new SemanticTokensBuilder();
    tokens.forEach((token, i) => {
        pushTokenToBuilder(builder, token);
    });

    return builder.build();
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
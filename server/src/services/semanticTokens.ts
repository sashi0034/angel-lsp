import {SemanticTokensBuilder} from "vscode-languageserver/node";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {SemanticTokens} from "vscode-languageserver-protocol";

export function provideSemanticTokens(tokens: TokenObject[]): SemanticTokens {
    const builder = new SemanticTokensBuilder();
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

    // Multi-line tokens have to be split by line.
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
import {TokenizingToken, TokenKind} from "./tokens";
import {URI} from "vscode-languageserver";
import {createVirtualToken, ParsingToken} from "./parsingToken";

export function preprocessTokensForParser(
    tokens: TokenizingToken[], fileGetter: (uri: URI) => string | undefined
): ParsingToken[] {
    // コメント除去
    const actualTokens: ParsingToken[] = tokens.filter(t => t.kind !== TokenKind.Comment).map(token => {
        return {
            ...token,
            index: -1,
            next: undefined
        };
    });

    // 連続する文字列の結合
    for (let i = actualTokens.length - 1; i >= 1; i--) {
        const isContinuousString = actualTokens[i].kind === TokenKind.String && actualTokens[i - 1].kind === TokenKind.String;
        if (isContinuousString === false) continue;

        // 結合した要素を新規生成
        actualTokens[i - 1] = createConnectedStringTokenAt(actualTokens, i);
        actualTokens.splice(i, 1);
    }

    // 索引情報の付与
    for (let i = 0; i < actualTokens.length; i++) {
        actualTokens[i].index = i;
        actualTokens[i].next = i != actualTokens.length - 1 ? actualTokens[i + 1] : undefined;
    }
    return actualTokens;
}

function createConnectedStringTokenAt(actualTokens: ParsingToken[], index: number): ParsingToken {
    const token = createVirtualToken(TokenKind.String, actualTokens[index].text + actualTokens[index + 1].text);
    token.location.path = actualTokens[index].location.path;
    token.location.start = actualTokens[index].location.start;
    token.location.end = actualTokens[index + 1].location.end;

    return token;
}

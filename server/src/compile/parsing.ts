import {TokenizingToken, TokenKind} from "./token";
import {HighlightModifierKind, HighlightTokenKind} from "../code/highlight";

export interface ParsingToken extends TokenizingToken {
    index: number;
    next: ParsingToken | undefined;
}

export const dummyToken: ParsingToken = {
    kind: TokenKind.Reserved,
    text: '',
    location: {
        path: '',
        start: {line: 0, character: 0},
        end: {line: 0, character: 0},
    },
    highlight: {token: HighlightTokenKind.Variable, modifier: HighlightModifierKind.Invalid},
    index: 0,
    next: undefined,
} as const;

export function convertToParsingTokens(tokens: TokenizingToken[]): ParsingToken[] {
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
    return {
        kind: TokenKind.String,
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


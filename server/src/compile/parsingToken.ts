import {
    createEmptyLocation,
    createVirtualHighlight,
    HighlightInfo,
    NumberLiterals,
    TokenizingToken,
    TokenKind
} from "./tokens";
import {findAllReservedWordProperty} from "./tokenReserves";

export type ParsingToken = TokenizingToken & {
    highlight: HighlightInfo;
    index: number;
    next: ParsingToken | undefined;
}

export function isTokensLinkedBy(head: ParsingToken, targets: string[]): boolean {
    if (head.text !== targets[0]) return false;

    let cursor = head.next;
    let column = head.location.end.character;
    for (let i = 1; i < targets.length; i++) {
        if (cursor === undefined || cursor.text !== targets[i]) return false;
        if (cursor.location.start.line !== head.location.start.line) return false;
        if (cursor.location.start.character !== column) return false;
        column = cursor.location.end.character;
        cursor = cursor.next;
    }

    return true;
}

export function createVirtualToken(
    kind: TokenKind,
    text: string
): ParsingToken {
    const result = {
        text: text,
        location: createEmptyLocation(),
        highlight: createVirtualHighlight(),
        index: -1,
        next: undefined,
    };

    if (kind === TokenKind.Reserved) return {
        ...result,
        kind: TokenKind.Reserved,
        property: findAllReservedWordProperty(text)
    };
    else if (kind === TokenKind.Number) return {
        ...result,
        kind: TokenKind.Number,
        numeric: NumberLiterals.Integer
    };

    return {
        ...result,
        kind: kind
    };
}

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
    const token = createVirtualToken(TokenKind.String, actualTokens[index].text + actualTokens[index + 1].text);
    token.location.path = actualTokens[index].location.path;
    token.location.start = actualTokens[index].location.start;
    token.location.end = actualTokens[index + 1].location.end;

    return token;
}

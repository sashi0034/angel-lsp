import {isSameLine, TokenizingToken, TokenKind} from "./tokens";
import {URI} from "vscode-languageserver";
import {createVirtualToken, ParsingToken} from "./parsingToken";
import {diagnostic} from "../code/diagnostic";
import {HighlightToken} from "../code/highlight";

export interface PreprocessedTokenOutput {
    parsingTokens: ParsingToken[];
    includeFiles: URI[];
}

export function preprocessTokensForParser(tokens: TokenizingToken[]): PreprocessedTokenOutput {
    // コメント除去
    const actualTokens: ParsingToken[] = tokens.filter(t => t.kind !== TokenKind.Comment).map(token => {
        return {
            ...token,
            index: -1,
            next: undefined
        };
    });

    // ディレクティブの処理
    const includeFiles = preprocessDirectives(actualTokens);

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

    return {
        parsingTokens: actualTokens,
        includeFiles: includeFiles
    };
}

function preprocessDirectives(tokens: TokenizingToken[]): URI[] {
    const includeFiles: URI[] = [];
    const directiveRanges: [number, number][] = [];

    // '#' から始まるディレクティブを処理
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].text !== '#') continue;
        const directiveTokens = sliceTokenListBySameLine(tokens, i);

        handleDirectiveTokens(directiveTokens, includeFiles);
        directiveRanges.push([i, directiveTokens.length]);
    }

    // ディレクティブを削除
    for (let i = directiveRanges.length - 1; i >= 0; i--) {
        tokens.splice(directiveRanges[i][0], directiveRanges[i][1]);
    }

    return includeFiles;
}

function handleDirectiveTokens(directiveTokens: TokenizingToken[], includeFiles: URI[]) {
    directiveTokens[0].highlight.token = HighlightToken.Directive;

    if (directiveTokens[1]?.text === 'include') {
        directiveTokens[1].highlight.token = HighlightToken.Directive;

        // include ディレクティブの処理
        const fileName = directiveTokens[2];
        if (fileName === undefined) {
            diagnostic.addError(directiveTokens[1].location, 'Expected file name for include directive.');
            return;
        }

        if (fileName.kind !== TokenKind.String) {
            diagnostic.addError(directiveTokens[2].location, 'Expected string literal for include directive.');
            return;
        }

        includeFiles.push(fileName.text.substring(1, fileName.text.length - 1));
    } else {
        if (directiveTokens[1] != null) directiveTokens[1].highlight.token = HighlightToken.Label;
    }
}

function sliceTokenListBySameLine(tokens: TokenizingToken[], head: number): TokenizingToken[] {
    let tail = head;
    for (let i = head; i < tokens.length - 1; i++) {
        if (isSameLine(tokens[i].location.end, tokens[i + 1].location.start) === false) {
            break;
        }

        tail = i + 1;
    }

    return tokens.slice(head, tail + 1);
}

function createConnectedStringTokenAt(actualTokens: ParsingToken[], index: number): ParsingToken {
    const token = createVirtualToken(TokenKind.String, actualTokens[index].text + actualTokens[index + 1].text);
    token.location.path = actualTokens[index].location.path;
    token.location.start = actualTokens[index].location.start;
    token.location.end = actualTokens[index + 1].location.end;

    return token;
}

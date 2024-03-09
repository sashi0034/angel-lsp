import {TokenKind} from "./tokenizer";

export enum AnalyzedToken {
    Operator,
    Comment,
    Number,
    Variable,
}

export const analyzedTokens = [
    'operator',
    'comment',
    'number',
    'variable'
];

// TODO: AST木を使ったものに変える
export function tokenToSemantic(tokens: TokenKind): AnalyzedToken {
    switch (tokens) {
        case "number":
            return AnalyzedToken.Number;
        case "identifier":
            return AnalyzedToken.Variable;
        case "symbol":
            return AnalyzedToken.Operator;
        case "comment":
            return AnalyzedToken.Comment;
        default:
            return AnalyzedToken.Variable;
    }
}


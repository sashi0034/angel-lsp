import {TokenizedToken} from "../compiler_tokenizer/tokens";

/**
 * The list of tokens used by the parser has had certain tokens, such as comments, removed by the preprocessor.
 * Each token retains information about its position within the preprocessed token list and a reference to the next token.
 */
export type ParsedToken = TokenizedToken & {
    readonly index: number;
    readonly next: ParsedToken | undefined;
}

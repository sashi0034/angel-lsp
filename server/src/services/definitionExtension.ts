import {TokenObject, TokenString} from "../compiler_tokenizer/tokenObject";
import {TextPosition} from "../compiler_tokenizer/textLocation";
import {findTokenContainingPosition} from "./utils";
import {SymbolGlobalScope} from "../compiler_analyzer/symbolScope";
import {isFileUri, resolveIncludeUri} from "../service/fileUtils";
import * as lsp from "vscode-languageserver";

/**
 * Returns the definition of the tokens like string literals at the specified position.
 */
export function provideDefinitionFallback(
    rawTokens: TokenObject[],
    globalScope: SymbolGlobalScope,
    caret: TextPosition
): lsp.Definition | undefined {
    const uri = globalScope.getContext().filepath;

    const tokenOnCaret = findTokenContainingPosition(rawTokens, caret);
    if (tokenOnCaret?.token.isStringToken()) {
        const fileDefinition = provideFileDefinition(uri, tokenOnCaret.token);
        if (fileDefinition !== undefined) return fileDefinition;
    }

    return undefined;
}

// -----------------------------------------------

function provideFileDefinition(uri: string, token: TokenString): lsp.Definition | undefined {
    const definitionUri = resolveIncludeUri(uri, token.getStringContent());
    if (isFileUri(definitionUri) === false) return undefined;

    return {
        uri: definitionUri,
        range: {
            start: {line: 0, character: 0},
            end: {line: 0, character: 0}
        }
    };
}



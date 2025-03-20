import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {SymbolGlobalScope} from "../compiler_analyzer/symbolScope";
import {TextPosition, TextRange} from "../compiler_tokenizer/textLocation";
import {findTokenContainingPosition} from "./utils";
import * as lsp from "vscode-languageserver";

export function documentOnTypeFormattingProvider(
    rawTokens: TokenObject[],
    globalScope: SymbolGlobalScope,
    caret: TextPosition,
    char: string
) {
    if (char === '\b') {
        return executeSmartBackspace(rawTokens, caret);
    }

    // TODO
    // - When '}' is typed, automatically align it with the corresponding '{' and adjust indentation appropriately.
    // - When ';' is typed, immediately format spaces and tabs in that line to match the predefined formatting rules.
    // To achieve this, it will first be necessary to improve the formatter.
}

// -----------------------------------------------

function executeSmartBackspace(
    rawTokens: TokenObject[],
    caret: TextPosition,
): lsp.TextEdit[] {
    const caretLeft = caret.movedBy(0, -1);

    const token = findTokenContainingPosition(rawTokens, caretLeft);
    if (token !== undefined) return [];

    // No token found.
    // const canSmartBackspace =

    // TODO: Implement smart backspace check.
    // WIP

    return [lsp.TextEdit.del(new TextRange(new TextPosition(caret.line - 1, 1000000), caret))];
}

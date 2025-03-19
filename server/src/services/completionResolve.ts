import {SymbolGlobalScope, SymbolScope} from "../compiler_analyzer/symbolScope";
import {CompletionItem, CompletionItemKind} from "vscode-languageserver/node";
import {TextPosition} from "../compiler_tokenizer/textLocation";
import {findScopeContainingPosition} from "./utils";
import {stringifySymbolObject} from "../compiler_analyzer/symbolUtils";
import {InsertTextFormat} from "vscode-languageserver";
import {SymbolFunctionHolder} from "../compiler_analyzer/symbolObject";

/**
 * Completion Resolve is invoked when the user sees the completion item.
 */
export function provideCompletionResolve(
    globalScope: SymbolGlobalScope, caret: TextPosition, item: CompletionItem
): CompletionItem {
    const caretScope = findScopeContainingPosition(globalScope, caret, globalScope.getContext().filepath);

    if (item.kind === CompletionItemKind.Function) {
        return resolveFunctionItem(caretScope, item);
    }

    return item;
}

function resolveFunctionItem(caretScope: SymbolScope, item: CompletionItem) {
    const symbolName = item.label;

    const symbol = caretScope.lookupSymbolWithParent(symbolName);
    if (symbol === undefined || symbol.isFunctionHolder() === false) return item;

    const functionSymbol = symbol.first;

    item.detail = stringifySymbolObject(functionSymbol);

    item.insertText = item.label + (hasFunctionArguments(symbol) ? '($0)' : `()$0`);
    item.insertTextFormat = InsertTextFormat.Snippet;

    return item;
}

function hasFunctionArguments(functionHolder: SymbolFunctionHolder) {
    if (functionHolder.toList().length !== 1) return true;

    return functionHolder.first.parameterTypes.length > 0;
}
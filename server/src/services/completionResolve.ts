import {SymbolGlobalScope, SymbolScope} from "../compiler_analyzer/symbolScope";
import {CompletionItem, CompletionItemKind} from "vscode-languageserver/node";
import {stringifySymbolObject} from "../compiler_analyzer/symbolUtils";
import {InsertTextFormat} from "vscode-languageserver";
import {SymbolFunctionHolder} from "../compiler_analyzer/symbolObject";
import {CompletionItemWrapper} from "./completion";
import {logger} from "../core/logger";

/**
 * Completion Resolve is invoked when the user sees the completion item.
 */
export function provideCompletionResolve(
    globalScope: SymbolGlobalScope, item: CompletionItemWrapper
): CompletionItem {
    if (item.item.kind === CompletionItemKind.Function) {
        return resolveFunctionItem(globalScope, item);
    }

    return item.item;
}

function resolveFunctionItem(globalScope: SymbolGlobalScope, itemWrapper: CompletionItemWrapper) {
    const item = itemWrapper.item;
    const symbol = itemWrapper.symbol;
    if (symbol === undefined || symbol.isFunctionHolder() === false) {
        logger.error(`Received item is not a function: ${item.label}`);
        return item;
    }

    const functionSymbol = symbol.first;

    // Display the signature, e.g. "void fn(int a, int b)"
    item.detail = stringifySymbolObject(functionSymbol);

    // Set the snippet, e.g. "set_cu" |--> autocomplete |--> "set_cursor($C$)"
    item.insertText = item.label + (hasFunctionArguments(symbol) ? '($0)' : `()$0`);
    item.insertTextFormat = InsertTextFormat.Snippet;

    // Set VSCode-specific commands
    // https://code.visualstudio.com/docs/reference/default-keybindings#:~:text=Trigger%20Parameter%20Hints
    item.command = {command: 'editor.action.triggerParameterHints', title: 'Trigger Signature Help Provider'};
    // TODO: What should I do for other IDEs?

    return item;
}

function hasFunctionArguments(functionHolder: SymbolFunctionHolder) {
    if (functionHolder.toList().length !== 1) return true;

    return functionHolder.first.parameterTypes.length > 0;
}
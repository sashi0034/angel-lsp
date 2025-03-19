import {SymbolGlobalScope} from "../compiler_analyzer/symbolScope";
import {CompletionItem, CompletionItemKind} from "vscode-languageserver/node";
import {stringifyResolvedType, stringifySymbolObject} from "../compiler_analyzer/symbolUtils";
import {InsertTextFormat} from "vscode-languageserver";
import {SymbolFunctionHolder, SymbolType, SymbolVariable} from "../compiler_analyzer/symbolObject";
import {CompletionItemWrapper} from "./completion";
import {NodeName} from "../compiler_parser/nodes";
import * as path from 'path';

/**
 * Completion Resolve is invoked when the user sees the completion item.
 */
export function provideCompletionResolve(
    globalScope: SymbolGlobalScope, itemWrapper: CompletionItemWrapper
): CompletionItem {
    const item = itemWrapper.item;
    const symbol = itemWrapper.symbol;
    if (symbol?.isVariable()) {
        return resolveVariableItem(item, symbol);
    } else if (symbol?.isType()) {
        return resolveTypeItem(globalScope, item, symbol);
    } else if (symbol?.isFunctionHolder()) {
        return resolveFunctionItem(item, symbol);
    }

    if (item.kind === CompletionItemKind.Module) {
        return resolveNamespaceItem(item);
    }

    return item;
}

// -----------------------------------------------

function resolveVariableItem(item: CompletionItem, symbol: SymbolVariable) {
    item.detail = stringifyResolvedType(symbol.type) + ' ' + symbol.identifierText;

    return item;
}

// -----------------------------------------------

function resolveTypeItem(globalScope: SymbolGlobalScope, item: CompletionItem, symbol: SymbolType): CompletionItem {
    item.detail = getTypeNodeName(symbol);
    item.detail += ' ' + [...symbol.scopePath, symbol.identifierText].join('::');

    if (globalScope.getContext().filepath !== symbol.identifierToken.location.path) {
        // Insert the file name for types defined in outer files
        item.detail += ' ' + ` from ${path.basename(symbol.identifierToken.location.path)}`;
    }

    return item;
}

function getTypeNodeName(symbol: SymbolType) {
    const nodeName = symbol.linkedNode?.nodeName;
    if (nodeName === NodeName.Enum) return 'enum';
    if (nodeName === NodeName.Class) return 'class';
    if (nodeName === NodeName.Interface) return 'interface';
    return 'type';
}

// -----------------------------------------------

function resolveFunctionItem(item: CompletionItem, symbol: SymbolFunctionHolder) {
    const functionSymbol = symbol.first;

    // Display the signature, e.g. "void fn(int a, int b)"
    item.detail = stringifySymbolObject(functionSymbol);

    if (functionSymbol.linkedNode.nodeName === NodeName.FuncDef) {
        // We do not insert snippets for funcdef
        return item;
    }

    // Set the snippet, e.g. "set_cu" |--> autocomplete |--> "set_cursor($C$)"
    item.insertText = item.label + (hasFunctionArguments(symbol) ? '($0)' : `()$0`);
    item.insertTextFormat = InsertTextFormat.Snippet;

    // Set VSCode-specific commands
    // https://code.visualstudio.com/docs/reference/default-keybindings#:~:text=Trigger%20Parameter%20Hints
    item.command = {command: 'editor.action.triggerParameterHints', title: 'Trigger Signature Help Provider'};
    // TODO: What should I do for other IDEs?

    // FIXME: This doesn't work, why?
    // item.documentation = {
    //     kind: 'markdown',
    //     value: getDocumentCommentOfSymbol(functionSymbol)
    // };

    return item;
}

function hasFunctionArguments(functionHolder: SymbolFunctionHolder) {
    if (functionHolder.toList().length !== 1) return true;

    return functionHolder.first.parameterTypes.length > 0;
}

// -----------------------------------------------

function resolveNamespaceItem(item: CompletionItem) {
    item.detail = 'namespace';

    // Set the snippet, e.g. "Inter" |--> autocomplete |--> "Internal$C$"
    item.insertText = item.label + `::$0`;
    item.insertTextFormat = InsertTextFormat.Snippet;

    // Set VSCode-specific commands
    // https://code.visualstudio.com/docs/reference/default-keybindings
    item.command = {command: 'editor.action.triggerSuggest', title: 'Trigger Completion Provider'};
    // TODO: What should I do for other IDEs?

    return item;
}

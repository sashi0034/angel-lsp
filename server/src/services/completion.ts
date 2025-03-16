import {Position} from "vscode-languageserver";
import {
    isSymbolInstanceMember,
    SymbolObjectHolder
} from "../compiler_analyzer/symbolObject";
import {CompletionItem, CompletionItemKind} from "vscode-languageserver/node";
import {NodeName} from "../compiler_parser/nodes";
import {
    collectParentScopeList,
    isAnonymousIdentifier, SymbolScope
} from "../compiler_analyzer/symbolScope";
import {ComplementHint, ComplementKind} from "../compiler_analyzer/complementHint";
import {findScopeContainingPosition} from "./serviceHelper";
import {TextPosition} from "../compiler_tokenizer/textLocation";
import {canAccessInstanceMember} from "../compiler_analyzer/symbolUtils";

/**
 * Returns the completion candidates for the specified position.
 */
export function provideCompletions(
    globalScope: SymbolScope, caret: TextPosition
): CompletionItem[] {
    const items: CompletionItem[] = [];

    const uri = globalScope.getContext().filepath;
    const caretScope = findScopeContainingPosition(globalScope, caret, uri);

    // If there is a completion target within the scope that should be prioritized, return the completion candidates for it.
    // e.g. Methods of the instance object.
    const primeCompletion = checkMissingCompletionInScope(globalScope, caretScope, caret);
    if (primeCompletion !== undefined) return primeCompletion;

    // Return the completion candidates for the symbols in the scope itself and its parent scope.
    // e.g. Defined classes or functions in the scope.
    for (const scope of [...collectParentScopeList(caretScope), caretScope]) {
        items.push(...getCompletionSymbolsInScope(scope));
    }

    return items;
}

function getCompletionSymbolsInScope(scope: SymbolScope): CompletionItem[] {
    const items: CompletionItem[] = [];

    // Completion of symbols in the scope
    for (const [symbolName, symbol] of scope.symbolTable) {
        items.push({
            label: symbolName,
            kind: symbolToCompletionKind(symbol),
        });
    }

    // Completion of namespace
    for (const [childName, childScope] of scope.childScopeTable) {
        if (childScope.isNamespaceWithoutNode() === false) continue;
        if (isAnonymousIdentifier(childName)) continue;
        items.push({
            label: childName,
            kind: CompletionItemKind.Module,
        });
    }

    return items;
}

function getCompletionMembersInScope(globalScope: SymbolScope, caretScope: SymbolScope, symbolScope: SymbolScope): CompletionItem[] {
    const items: CompletionItem[] = [];

    // Completion of symbols in the scope
    for (const [symbolName, symbol] of symbolScope.symbolTable) {
        if (isSymbolInstanceMember(symbol) === false) continue;
        if (canAccessInstanceMember(caretScope, symbol) === false) continue;

        items.push({
            label: symbolName,
            kind: symbolToCompletionKind(symbol),
        });
    }

    return items;
}

function checkMissingCompletionInScope(globalScope: SymbolScope, caretScope: SymbolScope, caret: Position) {
    if (globalScope.completionHints.length === 0) return;

    for (const hint of globalScope.completionHints) {
        // Check if the completion target to be prioritized is at the cursor position in the scope.
        const location = hint.complementLocation;
        if (location.positionInRange(caret)) {
            // Return the completion target to be prioritized.
            const result = searchMissingCompletion(globalScope, caretScope, hint);
            if (result !== undefined && result.length > 0) return result;
        }
    }

    return undefined;
}

function searchMissingCompletion(globalScope: SymbolScope, caretScope: SymbolScope, completion: ComplementHint) {
    if (completion.complementKind === ComplementKind.InstanceMember) {
        // Find the scope to which the type to be completed belongs.
        if (completion.targetType.membersScope === undefined) return [];

        const typeScope = globalScope.getGlobalScope().resolveScope(completion.targetType.scopePath)?.lookupScope(
            completion.targetType.identifierToken.text);
        if (typeScope === undefined) return [];

        // Return the completion candidates in the scope.
        return getCompletionMembersInScope(globalScope, caretScope, typeScope);
    } else if (completion.complementKind === ComplementKind.NamespaceSymbol) {
        // Find the scope to which the namespace to be completed belongs.
        const namespaceList = completion.slicedNamespaceList;
        if (namespaceList.length === 0) return [];

        let namespaceScope = globalScope.lookupScopeWithParent(namespaceList[0].text);
        if (namespaceScope === undefined) return [];

        for (let i = 1; i < namespaceList.length; i++) {
            namespaceScope = namespaceScope.lookupScope(namespaceList[i].text);
            if (namespaceScope === undefined) return [];
        }

        // Return the completion candidates in the scope.
        return getCompletionSymbolsInScope(namespaceScope);
    }

    return undefined;
}

function symbolToCompletionKind(symbol: SymbolObjectHolder): CompletionItemKind {
    if (symbol.isType()) {
        if (symbol.isPrimitiveType() || symbol.linkedNode === undefined) return CompletionItemKind.Keyword;
        if (symbol.linkedNode.nodeName === NodeName.Enum) return CompletionItemKind.Enum;
        return CompletionItemKind.Class;
    } else if (symbol.isFunctionHolder()) {
        return CompletionItemKind.Function;
    } else { // SymbolVariable
        return CompletionItemKind.Variable;
    }
}

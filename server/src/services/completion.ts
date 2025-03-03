import {Position, URI} from "vscode-languageserver";
import {
    isSymbolInstanceMember,
    SymbolObject,
    SymbolType, SymbolFunction, SymbolVariable, SymbolObjectHolder
} from "../compiler_analyzer/symbolObject";
import {CompletionItem, CompletionItemKind} from "vscode-languageserver/node";
import {NodeName} from "../compiler_parser/nodes";
import {
    collectParentScopes,
    isAnonymousIdentifier, SymbolScope
} from "../compiler_analyzer/symbolScope";
import {isAllowedToAccessMember} from "../compiler_analyzer/checkType";
import {ComplementHints, ComplementKind} from "../compiler_analyzer/symbolComplement";
import {findScopeContainingPosition} from "./serviceHelper";

/**
 * Returns the completion candidates for the specified position.
 */
export function serveCompletions(
    diagnosedScope: SymbolScope, caret: Position, uri: URI
): CompletionItem[] {
    const items: CompletionItem[] = [];

    const targetScope = findScopeContainingPosition(diagnosedScope, caret, uri);

    // If there is a completion target within the scope that should be prioritized, return the completion candidates for it.
    // e.g. Methods of the instance object.
    const primeCompletion = checkMissingCompletionInScope(targetScope, caret);
    if (primeCompletion !== undefined) return primeCompletion;

    // Return the completion candidates for the symbols in the scope itself and its parent scope.
    // e.g. Defined classes or functions in the scope.
    for (const scope of [...collectParentScopes(targetScope), targetScope]) {
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
        if (childScope.linkedNode !== undefined) continue;
        if (isAnonymousIdentifier(childName)) continue;
        items.push({
            label: childName,
            kind: CompletionItemKind.Module,
        });
    }

    return items;
}

function getCompletionMembersInScope(checkingScope: SymbolScope, symbolScope: SymbolScope): CompletionItem[] {
    const items: CompletionItem[] = [];

    // Completion of symbols in the scope
    for (const [symbolName, symbol] of symbolScope.symbolTable) {
        if (isSymbolInstanceMember(symbol) === false) continue;
        if (isAllowedToAccessMember(checkingScope, symbol) === false) continue;

        items.push({
            label: symbolName,
            kind: symbolToCompletionKind(symbol),
        });
    }

    return items;
}

function checkMissingCompletionInScope(scope: SymbolScope, caret: Position) {
    if (scope.completionHints.length === 0) return;

    for (const hint of scope.completionHints) {
        // Check if the completion target to be prioritized is at the cursor position in the scope.
        const location = hint.complementLocation;
        if (location.positionInRange(caret)) {
            // Return the completion target to be prioritized.
            return searchMissingCompletion(scope, hint);
        }
    }

    return undefined;
}

function searchMissingCompletion(scope: SymbolScope, completion: ComplementHints) {
    if (completion.complementKind === ComplementKind.Type) {
        // Find the scope to which the type to be completed belongs.
        if (completion.targetType.membersScope === undefined) return [];

        const typeScope = scope.getGlobalScope().resolveScope(completion.targetType.defScope)?.lookupScope(
            completion.targetType.defToken.text);
        if (typeScope === undefined) return [];

        // Return the completion candidates in the scope.
        return getCompletionMembersInScope(scope, typeScope);
    } else if (completion.complementKind === ComplementKind.Namespace) {
        // Find the scope to which the namespace to be completed belongs.
        const namespaceList = completion.namespaceList;
        if (namespaceList.length === 0) return [];

        let namespaceScope = scope.lookupScopeWithParent(namespaceList[0].text);
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
    if (symbol instanceof SymbolType) {
        if (symbol.isSystemType() || symbol.defNode === undefined) return CompletionItemKind.Keyword;
        if (symbol.defNode.nodeName === NodeName.Enum) return CompletionItemKind.Enum;
        return CompletionItemKind.Class;
    } else if (symbol.isFunctionHolder()) {
        return CompletionItemKind.Function;
    } else { // SymbolVariable
        return CompletionItemKind.Variable;
    }
}

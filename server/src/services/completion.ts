import {Position, URI} from "vscode-languageserver";
import {
    isSymbolInstanceMember,
    SymbolObject,
    SymbolKind,
    SymbolScope
} from "../compile/symbols";
import {CompletionItem, CompletionItemKind} from "vscode-languageserver/node";
import {NodeName} from "../compile/nodes";
import {
    collectParentScopes,
    findScopeShallowly,
    findScopeWithParent,
    isAnonymousIdentifier
} from "../compile/symbolScopes";
import {isAllowedToAccessMember} from "../compile/checkType";
import {isPositionInRange} from "../compile/tokenUtils";
import {ComplementHints, ComplementKind} from "../compile/symbolComplement";

export function serveCompletions(
    diagnosedScope: SymbolScope, caret: Position, uri: URI
): CompletionItem[] {
    const items: CompletionItem[] = [];

    const targetScope = findIncludedScopes(diagnosedScope, caret, uri);

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
    for (const [symbolName, symbol] of scope.symbolMap) {
        items.push({
            label: symbolName,
            kind: symbolToCompletionKind(symbol),
        });
    }

    // Completion of namespace
    for (const [childName, childScope] of scope.childScopes) {
        if (childScope.ownerNode !== undefined) continue;
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
    for (const [symbolName, symbol] of symbolScope.symbolMap) {
        if (isSymbolInstanceMember(symbol) === false) continue;
        if (isAllowedToAccessMember(checkingScope, symbol) === false) continue;

        items.push({
            label: symbolName,
            kind: symbolToCompletionKind(symbol),
        });
    }

    return items;
}

function findIncludedScopes(scope: SymbolScope, caret: Position, path: string): SymbolScope {
    for (const hint of scope.completionHints) {
        if (hint.complementKind !== ComplementKind.Scope) continue;

        const location = hint.complementLocation;
        if (location.path !== path) continue;

        if (isPositionInRange(caret, location)) {
            const found = findIncludedScopes(hint.targetScope, caret, path);
            if (found !== undefined) return found;
        }
    }

    return scope;
}

function checkMissingCompletionInScope(scope: SymbolScope, caret: Position) {
    if (scope.completionHints.length === 0) return;

    for (const hint of scope.completionHints) {
        // Check if the completion target to be prioritized is at the cursor position in the scope.
        const location = hint.complementLocation;
        if (isPositionInRange(caret, location)) {
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

        const typeScope = findScopeShallowly(completion.targetType.declaredScope, completion.targetType.declaredPlace.text);
        if (typeScope === undefined) return [];

        // Return the completion candidates in the scope.
        return getCompletionMembersInScope(scope, typeScope);
    } else if (completion.complementKind === ComplementKind.Namespace) {
        // Find the scope to which the namespace to be completed belongs.
        const namespaceList = completion.namespaceList;
        if (namespaceList.length === 0) return [];

        let namespaceScope = findScopeWithParent(scope, namespaceList[0].text);
        if (namespaceScope === undefined) return [];

        for (let i = 1; i < namespaceList.length; i++) {
            namespaceScope = findScopeShallowly(namespaceScope, namespaceList[i].text);
            if (namespaceScope === undefined) return [];
        }

        // Return the completion candidates in the scope.
        return getCompletionSymbolsInScope(namespaceScope);
    }
    return undefined;
}

function symbolToCompletionKind(symbol: SymbolObject) {
    switch (symbol.symbolKind) {
    case SymbolKind.Type:
        if (typeof symbol.sourceType === 'string') return CompletionItemKind.Keyword;
        if (symbol.sourceType.nodeName === NodeName.Enum) return CompletionItemKind.Enum;
        return CompletionItemKind.Class;
    case SymbolKind.Function:
        return CompletionItemKind.Function;
    case SymbolKind.Variable:
        return CompletionItemKind.Variable;
    default:
        return CompletionItemKind.Text;
    }
}

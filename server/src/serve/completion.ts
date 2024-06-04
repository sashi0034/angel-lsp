import {Position, URI} from "vscode-languageserver";
import {
    ComplementHints,
    ComplementKind,
    isSymbolInstanceMember,
    SymbolicObject,
    SymbolKind,
    SymbolScope
} from "../compile/symbolic";
import {CompletionItem, CompletionItemKind} from "vscode-languageserver/node";
import {NodeName} from "../compile/nodes";
import {isPositionInRange} from "../compile/tokens";
import {
    collectParentScopes,
    findGlobalScope,
    findScopeShallowly,
    findScopeWithParent,
    isAnonymousIdentifier
} from "../compile/scope";

export function serveCompletions(
    diagnosedScope: SymbolScope, caret: Position, uri: URI
): CompletionItem[] {
    const items: CompletionItem[] = [];

    const targetScope = findIncludedScopes(diagnosedScope, caret, uri);

    // If there is a completion target within the scope that should be prioritized,return the completion candidates for it.
    // スコープ内に優先的に補完する対象があるなら、それについての補完候補を返す
    const primeCompletion = checkMissingCompletionInScope(targetScope, caret);
    if (primeCompletion !== undefined) return primeCompletion;

    // Return the completion candidates for the symbols in the scope itself and its parent scope.
    // 自身と親スコープにあるシンボルを補完候補として返す
    for (const scope of [...collectParentScopes(targetScope), targetScope]) {
        items.push(...getCompletionSymbolsInScope(scope, false));
    }

    return items;
}

function getCompletionSymbolsInScope(scope: SymbolScope, isMember: boolean): CompletionItem[] {
    const items: CompletionItem[] = [];

    // Completion of symbols in the scope | スコープ内シンボルの補完
    for (const [symbolName, symbol] of scope.symbolMap) {
        if (isMember && isSymbolInstanceMember(symbol) === false) continue;
        items.push({
            label: symbolName,
            kind: symbolToCompletionKind(symbol),
        });
    }

    // Completion of namespace | 名前空間の補完
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

    for (const missing of scope.completionHints) {
        // Check if the completion target to be prioritized is at the cursor position in the scope.
        // スコープ内で優先的に補完する対象がカーソル位置にあるかを調べる
        const location = missing.complementLocation;
        if (isPositionInRange(caret, location)) {
            // Return the completion target to be prioritized.
            // 優先的に補完する対象を返す
            return searchMissingCompletion(scope, missing);
        }
    }

    return undefined;
}

function searchMissingCompletion(scope: SymbolScope, completion: ComplementHints) {
    if (completion.complementKind === ComplementKind.Type) {
        // Find the scope to which the type to be completed belongs. | 補完対象の型が属するスコープを探す
        const typeScope = findScopeWithParent(scope, completion.targetType.declaredPlace.text);
        if (typeScope === undefined) return [];

        // Return the completion candidates in the scope. | スコープ内の補完候補を返す
        return getCompletionSymbolsInScope(typeScope, true);
    } else if (completion.complementKind === ComplementKind.Namespace) {
        // Find the scope to which the namespace to be completed belongs. | 補完対象の名前空間が属するスコープを探す
        const namespaceList = completion.namespaceList;
        if (namespaceList.length === 0) return [];

        const namespaceScope = findScopeShallowly(findGlobalScope(scope), namespaceList[0].text);
        if (namespaceScope === undefined) return [];

        // Return the completion candidates in the scope. | スコープ内の補完候補を返す
        return getCompletionSymbolsInScope(namespaceScope, false);
    }
    return undefined;
}

function symbolToCompletionKind(symbol: SymbolicObject) {
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

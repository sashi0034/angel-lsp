import {Position} from "vscode-languageserver";
import {
    collectParentScopes,
    ComplementHints,
    findScopeWithParent,
    findGlobalScope,
    SymbolicObject,
    SymbolKind,
    SymbolScope, findScopeShallowly
} from "../compile/symbolic";
import {CompletionItem, CompletionItemKind} from "vscode-languageserver/node";
import {getNodeLocation, NodeName} from "../compile/nodes";
import {isPositionInRange} from "../compile/token";

export function searchCompletionItems(diagnosedScope: SymbolScope, caret: Position): CompletionItem[] {
    const items: CompletionItem[] = [];

    const targetScope = findIncludedScopes(diagnosedScope, caret);

    // スコープ内に優先的に補完する対象があるなら、それについての補完候補を返す
    const primeCompletion = checkMissingCompletionInScope(targetScope, caret);
    if (primeCompletion !== undefined) return primeCompletion;

    // 自身と親スコープにあるシンボルを補完候補として返す
    for (const scope of [...collectParentScopes(targetScope), targetScope]) {
        items.push(...getCompletionSymbolsInScope(scope));
    }

    return items;
}

function getCompletionSymbolsInScope(scope: SymbolScope) {
    const items: CompletionItem[] = [];
    for (const [symbolName, symbol] of scope.symbolMap) {
        items.push({
            label: symbolName,
            kind: symbolToCompletionKind(symbol),
        });
    }
    return items;
}

function findIncludedScopes(scope: SymbolScope, caret: Position): SymbolScope {
    for (const [childName, childScope] of scope.childScopes) {
        if (childScope.ownerNode === undefined) continue;

        const location = getNodeLocation(childScope.ownerNode.scopeRange);
        if (isPositionInRange(caret, location)) {
            const found = findIncludedScopes(childScope, caret);
            if (found !== undefined) return found;
        }
    }

    return scope;
}

function checkMissingCompletionInScope(scope: SymbolScope, caret: Position) {
    if (scope.completionHints.length === 0) return;

    for (const missing of scope.completionHints) {
        // スコープ内で優先的に補完する対象がカーソル位置にあるかを調べる
        const location = missing.complementRange;
        if (isPositionInRange(caret, location)) {
            // 優先的に補完する対象を返す
            return searchMissingCompletion(scope, missing);
        }
    }

    return undefined;
}

function searchMissingCompletion(scope: SymbolScope, completion: ComplementHints) {
    if (completion.complementKind === NodeName.Type) {
        // 補完対象の型が属するスコープを探す
        const typeScope = findScopeWithParent(scope, completion.targetType.declaredPlace.text);
        if (typeScope === undefined) return [];

        // スコープ内の補完候補を返す
        return getCompletionSymbolsInScope(typeScope);
    } else if (completion.complementKind === NodeName.Namespace) {
        // 補完対象の名前空間が属するスコープを探す
        const namespaceList = completion.namespaceList;
        if (namespaceList.length === 0) return [];

        const namespaceScope = findScopeShallowly(findGlobalScope(scope), namespaceList[0].text);
        if (namespaceScope === undefined) return [];

        // スコープ内の補完候補を返す
        return getCompletionSymbolsInScope(namespaceScope);
    }
    return undefined;
}

function symbolToCompletionKind(symbol: SymbolicObject) {
    switch (symbol.symbolKind) {
    case SymbolKind.Type:
        if (typeof symbol.sourceNode === 'string') return CompletionItemKind.Keyword;
        if (symbol.sourceNode.nodeName === NodeName.Enum) return CompletionItemKind.Enum;
        return CompletionItemKind.Class;
    case SymbolKind.Function:
        return CompletionItemKind.Function;
    case SymbolKind.Variable:
        return CompletionItemKind.Variable;
    default:
        return CompletionItemKind.Text;
    }
}

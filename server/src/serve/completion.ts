import {Position} from "vscode-languageserver";
import {
    collectParentScopes,
    ComplementHints,
    findClassScopeWithParent,
    SymbolicObject,
    SymbolScope
} from "../compile/symbolics";
import {CompletionItem, CompletionItemKind} from "vscode-languageserver/node";
import {getNodeLocation} from "../compile/nodes";
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
    for (const symbol of scope.symbolList) {
        const declareToken = symbol.declaredPlace;
        items.push({
            label: declareToken.text,
            kind: symbolToCompletionKind(symbol),
        });
    }
    return items;
}

function findIncludedScopes(scope: SymbolScope, caret: Position): SymbolScope {
    for (const child of scope.childScopes) {
        if (child.ownerNode === undefined || 'scopeRange' in child.ownerNode === false) continue;

        const location = getNodeLocation(child.ownerNode.scopeRange);
        if (isPositionInRange(caret, location)) {
            const found = findIncludedScopes(child, caret);
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
            console.log(location);
            console.log(caret);
            return searchMissingCompletion(scope, missing);
        }
    }

    return undefined;
}

function searchMissingCompletion(scope: SymbolScope, completion: ComplementHints) {
    if (completion.complementKind === 'Type') {
        // 補完対象の型が属するスコープを探す
        const typeScope = findClassScopeWithParent(scope, completion.targetType.declaredPlace.text);
        if (typeScope === undefined) return [];

        // スコープ内の補完候補を返す
        return getCompletionSymbolsInScope(typeScope);
    }
    return undefined;
}

function symbolToCompletionKind(symbol: SymbolicObject) {
    switch (symbol.symbolKind) {
    case 'type':
        if (typeof symbol.sourceNode === 'string') return CompletionItemKind.Keyword;
        if (symbol.sourceNode.nodeName === 'ENUM') return CompletionItemKind.Enum;
        return CompletionItemKind.Class;
    case 'function':
        return CompletionItemKind.Function;
    case 'variable':
        return CompletionItemKind.Variable;
    default:
        return CompletionItemKind.Text;
    }
}

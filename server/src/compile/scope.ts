import {SymbolOwnerNode, SymbolScope} from "./symbolic";
import {diagnostic} from "../code/diagnostic";

export function collectParentScopes(scope: SymbolScope): SymbolScope[] {
    const result: SymbolScope[] = [];
    let current = scope;
    while (current.parentScope !== undefined) {
        result.push(current.parentScope);
        current = current.parentScope;
    }
    return result;
}

export function findScopeWithParent(scope: SymbolScope, identifier: string): SymbolScope | undefined {
    const child = scope.childScopes.get(identifier);
    if (child !== undefined) return child;
    if (scope.parentScope === undefined) return undefined;
    return findScopeWithParent(scope.parentScope, identifier);
}

export function findScopeShallowly(scope: SymbolScope, identifier: string): SymbolScope | undefined {
    return scope.childScopes.get(identifier);
}

export function createSymbolScope(ownerNode: SymbolOwnerNode | undefined, parentScope: SymbolScope | undefined): SymbolScope {
    return {
        ownerNode: ownerNode,
        parentScope: parentScope,
        childScopes: new Map(),
        symbolMap: new Map(),
        referencedList: [],
        completionHints: [],
    };
}

export function createSymbolScopeAndInsert(
    ownerNode: SymbolOwnerNode | undefined,
    parentScope: SymbolScope | undefined,
    identifier: string,
): SymbolScope {
    const scope = createSymbolScope(ownerNode, parentScope);
    parentScope?.childScopes.set(identifier, scope);
    return scope;
}

export class AnalyzedScope {
    public readonly path: string;
    public readonly fullScope: SymbolScope; // 他モジュールのシンボルも含む

    private pureBuffer: SymbolScope | undefined; // 自身のモジュールのみ含む

    public constructor(path: string, full: SymbolScope) {
        this.path = path;
        this.fullScope = full;
    }

    public get pureScope(): SymbolScope {
        if (this.pureBuffer === undefined) {
            this.pureBuffer = createSymbolScope(this.fullScope.ownerNode, this.fullScope.parentScope);
            copyOriginalSymbolsInScope(this.path, this.fullScope, this.pureBuffer);
        }
        return this.pureBuffer;
    }
}

function copyOriginalSymbolsInScope(srcPath: string | undefined, srcScope: SymbolScope, destScope: SymbolScope) {
    if (srcPath === undefined) {
        // 対象元から対象先のスコープへ全シンボルをコピー
        for (const [key, symbol] of srcScope.symbolMap) {
            destScope.symbolMap.set(key, symbol);
        }
    } else {
        // 宣言ファイルが同じシンボルを収集
        for (const [key, symbol] of srcScope.symbolMap) {
            if (symbol.declaredPlace.location.path === srcPath) {
                destScope.symbolMap.set(key, symbol);
            }
        }
    }

    // 子スコープも再帰的にコピー
    for (const [key, child] of srcScope.childScopes) {
        const destChild = findScopeShallowlyOrInsert(child.ownerNode, destScope, key);
        copyOriginalSymbolsInScope(srcPath, child, destChild);
    }
}

export function copySymbolsInScope(srcScope: SymbolScope, destScope: SymbolScope) {
    // 対象元から対象先のスコープへ全シンボルをコピー
    copyOriginalSymbolsInScope(undefined, srcScope, destScope);
}

export function findScopeShallowlyOrInsert(
    ownerNode: SymbolOwnerNode | undefined,
    scope: SymbolScope,
    identifier: string
): SymbolScope {
    const found = scope.childScopes.get(identifier);
    if (found === undefined) return createSymbolScopeAndInsert(ownerNode, scope, identifier);
    if (ownerNode === undefined) return found;
    if (found.ownerNode === undefined) found.ownerNode = ownerNode;
    else if (found.ownerNode !== ownerNode) {
        diagnostic.addError(ownerNode.identifier.location, `Symbol ${identifier}' is already defined ❌`);
    }
    return found;
}

export function findGlobalScope(scope: SymbolScope): SymbolScope {
    if (scope.parentScope === undefined) return scope;
    return findGlobalScope(scope.parentScope);
}
import {getPathOfScope, SymbolicObject, SymbolKind, SymbolOwnerNode, SymbolScope} from "./symbolic";
import {diagnostic} from "../code/diagnostic";
import {NodeName} from "./nodes";
import {ParsedToken} from "./parsedToken";

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

export function findScopeWithParentByNodes(scope: SymbolScope, nodeCandidates: NodeName[]): SymbolScope | undefined {
    if (scope.ownerNode !== undefined && nodeCandidates.includes(scope.ownerNode.nodeName)) return scope;
    if (scope.parentScope === undefined) return undefined;
    return findScopeWithParentByNodes(scope.parentScope, nodeCandidates);
}

export function findScopeShallowly(scope: SymbolScope, identifier: string): SymbolScope | undefined {
    return scope.childScopes.get(identifier);
}

export function createSymbolScope(
    ownerNode: SymbolOwnerNode | undefined, parentScope: SymbolScope | undefined, key: string
): SymbolScope {
    return {
        ownerNode: ownerNode,
        parentScope: parentScope,
        key: key,
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
    const scope = createSymbolScope(ownerNode, parentScope, identifier);
    parentScope?.childScopes.set(identifier, scope);
    return scope;
}

export class AnalyzedScope {
    public readonly path: string;
    public readonly fullScope: SymbolScope; // Include symbols from other modules as well. | 他モジュールのシンボルも含む

    private pureBuffer: SymbolScope | undefined; // Contains only its own module. | 自身のモジュールのみ含む

    public constructor(path: string, full: SymbolScope) {
        this.path = path;
        this.fullScope = full;
    }

    public get pureScope(): SymbolScope {
        if (this.pureBuffer === undefined) {
            this.pureBuffer = createSymbolScope(this.fullScope.ownerNode, this.fullScope.parentScope, this.fullScope.key);
            copySymbolsInScope(this.fullScope, this.pureBuffer, {targetSrcPath: this.path});
        }
        return this.pureBuffer;
    }
}

export interface CopySymbolOptions {
    /** The path of the source to be copied. If undefined, all symbols are copied. */
    targetSrcPath?: string;
    /** The path of the source to be excluded from copying. If undefined, all symbols are copied. */
    excludeSrcPath?: string;
}

/**
 * Copy all symbols from the source to the destination scope.
 * The symbols to be copied are added to destScope.symbolMap.
 */
export function copySymbolsInScope(srcScope: SymbolScope, destScope: SymbolScope, option: CopySymbolOptions) {
    // Collect symbols from the source scope
    for (const [key, symbol] of srcScope.symbolMap) {
        let canCopy = true;

        if (option.targetSrcPath !== undefined && symbol.declaredPlace.location.path !== option.targetSrcPath) {
            canCopy = false;
        }

        if (option.excludeSrcPath !== undefined && symbol.declaredPlace.location.path === option.excludeSrcPath) {
            canCopy = false;
        }

        if (canCopy) {
            destScope.symbolMap.set(key, symbol);
        }
    }

    // Copy child scopes recursively.
    for (const [key, child] of srcScope.childScopes) {
        const scopePath = getPathOfScope(child);
        if (scopePath !== undefined) {
            // If the path is specified, only the specified path is copied.

            if (option.targetSrcPath !== undefined && scopePath !== option.targetSrcPath) {
                continue;
            }

            if (option.excludeSrcPath !== undefined && scopePath === option.excludeSrcPath) {
                continue;
            }
        }

        const destChild = findScopeShallowlyOrInsertByIdentifier(child.ownerNode, destScope, key);
        copySymbolsInScope(child, destChild, option);
    }
}

export function findScopeShallowlyOrInsert(
    ownerNode: SymbolOwnerNode | undefined,
    scope: SymbolScope,
    identifierToken: ParsedToken
): SymbolScope {
    const found = findScopeShallowlyOrInsertByIdentifier(ownerNode, scope, identifierToken.text);
    if (ownerNode !== undefined && ownerNode !== found.ownerNode) {
        // When searching for a node that is not in the namespace, an error occurs if it is different from the search node.
        // 名前空間でないノードを検索しているとき、それが検索ノードと異なっているときはエラー
        diagnostic.addError(identifierToken.location, `Symbol ${identifierToken.text}' is already defined 💢`);
    }
    return found;
}

function findScopeShallowlyOrInsertByIdentifier(
    ownerNode: SymbolOwnerNode | undefined,
    scope: SymbolScope,
    identifier: string
): SymbolScope {
    const found = scope.childScopes.get(identifier);
    if (found === undefined) return createSymbolScopeAndInsert(ownerNode, scope, identifier);
    if (ownerNode === undefined) return found;
    if (found.ownerNode === undefined) found.ownerNode = ownerNode;
    return found;
}

export function findGlobalScope(scope: SymbolScope): SymbolScope {
    if (scope.parentScope === undefined) return scope;
    return findGlobalScope(scope.parentScope);
}

export function isSymbolConstructorInScope(symbol: SymbolicObject, scope: SymbolScope): boolean {
    return symbol !== undefined
        && symbol.symbolKind === SymbolKind.Function
        && scope.ownerNode !== undefined
        && scope.ownerNode.nodeName === NodeName.Class
        && scope.ownerNode.identifier.text === symbol.declaredPlace.text;
}

export function isScopeChildOrGrandchild(childScope: SymbolScope, parentScope: SymbolScope): boolean {
    if (parentScope === childScope) return true;
    if (childScope.parentScope === undefined) return false;
    return isScopeChildOrGrandchild(childScope.parentScope, parentScope);
}

let s_uniqueIdentifier = -1;

export function createAnonymousIdentifier(): string {
    s_uniqueIdentifier++;
    return `~${s_uniqueIdentifier}`;
}

export function isAnonymousIdentifier(identifier: string): boolean {
    return identifier.startsWith('~');
}
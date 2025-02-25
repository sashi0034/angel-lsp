import {ReferencedSymbolInfo, SymbolFunction, SymbolObject, SymbolType, TypeSourceNode} from "./symbolObject";
import {diagnostic} from "../code/diagnostic";
import {
    NodeClass, NodeDoWhile,
    NodeEnum, NodeFor,
    NodeFunc,
    NodeIf,
    NodeInterface,
    NodeLambda,
    NodeName, NodeStatBlock, NodeTry,
    NodeVirtualProp, NodeWhile
} from "../compiler_parser/nodes";
import {getPathOfScope} from "./symbolUtils";
import {ComplementHints} from "./symbolComplement";
import {getGlobalSettings} from "../code/settings";
import assert = require("node:assert");
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {TokenObject} from "../compiler_tokenizer/tokenObject";

export type ScopeMap = Map<string, SymbolScope>;

export type SymbolMap = Map<string, SymbolObject>;

interface RootScopeContext {
    builtinStringType: SymbolType | undefined;
}

/**
 * Nodes that can have a scope containing symbols.
 */
export type ScopeLinkedNode =
    NodeEnum
    | NodeClass
    | NodeVirtualProp
    | NodeInterface
    | NodeFunc
    | NodeLambda

    // Statement nodes
    | NodeStatBlock
    | NodeFor
    | NodeWhile
    | NodeDoWhile
    | NodeIf
    | NodeTry;

/**
 * Represents a scope that contains symbols.
 */
export class SymbolScope {
    // A node associated with this scope
    private _linkedNode: ScopeLinkedNode | undefined;
    // The parent scope of this scope. If this is the root scope (global scope), it has the context for the file.
    private readonly parentOrContext: SymbolScope | RootScopeContext;

    public constructor(
        linkedNode: ScopeLinkedNode | undefined,
        parentScope: SymbolScope | undefined,
        public readonly key: string,
        public readonly childScopes: ScopeMap,
        public readonly symbolMap: SymbolMap,
        public readonly referencedList: ReferencedSymbolInfo[],
        public readonly completionHints: ComplementHints[],
    ) {
        this.parentOrContext = parentScope ?? {builtinStringType: undefined};
        this._linkedNode = linkedNode;
    }

    public static create(args: {
        linkedNode: ScopeLinkedNode | undefined
        parentScope: SymbolScope | undefined
        key: string
    }) {
        return new SymbolScope(
            args.linkedNode,
            args.parentScope,
            args.key,
            new Map(),
            new Map(),
            [],
            []);
    }

    public get parentScope(): SymbolScope | undefined {
        if (this.parentOrContext instanceof SymbolScope) return this.parentOrContext;
        return undefined;
    }

    public setLinkedNode(node: ScopeLinkedNode | undefined) {
        assert(this._linkedNode === undefined);
        this._linkedNode = node;
    }

    public get linkedNode(): ScopeLinkedNode | undefined {
        return this._linkedNode;
    }

    /**
     * Cache information in the context of the file
     */
    public commitContext() {
        assert(this.parentOrContext instanceof SymbolScope === false);
        this.parentOrContext.builtinStringType = findBuiltinStringType(this);
    }

    public getBuiltinStringType(): SymbolType | undefined {
        if (this.parentOrContext instanceof SymbolScope) return this.parentOrContext.getBuiltinStringType();
        return this.parentOrContext.builtinStringType;
    }
}

function findBuiltinStringType(scope: SymbolScope): SymbolType | undefined {
    for (const [key, symbol] of scope.symbolMap) {
        if (symbol instanceof SymbolType && isSourceBuiltinString(symbol.sourceNode)) return symbol;
    }

    for (const [key, child] of scope.childScopes) {
        const found = findBuiltinStringType(child);
        if (found !== undefined) return found;
    }

    return undefined;
}

// Judge if the class has a metadata that indicates it is a built-in string type.
function isSourceBuiltinString(source: TypeSourceNode | undefined): boolean {
    if (source === undefined) return false;
    if (source.nodeName != NodeName.Class) return false;

    // Check if the class has a metadata that indicates it is a built-in string type.
    const builtinStringMetadata = "BuiltinString";
    if (source.metadata.length === 1 && source.metadata[0].text === builtinStringMetadata) return true;

    // Check whether the class name is a built-in string type with global settings.
    return getGlobalSettings().builtinStringTypes.includes(source.identifier.text);
}

export interface SymbolAndScope {
    readonly symbol: SymbolObject;
    readonly scope: SymbolScope;
}

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
    if (scope.linkedNode !== undefined && nodeCandidates.includes(scope.linkedNode.nodeName)) return scope;
    if (scope.parentScope === undefined) return undefined;
    return findScopeWithParentByNodes(scope.parentScope, nodeCandidates);
}

export function findScopeShallowly(scope: SymbolScope, identifier: string): SymbolScope | undefined {
    return scope.childScopes.get(identifier);
}

export function createSymbolScope(
    linkedNode: ScopeLinkedNode | undefined, parentScope: SymbolScope | undefined, key: string
): SymbolScope {
    return SymbolScope.create({
        linkedNode: linkedNode,
        parentScope: parentScope,
        key: key,
    });
}

export function createSymbolScopeAndInsert(
    linkedNode: ScopeLinkedNode | undefined,
    parentScope: SymbolScope | undefined,
    identifier: string,
): SymbolScope {
    const scope = createSymbolScope(linkedNode, parentScope, identifier);
    parentScope?.childScopes.set(identifier, scope);
    return scope;
}

/**
 * Represents the result of analyzing a file, such as scope information.
 */
export class AnalyzedScope {
    /**
     * The path of the file being analyzed.
     */
    public readonly path: string;
    /**
     * The scope that contains all symbols in the file.
     * It includes symbols from other modules as well.
     */
    public readonly fullScope: SymbolScope;

    private pureBuffer: SymbolScope | undefined;

    /**
     * The scope that contains only symbols in the file.
     */
    public get pureScope(): SymbolScope {
        if (this.pureBuffer === undefined) {
            this.pureBuffer = createSymbolScope(
                this.fullScope.linkedNode,
                this.fullScope.parentScope,
                this.fullScope.key);
            copySymbolsInScope(this.fullScope, this.pureBuffer, {targetSrcPath: this.path});
        }
        return this.pureBuffer;
    }

    public constructor(path: string, full: SymbolScope) {
        this.path = path;
        this.fullScope = full;
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

        const destChild = findScopeShallowlyThenInsertByIdentifier(child.linkedNode, destScope, key);
        copySymbolsInScope(child, destChild, option);
    }
}

/**
 * Searches for a scope within the given scope that has an identifier matching the provided token.
 * This search is non-recursive. If no matching scope is found, a new one is created and inserted.
 * @param linkedNode The node associated with the scope.
 * @param scope The scope to search within for a matching child scope.
 * @param identifierToken The token of the identifier to search for.
 * @returns The found or newly created scope.
 */
export function findScopeShallowlyOrInsert(
    linkedNode: ScopeLinkedNode | undefined,
    scope: SymbolScope,
    identifierToken: TokenObject
): SymbolScope {
    const found = findScopeShallowlyThenInsertByIdentifier(linkedNode, scope, identifierToken.text);
    if (linkedNode !== undefined && linkedNode !== found.linkedNode) {
        // If searching for a non-namespace node, throw an error if it doesn't match the found node.
        // For example, if a scope for a class 'f' already exists, a scope for a function 'f' cannot be created.
        analyzerDiagnostic.add(identifierToken.location, `Symbol ${identifierToken.text}' is already defined.`);
    }
    return found;
}

function findScopeShallowlyThenInsertByIdentifier(
    linkedNode: ScopeLinkedNode | undefined,
    scope: SymbolScope,
    identifier: string
): SymbolScope {
    const found: SymbolScope | undefined = scope.childScopes.get(identifier);
    if (found === undefined) return createSymbolScopeAndInsert(linkedNode, scope, identifier);
    if (linkedNode === undefined) return found;
    if (found.linkedNode === undefined) found.setLinkedNode(linkedNode);
    return found;
}

/**
 * Traverses up the parent scopes to find the global scope.
 * @param scope The scope to start from.
 * @returns The global scope.
 */
export function findGlobalScope(scope: SymbolScope): SymbolScope {
    if (scope.parentScope === undefined) return scope;
    return findGlobalScope(scope.parentScope);
}

/**
 * Determines whether the given symbol in the scope is a constructor.
 * @param pair A pair consisting of a symbol and the scope that contains it.
 */
export function isSymbolConstructorInScope(pair: SymbolAndScope): boolean {
    const symbol = pair.symbol;
    const scope = pair.scope;
    return symbol !== undefined
        && symbol instanceof SymbolFunction
        && scope.linkedNode !== undefined
        && scope.linkedNode.nodeName === NodeName.Class
        && scope.linkedNode.identifier.text === symbol.declaredPlace.text;
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
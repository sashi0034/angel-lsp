import {
    ReferencedSymbolInfo, ScopePath,
    SymbolFunction, SymbolFunctionHolder,
    SymbolObject,
    SymbolObjectHolder,
    SymbolType,
    TypeDefinitionNode
} from "./symbolObject";
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

export type ScopeTable = Map<string, SymbolScope>;

type ReadonlyScopeTable = ReadonlyMap<string, SymbolScope>;

export type SymbolTable = Map<string, SymbolObjectHolder>;

export type ReadonlySymbolTable = ReadonlyMap<string, SymbolObjectHolder>;

interface GlobalScopeContext {
    filepath: string;
    builtinStringType: SymbolType | undefined;
    externalScopeList: SymbolScope[]; // The scopes created in external files that are referenced by this file
}

function createGlobalScopeContext(): GlobalScopeContext {
    return {
        filepath: '',
        builtinStringType: undefined,
        externalScopeList: [],
    };
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
    // The parent scope of this scope. If this is the global scope, it has the context for the file
    private readonly _parentOrContext: SymbolScope | GlobalScopeContext;

    // The child scopes of this scope
    private readonly _childScopeTable: ScopeTable = new Map();

    // The symbol table that contains the symbols declared in this scope
    private readonly _symbolTable: SymbolTable = new Map();

    public readonly referencedList: ReferencedSymbolInfo[] = [];

    public readonly completionHints: ComplementHints[] = [];

    /**
     * The path of the scope. It is a list of identifiers from the global scope to this scope.
     */
    public readonly scopePath: ScopePath;

    public constructor(
        // The parent scope of this scope.
        parentScope: SymbolScope | undefined,
        // The key of this scope. It is the identifier of the class, function, or block.
        public readonly key: string,
        // A node associated with this scope
        private _linkedNode: ScopeLinkedNode | undefined,
    ) {
        this._parentOrContext = parentScope ?? createGlobalScopeContext();

        this.scopePath = parentScope === undefined ? [] : [...parentScope.scopePath, key];
    }

    public static create(args: {
        parentScope: SymbolScope | undefined
        key: string
        linkedNode: ScopeLinkedNode | undefined
    }) {
        return new SymbolScope(args.parentScope, args.key, args.linkedNode);
    }

    public get parentScope(): SymbolScope | undefined {
        if (this._parentOrContext instanceof SymbolScope) return this._parentOrContext;
        return undefined;
    }

    public get symbolTable(): ReadonlySymbolTable {
        return this._symbolTable;
    }

    public get childScopeTable(): ReadonlyScopeTable {
        return this._childScopeTable;
    }

    public setLinkedNode(node: ScopeLinkedNode | undefined) {
        assert(this._linkedNode === undefined);
        this._linkedNode = node;
    }

    public get linkedNode(): ScopeLinkedNode | undefined {
        return this._linkedNode;
    }

    public initializeContext(filepath: string) {
        assert(this._parentOrContext instanceof SymbolScope === false);
        this._parentOrContext.filepath = filepath;
        setActiveGlobalScope(this);
    }

    /**
     * Cache information in the context of the file
     */
    public commitContext() {
        assert(this._parentOrContext instanceof SymbolScope === false);
        this._parentOrContext.builtinStringType = findBuiltinStringType(this);
    }

    public getBuiltinStringType(): SymbolType | undefined {
        if (this._parentOrContext instanceof SymbolScope) return this._parentOrContext.getBuiltinStringType();
        return this._parentOrContext.builtinStringType;
    }

    /**
     * Find the parent scope (including itself) that satisfies the condition.
     */
    public takeParentBy(filter: (scope: SymbolScope) => boolean): SymbolScope | undefined {
        if (filter(this)) return this;
        if (this.parentScope === undefined) return undefined;
        return this.parentScope.takeParentBy(filter);
    }

    public takeParentByNode(nodeCandidates: NodeName[]): SymbolScope | undefined {
        return this.takeParentBy(scope => scope.linkedNode !== undefined && nodeCandidates.includes(scope.linkedNode.nodeName));
    }

    public getGlobalScope(): SymbolScope {
        if (this.parentScope === undefined) return this;
        return this.parentScope.getGlobalScope();
    }

    /**
     * Create a new scope and insert it into the child scope table.
     */
    public insertScope(identifier: string, linkedNode: ScopeLinkedNode | undefined): SymbolScope {
        // assert(linkedNode === undefined || linkedNode.nodeRange.path === s_activeScopeContext?.path);

        const alreadyExists = this._childScopeTable.get(identifier);
        if (alreadyExists !== undefined) {
            if (alreadyExists.linkedNode === undefined) alreadyExists.setLinkedNode(linkedNode);
            return alreadyExists;
        }

        const newScope = SymbolScope.create({parentScope: this, key: identifier, linkedNode: linkedNode});
        this._childScopeTable.set(identifier, newScope);
        return newScope;
    }

    public insertScopeAndCheck(identifier: TokenObject, linkedNode: ScopeLinkedNode | undefined): SymbolScope {
        const scope = this.insertScope(identifier.text, linkedNode);
        if (linkedNode !== undefined && linkedNode !== scope.linkedNode) {
            // e.g., if a scope for a class 'F' already exists, a scope for a function 'F' cannot be created.
            errorAlreadyDeclared(identifier);
        }

        return scope;
    }

    public lookupScopeWithParent(identifier: string): SymbolScope | undefined {
        const child = this._childScopeTable.get(identifier);
        if (child !== undefined) return child;
        return this.parentScope === undefined ? undefined : this.parentScope.lookupScopeWithParent(identifier);
    }

    public lookupScope(identifier: string): SymbolScope | undefined {
        return this._childScopeTable.get(identifier);
    }

    public resolveScope(path: ScopePath): SymbolScope | undefined {
        if (path.length === 0) return this;
        const child = this._childScopeTable.get(path[0]);
        if (child === undefined) return undefined;
        return child.resolveScope(path.slice(1));
    }

    /**
     * Insert a symbol into the symbol table.
     * @param symbol
     * @return undefined if the symbol is successfully inserted, or the symbol that already exists.
     */
    public insertSymbol(symbol: SymbolObject): SymbolObjectHolder | undefined {
        const identifier = symbol.defToken.text;
        const alreadyExists = this._symbolTable.get(identifier);
        if (alreadyExists === undefined) {
            this._symbolTable.set(identifier, symbol.toHolder());
            return undefined;
        }

        const canOverload = symbol.isFunction() && alreadyExists.isFunctionHolder();
        if (canOverload === false) return alreadyExists;

        // Functions can be added as overloads
        alreadyExists.pushOverload(symbol);
    }

    /**
     * Insert a symbol into the symbol table. If the symbol already exists, the diagnostic is published.
     * @param symbol
     * @return true if the symbol is successfully inserted, or false if the symbol already exists.
     */
    public insertSymbolAndCheck(symbol: SymbolObject): boolean {
        const alreadyExists = this.insertSymbol(symbol);
        if (alreadyExists !== undefined) {
            errorAlreadyDeclared(symbol.defToken);
        }

        return alreadyExists === undefined;
    }

    public lookupSymbol(identifier: string): SymbolObjectHolder | undefined {
        return this._symbolTable.get(identifier);
    }

    public lookupSymbolWithParent(identifier: string): SymbolObjectHolder | undefined {
        const symbol = this.lookupSymbol(identifier);
        if (symbol !== undefined) return symbol;
        return this.parentScope === undefined ? undefined : this.parentScope.lookupSymbolWithParent(identifier);
    }
}

function errorAlreadyDeclared(token: TokenObject) {
    analyzerDiagnostic.add(
        token.location,
        `Symbol '${token.text}' is already declared in the scope.`
    );
}

function findBuiltinStringType(scope: SymbolScope): SymbolType | undefined {
    for (const [key, symbol] of scope.symbolTable) {
        if (symbol instanceof SymbolType && isSourceBuiltinString(symbol.defNode)) return symbol;
    }

    for (const [key, child] of scope.childScopeTable) {
        const found = findBuiltinStringType(child);
        if (found !== undefined) return found;
    }

    return undefined;
}

// Judge if the class has a metadata that indicates it is a built-in string type.
function isSourceBuiltinString(source: TypeDefinitionNode | undefined): boolean {
    if (source === undefined) return false;
    if (source.nodeName != NodeName.Class) return false;
    // if (source.nodeRange.path.endsWith('as.predefined') === false) return false;

    // Check if the class has a metadata that indicates it is a built-in string type.
    const builtinStringMetadata = "BuiltinString";
    if (source.metadata.some(m => m.length === 1 && m[0].text === builtinStringMetadata)) {
        return true;
    }

    // Check whether the class name is a built-in string type with global settings.
    return getGlobalSettings().builtinStringTypes.includes(source.identifier.text);
}

export interface SymbolAndScope {
    readonly symbol: SymbolObjectHolder;
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

// -----------------------------------------------

// The global scope that is currently being analyzed.
let s_activeGlobalScope: SymbolScope | undefined;

function setActiveGlobalScope(scope: SymbolScope) {
    s_activeGlobalScope = scope;
}

/** @internal */
export function getActiveGlobalScope(): SymbolScope {
    assert(s_activeGlobalScope !== undefined);
    return s_activeGlobalScope;
}

/** @internal */
export function resolveActiveScope(path: ScopePath): SymbolScope {
    const result = getActiveGlobalScope().resolveScope(path);
    assert(result !== undefined);
    return result;
}

/** @internal */
export function tryResolveActiveScope(path: ScopePath | undefined): SymbolScope | undefined {
    if (path === undefined) return getActiveGlobalScope();
    return getActiveGlobalScope().resolveScope(path);
}

// -----------------------------------------------

/**
 * Represents the result of analyzing a file, such as scope information.
 */
export class AnalyzerScope {
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
            this.pureBuffer = new SymbolScope(
                this.fullScope.parentScope,
                this.fullScope.key,
                this.fullScope.linkedNode);
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
    for (const [key, symbolHolder] of srcScope.symbolTable) {
        for (const symbol of symbolHolder.toList()) {
            let canCopy = true;

            if (option.targetSrcPath !== undefined && symbol.defToken.location.path !== option.targetSrcPath) {
                canCopy = false;
            }

            if (option.excludeSrcPath !== undefined && symbol.defToken.location.path === option.excludeSrcPath) {
                canCopy = false;
            }

            if (canCopy) {
                destScope.insertSymbol(symbol);
            }
        }
    }

    // Copy child scopes recursively.
    for (const [key, child] of srcScope.childScopeTable) {
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

        const destChild = destScope.insertScope(key, child.linkedNode);
        copySymbolsInScope(child, destChild, option);
    }
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
        && symbol.isFunctionHolder()
        && scope.linkedNode !== undefined
        && scope.linkedNode.nodeName === NodeName.Class
        && scope.linkedNode.identifier.text === symbol.first.defToken.text;
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
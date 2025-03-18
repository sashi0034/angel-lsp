import {
    ReferenceInformation,
    ScopePath,
    SymbolObject,
    SymbolObjectHolder,
    SymbolType,
    TypeDefinitionNode
} from "./symbolObject";
import {
    NodeClass,
    NodeDoWhile,
    NodeEnum,
    NodeFor,
    NodeForEach,
    NodeFunc,
    NodeIf,
    NodeInterface,
    NodeLambda,
    NodeName,
    NodeStatBlock,
    NodeTry,
    NodeVirtualProp,
    NodeWhile
} from "../compiler_parser/nodes";
import {ComplementHint} from "./complementHint";
import {getGlobalSettings} from "../core/settings";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import assert = require("node:assert");

export type ScopeTable = Map<string, SymbolScope>;

type ReadonlyScopeTable = ReadonlyMap<string, SymbolScope>;

export type SymbolTable = Map<string, SymbolObjectHolder>;

export type ReadonlySymbolTable = ReadonlyMap<string, SymbolObjectHolder>;

interface GlobalScopeContext {
    filepath: string;
    builtinStringType: SymbolType | undefined;
    completionHints: ComplementHint[];
}

function createGlobalScopeContext(): GlobalScopeContext {
    return {
        filepath: '',
        builtinStringType: undefined,
        completionHints: [],
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
    | NodeForEach
    | NodeWhile
    | NodeDoWhile
    | NodeIf
    | NodeTry;

/**
 * Represents a scope that contains symbols.
 */
export class SymbolScope {
    // The parent scope of this scope. If this is the global scope, it has the context for the file
    private readonly _parentScope: SymbolScope | undefined;

    // The child scopes of this scope
    private readonly _childScopeTable: ScopeTable = new Map();

    // The symbol table that contains the symbols declared in this scope
    private readonly _symbolTable: SymbolTable = new Map();

    // Tokens that represent this scope.
    private readonly _namespaceTokens: TokenObject[] = [];

    // The list of symbol references to this scope.
    private readonly _referenceList: ReferenceInformation[] = [];

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
        assert(parentScope !== undefined || this instanceof SymbolGlobalScope);

        this._parentScope = parentScope;

        this.scopePath = parentScope !== undefined ? [...parentScope.scopePath, key] : [];
    }

    public get parentScope(): SymbolScope | undefined {
        return this._parentScope;
    }

    public isGlobalScope(): this is SymbolGlobalScope {
        return this._parentScope === undefined;
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

    /**
     * Whether this scope has scopes for each overloaded function.
     */
    public hasFunctionScopes(): boolean {
        return this._childScopeTable.values().next().value?.linkedNode?.nodeName === NodeName.Func;
    }

    /**
     * Whether this scope is a namespace without a node.
     * Note: AngelScript allows defining a class and a namespace with the same name simultaneously.
     */
    public isNamespaceWithoutNode(): boolean {
        return this.linkedNode === undefined && this.hasFunctionScopes() === false;
    }

    public getContext(): Readonly<GlobalScopeContext> {
        const globalScope = this.getGlobalScope();
        return globalScope.getContext();
    }

    public getBuiltinStringType(): SymbolType | undefined {
        return this.getContext().builtinStringType;
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

    public getGlobalScope(): SymbolGlobalScope {
        if (this.isGlobalScope()) return this;

        assert(this.parentScope !== undefined);
        return this.parentScope.getGlobalScope();
    }

    public pushNamespaceToken(token: TokenObject) {
        this._namespaceTokens.push(token);
    }

    public get referenceList(): ReadonlyArray<ReferenceInformation> {
        return this._referenceList;
    }

    public pushReference(reference: ReferenceInformation) {
        this._referenceList.push(reference);
    }

    /**
     * Tokens that represent this scope.
     */
    public get namespaceTokens(): ReadonlyArray<TokenObject> {
        return this._namespaceTokens;
    }

    /**
     * Create a new scope and insert it into the child scope table.
     */
    public insertScope(identifier: string, linkedNode: ScopeLinkedNode | undefined): SymbolScope {
        const alreadyExists = this._childScopeTable.get(identifier);
        if (alreadyExists !== undefined) {
            if (alreadyExists.linkedNode === undefined) alreadyExists.setLinkedNode(linkedNode);
            return alreadyExists;
        }

        const newScope = new SymbolScope(this, identifier, linkedNode);
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

    public resolveScope(path: ScopePath): SymbolScope | undefined { // FIXME: Should be moved to GlobalScope?
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
        const identifier = symbol.identifierToken.text;
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
            errorAlreadyDeclared(symbol.identifierToken);
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

    protected includeExternalScopeInternal(externalScope: SymbolScope, externalFilepath: string) {
        // Copy symbols from the external scope.
        for (const [key, symbolHolder] of externalScope.symbolTable) {
            for (const symbol of symbolHolder.toList()) {
                if (symbol.identifierToken.location.path === externalFilepath) {
                    this.insertSymbol(symbol);
                }
            }
        }

        // Copy child scopes recursively.
        for (const [key, child] of externalScope.childScopeTable) {
            const linkedNode = child.linkedNode?.nodeRange.path === externalFilepath ? child.linkedNode : undefined;
            const nextChildScope = this.insertScope(key, linkedNode);
            if (isAnonymousIdentifier(nextChildScope.key) === false) {
                nextChildScope.includeExternalScopeInternal(child, externalFilepath);
            }
        }
    }
}

export class SymbolGlobalScope extends SymbolScope {
    private readonly _context: GlobalScopeContext;

    public constructor(context?: GlobalScopeContext) {
        super(undefined, '', undefined);

        this._context = context !== undefined ? {...context} : createGlobalScopeContext();
    }

    public getContext(): Readonly<GlobalScopeContext> {
        return this._context;
    }

    public initializeContext(filepath: string) {
        this._context.filepath = filepath;
        setActiveGlobalScope(this);
    }

    /**
     * Cache information in the context of the file
     */
    public commitContext() {
        this._context.builtinStringType = findBuiltinStringType(this);
    }

    /**
     * Includes the symbols and scopes declared in an external file into the current scope.
     * Symbols and scopes from other files are not included.
     */
    public includeExternalScope(externalScope: SymbolScope) {
        const externalFilepath = externalScope.getContext().filepath;
        this.includeExternalScopeInternal(externalScope, externalFilepath);
    }

    public pushCompletionHint(hint: ComplementHint) {
        this._context.completionHints.push(hint);
    }

    public get completionHints(): ReadonlyArray<ComplementHint> {
        return this._context.completionHints;
    }
}

function errorAlreadyDeclared(token: TokenObject) {
    analyzerDiagnostic.error(
        token.location,
        `Symbol '${token.text}' is already declared in the scope.`
    );
}

function findBuiltinStringType(scope: SymbolScope): SymbolType | undefined {
    for (const [key, symbol] of scope.symbolTable) {
        if (symbol instanceof SymbolType && isSourceBuiltinString(symbol.linkedNode)) return symbol;
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

export function collectParentScopeList(scope: SymbolScope): SymbolScope[] {
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
let s_activeGlobalScope: SymbolGlobalScope | undefined;

function setActiveGlobalScope(scope: SymbolGlobalScope) {
    s_activeGlobalScope = scope;
}

/** @internal */
export function getActiveGlobalScope(): SymbolGlobalScope {
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
        && scope.linkedNode.identifier.text === symbol.first.identifierToken.text;
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
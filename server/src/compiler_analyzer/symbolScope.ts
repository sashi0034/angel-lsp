import {
    ReferenceInformation,
    ScopePath,
    SymbolFunctionHolder,
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
    NodeName, NodeNamespace,
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
    referenceList: ReferenceInformation[];
}

function createGlobalScopeContext(): GlobalScopeContext {
    return {
        filepath: '',
        builtinStringType: undefined,
        completionHints: [],
        referenceList: [],
    };
}

/**
 * Nodes that can have a scope containing symbols.
 * Note: It does not contain NodeNamespace because a scope can have multiple namespaces.
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

interface ScopeLinkedNamespaceNode {
    node: NodeNamespace;

    // Since the namespace node can have multiple identifier tokens,
    // we need to remember the token in the node that is linked to the scope.
    linkedToken: TokenObject;
}

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

    // The node list that represents this scope.
    // Unlike linkedNode, this namespaceNode always contains elements
    // that are defined in the same file as this scope.
    private readonly _namespaceNodes: ScopeLinkedNamespaceNode[] = [];

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

    public pushNamespaceNode(node: NodeNamespace, linkedToken: TokenObject) {
        this._namespaceNodes.push({node, linkedToken});
    }

    /**
     * Tokens that represent this scope.
     */
    public get namespaceNodes(): ReadonlyArray<Readonly<ScopeLinkedNamespaceNode>> {
        return this._namespaceNodes;
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

    protected resolveScope(path: ScopePath): SymbolScope | undefined {
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
        for (const [key, symbolHolder] of externalScope._symbolTable) {
            for (const symbol of symbolHolder.toList()) {
                if (symbol.identifierToken.location.path === externalFilepath) {
                    this.insertSymbol(symbol);
                }
            }
        }

        // Copy child scopes recursively.
        for (const [key, child] of externalScope._childScopeTable) {
            const linkedNode = child.linkedNode?.nodeRange.path === externalFilepath ? child.linkedNode : undefined;
            const nextChildScope = this.insertScope(key, linkedNode);
            if (isAnonymousIdentifier(nextChildScope.key) === false) {
                nextChildScope.includeExternalScopeInternal(child, externalFilepath);
            }
        }
    }

    protected cleanByFilepath(filepath: string) {
        this._namespaceNodes.length = 0;

        if (this._linkedNode?.nodeRange.path === filepath) {
            this._linkedNode = undefined;
        }

        // Exclude symbols declared in this file
        excludeSymbolTableByFilepath(this._symbolTable, filepath);

        // Iterate child scopes recursively
        for (const [key, child] of this._childScopeTable) {
            if (isAnonymousIdentifier(key) && child.linkedNode?.nodeRange.path === filepath) {
                // Anonymous scopes are deleted because they are defined in this file.
                this._childScopeTable.delete(key);
            } else {
                child.cleanByFilepath(filepath);
                if (child._childScopeTable.size === 0 && child._symbolTable.size === 0) {
                    this._childScopeTable.delete(key);
                }
            }
        }
    }
}

export class SymbolGlobalScope extends SymbolScope {
    private readonly _context: GlobalScopeContext;

    public constructor(filepathOrContext: string | GlobalScopeContext) {
        super(undefined, '', undefined);

        if (typeof filepathOrContext === 'string') {
            this._context = createGlobalScopeContext();
            this._context.filepath = filepathOrContext;
        } else {
            this._context = filepathOrContext;
        }
    }

    public getContext(): Readonly<GlobalScopeContext> {
        return this._context;
    }

    /**
     * Set this scope as the active global scope.
     */
    public activateContext() {
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

    /**
     * Remove the information created in this file
     */
    public cleanInFile() {
        this.cleanByFilepath(this._context.filepath);

        this._context.completionHints.length = 0;

        this._context.referenceList.length = 0;

        this.commitContext();
    }

    public pushCompletionHint(hint: ComplementHint) {
        this._context.completionHints.push(hint);
    }

    public get completionHints(): ReadonlyArray<ComplementHint> {
        return this._context.completionHints;
    }

    public pushReference(reference: ReferenceInformation) {
        this._context.referenceList.push(reference);
    }

    public get referenceList(): ReadonlyArray<ReferenceInformation> {
        return this._context.referenceList;
    }

    public resolveScope(path: ScopePath): SymbolScope | undefined {
        return super.resolveScope(path);
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

function excludeSymbolTableByFilepath(table: SymbolTable, filepath: string) {
    for (const [key, symbolHolder] of table) {
        if (symbolHolder.isFunctionHolder()) {
            const filteredList = symbolHolder.overloadList.filter(
                overload => overload.identifierToken.location.path !== filepath
            );

            if (filteredList.length === 0) {
                table.delete(key);
            } else if (filteredList.length < symbolHolder.count) {
                table.set(key, new SymbolFunctionHolder(filteredList));
            } // else filteredList.length == symbolHolder.count
            // fallthrough
        } else {
            if (symbolHolder.identifierToken.location.path === filepath) {
                table.delete(key);
            }
        }
    }
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
 * Determines whether the given symbol in the scope is a constructor.
 * @param pair A pair consisting of a symbol and the scope that contains it.
 */
// FIXME: deprecated
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
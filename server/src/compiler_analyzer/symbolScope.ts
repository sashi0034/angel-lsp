import {
    isScopePathEquals,
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
    NodeName, NodeNamespace,
    NodeStatBlock,
    NodeTry,
    NodeUsing,
    NodeVirtualProp,
    NodeWhile
} from "../compiler_parser/nodes";
import {
    AutoTypeResolutionInfo,
    FunctionCallInfo,
    AutocompleteInstanceMemberInfo,
    AutocompleteNamespaceAccessInfo,
    ScopeRegionInfo, ReferenceInfo
} from "./info";
import {getGlobalSettings} from "../core/settings";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import assert = require("node:assert");

export type ScopeTable = Map<string, SymbolScope>;

type ReadonlyScopeTable = ReadonlyMap<string, SymbolScope>;

export type SymbolTable = Map<string, SymbolObjectHolder>;

export type ReadonlySymbolTable = ReadonlyMap<string, SymbolObjectHolder>;

interface DetailScopeInformation {
    reference: ReferenceInfo[];
    scopeRegion: ScopeRegionInfo[];
    autocompleteInstanceMember: AutocompleteInstanceMemberInfo[];
    autocompleteNamespaceAccess: AutocompleteNamespaceAccessInfo[];
    functionCall: FunctionCallInfo[];
    autoTypeResolution: AutoTypeResolutionInfo[];
}

interface GlobalScopeContext {
    filepath: string;
    builtinStringType: SymbolType | undefined;
    enumScopeList: SymbolScope[];
    info: DetailScopeInformation;
}

function createGlobalScopeContext(): GlobalScopeContext {
    return {
        filepath: '',
        builtinStringType: undefined,
        enumScopeList: [],
        info: {
            reference: [],
            scopeRegion: [],
            autocompleteInstanceMember: [],
            autocompleteNamespaceAccess: [],
            functionCall: [],
            autoTypeResolution: [],
        }
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

interface ScopeUsingNamespace {
    scopePath: ScopePath;
    linkedNodes: NodeUsing[];
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

    // List of using namespaces in this scope
    private readonly _usingNamespaces: ScopeUsingNamespace[] = [];

    // List of namespace nodes that belong to this scope and are defined in the same source file.
    // Unlike linkedNode, this list excludes nodes coming from other files.
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
    public isFunctionHolderScope(): boolean {
        // ...
        //   |-- Function holder scope (with no node)
        //       |-- The function scope for one of the overloads (with NodeFunc)
        //           |-- ...
        // FIXME: What happens if the namespace and function name are the same?
        return this._childScopeTable.values().next().value?.isFunctionScope() === true;
    }

    /**
     * Whether this scope is one of the function scopes in overloaded functions.
     * Note: Since the parent scope has an identifier related to the function, the function scope is anonymous.
     */
    public isFunctionScope(): boolean {
        return this.linkedNode?.nodeName === NodeName.Func;
    }

    public isAnonymousScope(): boolean {
        return isAnonymousIdentifier(this.key);
    }

    /**
     * Whether this scope is a pure namespace that does not have a node.
     * Note: AngelScript allows defining a class and a namespace with the same name simultaneously.
     */
    public isPureNamespaceScope(): boolean {
        return this.linkedNode === undefined && !this.isFunctionHolderScope() && !this.isAnonymousScope();
    }

    public getContext(): Readonly<GlobalScopeContext> {
        const globalScope = this.getGlobalScope();
        return globalScope.getContext();
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

    public pushUsingNamespace(node: NodeUsing) {
        const scopePath: ScopePath = node.namespaceList.map(ns => ns.text);

        const alreadyExists = this._usingNamespaces.find(exist => isScopePathEquals(exist.scopePath, scopePath));
        if (alreadyExists !== undefined) {
            // If the using namespace already exists, add the node to the existing one.
            alreadyExists.linkedNodes.push(node);
        } else {
            // If the using namespace does not exist, create a new one.
            this._usingNamespaces.push({scopePath, linkedNodes: [node]});
        }
    }

    public getUsingNamespacesWithParent(): ReadonlyArray<ScopeUsingNamespace> {
        return this._parentScope === undefined
            ? this._usingNamespaces
            : [...this._parentScope.getUsingNamespacesWithParent(), ...this._usingNamespaces];
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

    public resolveRelativeScope(path: ScopePath): SymbolScope | undefined {
        if (path.length === 0) return this;
        const child = this._childScopeTable.get(path[0]);
        if (child === undefined) return undefined;
        return child.resolveRelativeScope(path.slice(1));
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

    protected includeExternalScope_internal(externalScope: SymbolScope, externalFilepath: string) {
        // Copy symbols from the external scope.
        for (const [key, symbolHolder] of externalScope._symbolTable) {
            for (const symbol of symbolHolder.toList()) {
                if (symbol.identifierToken.location.path === externalFilepath) {
                    this.insertSymbol(symbol);
                }
            }
        }

        // Copy using namespaces from the external scope.
        for (const usingNamespace of externalScope._usingNamespaces) {
            const filteredNodes = usingNamespace.linkedNodes.filter(
                node => node.namespaceList.some(ns => ns.location.path === externalFilepath));
            if (filteredNodes.length > 0) {
                this._usingNamespaces.push({
                    scopePath: usingNamespace.scopePath,
                    linkedNodes: filteredNodes
                });
            }
        }

        // Copy child scopes recursively.
        for (const [key, otherChild] of externalScope._childScopeTable) {
            // We only insert it if it is a node specific to the external file.
            const canInsertNode = otherChild.linkedNode?.nodeRange.path === externalFilepath;

            if (otherChild.isAnonymousScope()) {
                // The scope name of function overloads is represented by an anonymous identifier.
                // This checks whether it can be inserted.
                if (canInsertNode && otherChild.isFunctionScope()) {
                    this.insertScope(key, otherChild.linkedNode);
                }
            } else if (otherChild._symbolTable.size > 0 ||
                otherChild._childScopeTable.size > 0 ||
                otherChild._usingNamespaces.length > 0
            ) {
                const thisChild = this.insertScope(key, canInsertNode ? otherChild.linkedNode : undefined);
                thisChild.includeExternalScope_internal(otherChild, externalFilepath);
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
        this._context.enumScopeList = collectEnumScopeList(this);
    }

    /**
     * Includes the symbols and scopes declared in an external file into the current scope.
     * Symbols and scopes from other files are not included.
     */
    public includeExternalScope(externalScope: SymbolScope) {
        const externalFilepath = externalScope.getContext().filepath;
        this.includeExternalScope_internal(externalScope, externalFilepath);
    }

    public get info(): Readonly<DetailScopeInformation> {
        return this._context.info;
    }

    public resolveScope(path: ScopePath): SymbolScope | undefined {
        return super.resolveRelativeScope(path);
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
        if (symbol.isType() && isSourceBuiltinString(symbol.linkedNode)) return symbol;
    }

    for (const [key, child] of scope.childScopeTable) {
        if (child.isAnonymousScope()) continue;

        const found = findBuiltinStringType(child);
        if (found !== undefined) return found;
    }

    return undefined;
}

function collectEnumScopeList(scope: SymbolScope): SymbolScope[] {
    const result: SymbolScope[] = [];

    for (const child of scope.childScopeTable.values()) {
        if (child.isAnonymousScope()) {
            continue;
        }

        if (child.linkedNode?.nodeName === NodeName.Enum) {
            result.push(child);
        }

        result.push(...collectEnumScopeList(child));
    }

    return result;
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
    return getGlobalSettings().builtinStringType === source.identifier.text;
}

// function excludeSymbolTableByFilepath(table: SymbolTable, filepath: string) {
//     for (const [key, symbolHolder] of table) {
//         if (symbolHolder.isFunctionHolder()) {
//             const filteredList = symbolHolder.overloadList.filter(
//                 overload => overload.identifierToken.location.path !== filepath
//             );
//
//             if (filteredList.length === 0) {
//                 table.delete(key);
//             } else if (filteredList.length < symbolHolder.count) {
//                 table.set(key, new SymbolFunctionHolder(filteredList));
//             } // else filteredList.length == symbolHolder.count
//             // fallthrough
//         } else {
//             if (symbolHolder.identifierToken.location.path === filepath) {
//                 table.delete(key);
//             }
//         }
//     }
// }

export interface SymbolAndScope {
    readonly symbol: SymbolObjectHolder;
    readonly scope: SymbolScope;
}

export function collectScopeListWithParentAndUsingNamespace(scope: SymbolScope): SymbolScope[] {
    const usingNamespaces = scope.getUsingNamespacesWithParent();
    return collectScopeListWithParentAndUsingNamespace_internal(scope, usingNamespaces);
}

function collectScopeListWithParentAndUsingNamespace_internal(scope: SymbolScope, usingNamespaces: ReadonlyArray<ScopeUsingNamespace>): SymbolScope[] {
    const result: SymbolScope[] = [scope];

    // Add using namespaces to the end of the list.
    for (const usingNamespace of usingNamespaces) {
        const namespaceScope = scope?.resolveRelativeScope(usingNamespace.scopePath);
        if (namespaceScope !== undefined) {
            result.push(namespaceScope);
        }
    }

    return scope.parentScope === undefined
        ? result
        : [...result, ...collectScopeListWithParentAndUsingNamespace_internal(scope.parentScope, usingNamespaces)];
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
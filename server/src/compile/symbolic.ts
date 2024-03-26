import {LocationInfo, TokenKind} from "./token";
import {
    NodeClass,
    NodeEnum,
    NodeFunc,
    NodeFuncDef,
    NodeNamespace,
    NodeParamList,
    ParsedRange,
    NodeType,
    NodeName
} from "./nodes";
import {Range} from "vscode-languageserver";
import {dummyToken, ParsingToken} from "./parsing";
import {diagnostic} from "../code/diagnostic";

export enum SymbolKind {
    Type = 'Type',
    Function = 'Function',
    Variable = 'Variable',
}

export enum PrimitiveType {
    Bool = 'Bool',
    Number = 'Number',
    Void = 'Void',
}

export interface SymbolicBase {
    symbolKind: SymbolKind;
    declaredPlace: ParsingToken;
}

export interface SymbolicType extends SymbolicBase {
    symbolKind: SymbolKind.Type;
    sourceNode: NodeEnum | NodeClass | PrimitiveType;
}

export interface SymbolicFunction extends SymbolicBase {
    symbolKind: SymbolKind.Function;
    sourceNode: NodeFunc;
    overloadedAlt: SymbolicFunction | undefined;
}

export interface SymbolicVariable extends SymbolicBase {
    symbolKind: SymbolKind.Variable;
    type: SymbolicType | undefined;
}

export type SymbolicObject = SymbolicType | SymbolicFunction | SymbolicVariable;

type NamespaceString = string;

type SymbolOwnerNode = NodeEnum | NodeClass | NodeFunc | NamespaceString;

export function isOwnerNodeNamespace(node: SymbolOwnerNode | undefined): node is NamespaceString {
    return node !== undefined && typeof node === "string";
}

export function isOwnerNodeExistence(
    node: SymbolOwnerNode | undefined
): node is NodeEnum | NodeClass | NodeFunc {
    return node !== undefined && typeof node !== "string";
}

export function isOwnerNodeHoistingDeclare(
    node: SymbolOwnerNode | undefined
): node is NodeEnum | NodeClass {
    if (isOwnerNodeExistence(node) === false) return false;
    const nodeName = node.nodeName;
    return nodeName === NodeName.Enum || nodeName === NodeName.Class;
}

export interface ReferencedSymbolInfo {
    declaredSymbol: SymbolicBase;
    referencedToken: ParsingToken;
}

export type SymbolDictionary = { [symbolName: string]: SymbolicObject };

export interface SymbolScope {
    ownerNode: SymbolOwnerNode | undefined;
    parentScope: SymbolScope | undefined;
    childScopes: SymbolScope[];
    symbolDict: SymbolDictionary;
    referencedList: ReferencedSymbolInfo[];
    completionHints: ComplementHints[];
}

export function insertSymbolicObject(dict: SymbolDictionary, symbol: SymbolicObject): boolean {
    const identifier = symbol.declaredPlace.text;
    const hit = dict[identifier];
    if (hit === undefined) {
        dict[identifier] = symbol;
        return true;
    }
    const canOverload = symbol.symbolKind === SymbolKind.Function && hit.symbolKind === SymbolKind.Function;
    if (canOverload === false) {
        diagnostic.addError(symbol.declaredPlace.location, `Symbol '${identifier}' is already defined ❌`);
        return false;
    }

    // 関数はオーバーロードとして追加が可能
    let cursor = hit;
    for (; ;) {
        if (cursor.overloadedAlt === undefined) {
            cursor.overloadedAlt = symbol;
            return true;
        }
        cursor = cursor.overloadedAlt;
    }
}

export function createSymbolScope(ownerNode: SymbolOwnerNode | undefined, parentScope: SymbolScope | undefined): SymbolScope {
    return {
        ownerNode: ownerNode,
        parentScope: parentScope,
        childScopes: [],
        symbolDict: {},
        referencedList: [],
        completionHints: [],
    };
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
        destScope.symbolDict = {...destScope.symbolDict, ...srcScope.symbolDict};
    } else {
        // 宣言ファイルが同じシンボルを収集
        for (const srcKey in srcScope.symbolDict) {
            if (srcScope.symbolDict[srcKey].declaredPlace.location.path === srcPath) {
                destScope.symbolDict[srcKey] = srcScope.symbolDict[srcKey];
            }
        }
    }

    for (const child of srcScope.childScopes) {
        if (isOwnerNodeNamespace(child.ownerNode)) {
            // 名前空間のスコープを挿入
            const namespaceScope = findNamespaceScopeOrCreate(destScope, child.ownerNode);
            copyOriginalSymbolsInScope(srcPath, child, namespaceScope);
        } else if (isOwnerNodeHoistingDeclare(child.ownerNode)) {
            // 巻き上げ宣言可能なシンボルを収集
            destScope.childScopes.push(child);
        }
    }
}

export function copySymbolsInScope(srcScope: SymbolScope, destScope: SymbolScope) {
    // 対象元から対象先のスコープへ全シンボルをコピー
    copyOriginalSymbolsInScope(undefined, srcScope, destScope);
}

export interface DeducedType {
    symbol: SymbolicType;
}

export interface ComplementBase {
    complementKind: NodeName.Type | NodeName.Namespace;
    complementRange: Range;
}

export interface ComplementType extends ComplementBase {
    complementKind: NodeName.Type;
    targetType: SymbolicType;
}

export interface CompletionNamespace extends ComplementBase {
    complementKind: NodeName.Namespace;
    namespaceList: ParsingToken[];
}

export type ComplementHints = ComplementType | CompletionNamespace;

function createBuiltinType(name: PrimitiveType): SymbolicType {
    return {
        symbolKind: SymbolKind.Type,
        declaredPlace: dummyToken,
        sourceNode: name,
    } as const;
}

export const builtinNumberType: SymbolicType = createBuiltinType(PrimitiveType.Number);

export const builtinBoolType: SymbolicType = createBuiltinType(PrimitiveType.Bool);

export const builtinVoidType: SymbolicType = createBuiltinType(PrimitiveType.Void);

export function findSymbolicTypeWithParent(scope: SymbolScope, token: ParsingToken): SymbolicType | undefined {
    const tokenText = token.text;
    if (token.kind === TokenKind.Reserved) {
        if ((tokenText === 'bool')) return builtinBoolType;
        else if ((tokenText === 'void')) return builtinVoidType;
        else if (numberTypeSet.has(tokenText)) return builtinNumberType;
    }
    return findSymbolWithParent(scope, tokenText, SymbolKind.Type) as SymbolicType;
}

const numberTypeSet = new Set(['int8', 'int16', 'int', 'int32', 'int64', 'uint8', 'uint16', 'uint', 'uint32', 'uint64', 'float', 'double']);

export function findSymbolicFunctionWithParent(scope: SymbolScope, identifier: string): SymbolicFunction | undefined {
    return findSymbolWithParent(scope, identifier, SymbolKind.Function) as SymbolicFunction;
}

export function findSymbolicVariableWithParent(scope: SymbolScope, identifier: string): SymbolicVariable | undefined {
    return findSymbolWithParent(scope, identifier, SymbolKind.Variable) as SymbolicVariable;
}

function findSymbolWithParent(scope: SymbolScope, identifier: string, kind: SymbolKind): SymbolicObject | undefined {
    const symbol = scope.symbolDict[identifier];
    if (symbol !== undefined && symbol.symbolKind === kind) return symbol;
    if (scope.parentScope === undefined) return undefined;
    return findSymbolWithParent(scope.parentScope, identifier, kind);
}

export function findClassScopeWithParent(scope: SymbolScope, identifier: string): SymbolScope | undefined {
    for (const child of scope.childScopes) {
        if (isOwnerNodeExistence(child.ownerNode) === false) continue;
        if (child.ownerNode.nodeName !== NodeName.Class) continue;
        if (child.ownerNode.identifier.text === identifier) return child;
    }
    if (scope.parentScope === undefined) return undefined;
    return findClassScopeWithParent(scope.parentScope, identifier);
}

export function findNamespaceScope(scope: SymbolScope, identifier: string): SymbolScope | undefined {
    for (const child of scope.childScopes) {
        if (isOwnerNodeNamespace(child.ownerNode) === false) continue;
        if (child.ownerNode === identifier) return child;
    }
    return undefined;
}

export function findScopeByIdentifier(scope: SymbolScope, identifier: string): SymbolScope | undefined {
    for (const child of scope.childScopes) {
        if (isOwnerNodeNamespace(child.ownerNode) && child.ownerNode === identifier) return child;
        if (isOwnerNodeExistence(child.ownerNode) && child.ownerNode.identifier.text === identifier) return child;
    }
    return undefined;
}

export function findNamespaceScopeOrCreate(scope: SymbolScope, identifier: string): SymbolScope {
    const namespaceScope = findNamespaceScope(scope, identifier);
    if (namespaceScope !== undefined) return namespaceScope;
    const newScope = createSymbolScope(identifier, scope);
    scope.childScopes.push(newScope);
    return newScope;
}

export function findNamespaceScopeWithParent(scope: SymbolScope, identifier: string): SymbolScope | undefined {
    for (const child of scope.childScopes) {
        if (isOwnerNodeNamespace(child.ownerNode) === false) continue;
        if (child.ownerNode === identifier) return child;
    }
    if (scope.parentScope === undefined) return undefined;
    return findClassScopeWithParent(scope.parentScope, identifier);
}

export function findGlobalScope(scope: SymbolScope): SymbolScope {
    if (scope.parentScope === undefined) return scope;
    return findGlobalScope(scope.parentScope);
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

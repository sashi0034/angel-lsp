import {dummyToken, PlainToken, LocationInfo} from "./token";
import {NodeClass, NodeEnum, NodeFunc, NodeFuncDef, NodeNamespace, NodeParamList, ParsedRange, NodeType} from "./nodes";
import {Range} from "vscode-languageserver";

export type SymbolKind = 'type' | 'function' | 'variable';

export interface SymbolicBase {
    symbolKind: 'type' | 'function' | 'variable';
    declaredPlace: PlainToken;
}

export interface SymbolicType extends SymbolicBase {
    symbolKind: 'type';
    sourceNode: NodeEnum | NodeClass | 'bool' | 'number' | 'void';
}

export interface SymbolicFunction extends SymbolicBase {
    symbolKind: 'function';
    sourceNode: NodeFunc;
}

export interface SymbolicVariable extends SymbolicBase {
    symbolKind: 'variable';
    type: SymbolicType | undefined;
}

export type SymbolicObject = SymbolicType | SymbolicFunction | SymbolicVariable;

type NamespaceString = string;

type SymbolOwnerNode = NodeClass | NodeFunc | NamespaceString;

export function isOwnerNodeNamespace(node: SymbolOwnerNode | undefined): node is NamespaceString {
    return node !== undefined && typeof node === "string";
}

export function isOwnerNodeExistence(node: SymbolOwnerNode | undefined): node is NodeClass | NodeFunc {
    return node !== undefined && typeof node !== "string";
}

export interface ReferencedSymbolInfo {
    declaredSymbol: SymbolicBase;
    referencedToken: PlainToken;
}

export interface SymbolScope {
    ownerNode: SymbolOwnerNode | undefined;
    parentScope: SymbolScope | undefined;
    childScopes: SymbolScope[];
    symbolList: SymbolicObject[];
    referencedList: ReferencedSymbolInfo[];
    completionHints: ComplementHints[];
}

export function createSymbolScope(ownerNode: SymbolOwnerNode | undefined, parentScope: SymbolScope | undefined): SymbolScope {
    return {
        ownerNode: ownerNode,
        parentScope: parentScope,
        childScopes: [],
        symbolList: [],
        referencedList: [],
        completionHints: [],
    };
}

export interface DeducedType {
    symbol: SymbolicType;
}

export interface ComplementBase {
    complementKind: 'Type' | 'Namespace';
    complementRange: Range;
}

export interface ComplementType extends ComplementBase {
    complementKind: 'Type';
    targetType: SymbolicType;
}

export interface CompletionNamespace extends ComplementBase {
    complementKind: 'Namespace';
    namespaceList: PlainToken[];
}

export type ComplementHints = ComplementType | CompletionNamespace;

function createBuiltinType(name: 'bool' | 'number' | 'void'): SymbolicType {
    return {
        symbolKind: 'type',
        declaredPlace: dummyToken,
        sourceNode: name,
    } as const;
}

export const builtinNumberType: SymbolicType = createBuiltinType('number');

export const builtinBoolType: SymbolicType = createBuiltinType('bool');

export const builtinVoidType: SymbolicType = createBuiltinType('void');

export function findSymbolicTypeWithParent(scope: SymbolScope, token: PlainToken): SymbolicType | undefined {
    const tokenText = token.text;
    if (token.kind === 'reserved') {
        if ((tokenText === 'bool')) return builtinBoolType;
        else if ((tokenText === 'void')) return builtinVoidType;
        else if (numberTypeSet.has(tokenText)) return builtinNumberType;
    }
    return findSymbolWithParent(scope, tokenText, 'type') as SymbolicType;
}

const numberTypeSet = new Set(['int8', 'int16', 'int', 'int32', 'int64', 'uint8', 'uint16', 'uint', 'uint32', 'uint64', 'float', 'double']);

export function findSymbolicFunctionWithParent(scope: SymbolScope, identifier: string): SymbolicFunction | undefined {
    return findSymbolWithParent(scope, identifier, 'function') as SymbolicFunction;
}

export function findSymbolicVariableWithParent(scope: SymbolScope, identifier: string): SymbolicVariable | undefined {
    return findSymbolWithParent(scope, identifier, 'variable') as SymbolicVariable;
}

function findSymbolWithParent(scope: SymbolScope, identifier: string, kind: SymbolKind): SymbolicObject | undefined {
    for (const symbol of scope.symbolList) {
        if (symbol.symbolKind !== kind) continue;
        if (symbol.declaredPlace === undefined) continue;
        if (symbol.declaredPlace.text === identifier) return symbol;
    }
    if (scope.parentScope === undefined) return undefined;
    return findSymbolWithParent(scope.parentScope, identifier, kind);
}

export function findClassScopeWithParent(scope: SymbolScope, identifier: string): SymbolScope | undefined {
    for (const child of scope.childScopes) {
        if (isOwnerNodeExistence(child.ownerNode) === false) continue;
        if (child.ownerNode.nodeName !== 'Class') continue;
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

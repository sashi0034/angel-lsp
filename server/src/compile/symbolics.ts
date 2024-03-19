import {dummyToken, EssentialToken} from "./token";
import {NodeClass, NodeEnum, NodeFunc, NodeFuncDef, NodeNamespace, NodeParamList, NodeType} from "./nodes";

export type SymbolKind = 'type' | 'function' | 'variable';

export interface SymbolicType {
    symbolKind: 'type';
    declaredPlace: EssentialToken;
    usageList: EssentialToken[];
    sourceNode: NodeEnum | NodeClass | 'bool' | 'number' | 'void';
}

export interface SymbolicFunction {
    symbolKind: 'function';
    declaredPlace: EssentialToken;
    usageList: EssentialToken[];
    sourceNode: NodeFunc;
}

export interface SymbolicVariable {
    symbolKind: 'variable';
    type: SymbolicType | undefined;
    declaredPlace: EssentialToken;
    usageList: EssentialToken[];
}

export type SymbolicObject = SymbolicType | SymbolicFunction | SymbolicVariable;

type SingleNamespaceToken = EssentialToken;

export interface SymbolScope {
    ownerNode: NodeClass | NodeFunc | SingleNamespaceToken | undefined;
    parentScope: SymbolScope | undefined;
    childScopes: SymbolScope[];
    symbolList: SymbolicObject[];
}

export interface DeducedType {
    symbol: SymbolicType;
}

function createBuiltinType(name: 'bool' | 'number' | 'void'): SymbolicType {
    return {
        symbolKind: 'type',
        declaredPlace: dummyToken,
        usageList: [],
        sourceNode: name,
    } as const;
}

export const builtinNumberType: SymbolicType = createBuiltinType('number');

export const builtinBoolType: SymbolicType = createBuiltinType('bool');

export const builtinVoidType: SymbolicType = createBuiltinType('void');

export function findSymbolicTypeWithParent(scope: SymbolScope, token: EssentialToken): SymbolicType | undefined {
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
        if (child.ownerNode === undefined) continue;
        if ('nodeName' in child.ownerNode === false) continue;
        if (child.ownerNode.nodeName !== 'CLASS') continue;
        if (child.ownerNode.identifier.text === identifier) return child;
    }
    if (scope.parentScope === undefined) return undefined;
    return findClassScopeWithParent(scope.parentScope, identifier);
}

export function findNamespaceScope(scope: SymbolScope, identifier: string): SymbolScope | undefined {
    for (const child of scope.childScopes) {
        if (child.ownerNode === undefined) continue;
        if ('nodeName' in child.ownerNode) continue;
        if (child.ownerNode.text === identifier) return child;
    }
    return undefined;
}

export function findNamespaceScopeWithParent(scope: SymbolScope, identifier: string): SymbolScope | undefined {
    for (const child of scope.childScopes) {
        if (child.ownerNode === undefined) continue;
        if ('nodeName' in child.ownerNode) continue;
        if (child.ownerNode.text === identifier) return child;
    }
    if (scope.parentScope === undefined) return undefined;
    return findClassScopeWithParent(scope.parentScope, identifier);
}

export function findGlobalScope(scope: SymbolScope): SymbolScope {
    if (scope.parentScope === undefined) return scope;
    return findGlobalScope(scope.parentScope);
}

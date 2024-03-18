import {dummyToken, TokenObject} from "./token";
import {NodeCLASS, NodeENUM, NodeFUNC, NodeFUNCDEF, NodePARAMLIST, NodeTYPE} from "./nodes";

export type SymbolKind = 'type' | 'function' | 'variable';

export interface SymbolicType {
    symbolKind: 'type';
    declaredPlace: TokenObject;
    usageList: TokenObject[];
    node: NodeENUM | NodeCLASS | 'bool' | 'number' | 'void';
}

export interface SymbolicFunction {
    symbolKind: 'function';
    declaredPlace: TokenObject;
    usageList: TokenObject[];
    node: NodeFUNC;
}

export interface SymbolicVariable {
    symbolKind: 'variable';
    type: SymbolicType | undefined;
    declaredPlace: TokenObject;
    usageList: TokenObject[];
}

export type SymbolicObject = SymbolicType | SymbolicFunction | SymbolicVariable;

export interface SymbolScope {
    parentScope: SymbolScope | undefined;
    childScopes: SymbolScope[];
    symbolList: SymbolicObject[];
}

function createBuiltinType(name: 'bool' | 'number' | 'void'): SymbolicType {
    return {
        symbolKind: 'type',
        declaredPlace: dummyToken,
        usageList: [],
        node: name,
    } as const;
}

export const builtinNumberType: SymbolicType = createBuiltinType('number');

export const builtinBoolType: SymbolicType = createBuiltinType('bool');

export const builtinVoidType: SymbolicType = createBuiltinType('void');

export function findSymbolicTypeWithParent(scope: SymbolScope, token: TokenObject): SymbolicType | undefined {
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

function findSymbolWithParent(scope: SymbolScope, identifier: string, kind: SymbolKind | undefined): SymbolicObject | undefined {
    for (const symbol of scope.symbolList) {
        if (kind !== undefined && symbol.symbolKind !== kind) continue;
        if (symbol.declaredPlace === undefined) continue;
        if (symbol.declaredPlace.text === identifier) return symbol;
    }
    if (scope.parentScope === undefined) return undefined;
    return findSymbolWithParent(scope.parentScope, identifier, kind);
}


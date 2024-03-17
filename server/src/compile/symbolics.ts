import {dummyToken, TokenObject} from "./token";
import {NodeCLASS, NodeENUM, NodeFUNC, NodeFUNCDEF, NodePARAMLIST, NodeTYPE} from "./nodes";

export type SymbolKind = 'type' | 'function' | 'variable';

export interface SymbolicType {
    symbolKind: 'type';
    declaredPlace: TokenObject;
    usageList: TokenObject[];
    node: NodeENUM | NodeCLASS | 'bool' | 'number' | 'void';
}

export const builtinNumberType: SymbolicType = {
    symbolKind: 'type',
    declaredPlace: dummyToken,
    usageList: [],
    node: 'number',
};

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
    symbols: SymbolicObject[];
}

export function findSymbolicTypeWithParent(scope: SymbolScope, identifier: string): SymbolicType | undefined {
    return findSymbolWithParent(scope, identifier, 'type') as SymbolicType;
}

export function findSymbolicFunctionWithParent(scope: SymbolScope, identifier: string): SymbolicFunction | undefined {
    return findSymbolWithParent(scope, identifier, 'function') as SymbolicFunction;
}

export function findSymbolicVariableWithParent(scope: SymbolScope, identifier: string): SymbolicVariable | undefined {
    return findSymbolWithParent(scope, identifier, 'variable') as SymbolicVariable;
}

function findSymbolWithParent(scope: SymbolScope, identifier: string, kind: SymbolKind | undefined): SymbolicObject | undefined {
    for (const symbol of scope.symbols) {
        if (kind !== undefined && symbol.symbolKind !== kind) continue;
        if (symbol.declaredPlace === undefined) continue;
        if (symbol.declaredPlace.text === identifier) return symbol;
    }
    if (scope.parentScope === undefined) return undefined;
    return findSymbolWithParent(scope.parentScope, identifier, kind);
}


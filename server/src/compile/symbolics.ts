import {TokenObject} from "./token";
import {NodeCLASS, NodeENUM, NodeFUNC, NodeFUNCDEF, NodePARAMLIST, NodeTYPE} from "./nodes";

export type SymbolKind = 'type' | 'function' | 'variable';

export interface SymbolicType {
    symbolKind: 'type';
    declare: TokenObject;
    usage: TokenObject[];
    node: NodeENUM | NodeCLASS;
}

export interface SymbolicFunction {
    symbolKind: 'function';
    declare: TokenObject;
    usage: TokenObject[];
    node: NodeFUNC;
}

export interface SymbolicVariable {
    symbolKind: 'variable';
    type: SymbolicType | null;
    declare: TokenObject;
    usage: TokenObject[];
}

export type SymbolicObject = SymbolicType | SymbolicFunction | SymbolicVariable;

export interface SymbolScope {
    parentScope: SymbolScope | null;
    childScopes: SymbolScope[];
    symbols: SymbolicObject[];
}

export function findSymbolicTypeWithParent(scope: SymbolScope, identifier: string): SymbolicType | null {
    return findSymbolWithParent(scope, identifier, 'type') as SymbolicType;
}

export function findSymbolicFunctionWithParent(scope: SymbolScope, identifier: string): SymbolicFunction | null {
    return findSymbolWithParent(scope, identifier, 'function') as SymbolicFunction;
}

export function findSymbolicVariableWithParent(scope: SymbolScope, identifier: string): SymbolicVariable | null {
    return findSymbolWithParent(scope, identifier, 'variable') as SymbolicVariable;
}

function findSymbolWithParent(scope: SymbolScope, identifier: string, kind: SymbolKind | undefined): SymbolicObject | null {
    for (const symbol of scope.symbols) {
        if (kind !== undefined && symbol.symbolKind !== kind) continue;
        if (symbol.declare === undefined) continue;
        if (symbol.declare.text === identifier) return symbol;
    }
    if (scope.parentScope === null) return null;
    return findSymbolWithParent(scope.parentScope, identifier, kind);
}


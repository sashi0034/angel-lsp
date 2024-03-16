import {TokenObject} from "./token";
import {NodePARAMLIST, NodeTYPE} from "./nodes";

export type  SymbolKind = 'type' | 'function' | 'variable';

export interface SymbolicType {
    symbolKind: 'type';
    bases: NodeTYPE[];
    declare: TokenObject;
    usage: TokenObject[];
}

export interface SymbolicFunction {
    symbolKind: 'function';
    args: NodePARAMLIST;
    returnType: NodeTYPE;
    declare: TokenObject;
    usage: TokenObject[];
}

export interface SymbolicVariable {
    symbolKind: 'variable';
    type: NodeTYPE;
    declare: TokenObject;
    usage: TokenObject[];
}

export type SymbolicObject = SymbolicType | SymbolicFunction | SymbolicVariable;

export interface SymbolScope {
    parentScope: SymbolScope | null;
    childScopes: SymbolScope[];
    symbols: SymbolicObject[];
}

export function findSymbolWithParent(scope: SymbolScope, identifier: string, kind: SymbolKind | undefined): SymbolicObject | null {
    for (const symbol of scope.symbols) {
        if (kind !== undefined && symbol.symbolKind !== kind) continue;
        if (symbol.declare.text === identifier) return symbol;
    }
    if (scope.parentScope === null) return null;
    return findSymbolWithParent(scope.parentScope, identifier, kind);
}


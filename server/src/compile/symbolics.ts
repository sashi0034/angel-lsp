import {TokenObject} from "./tokenizer";
import {NodePARAMLIST, NodeTYPE} from "./nodes";

export interface SymbolicType {
    type: NodeTYPE;
    declare: TokenObject;
    usage: TokenObject[];
}

export interface SymbolicFunction {
    args: NodePARAMLIST;
    ret: NodeTYPE;
    declare: TokenObject;
    usage: TokenObject[];
}

export interface SymbolicVariable {
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

export function findSymbolWithParent(scope: SymbolScope, token: TokenObject): SymbolicObject | null {
    for (const symbol of scope.symbols) {
        // if (symbol.declare === null) continue;
        if (symbol.declare.text === token.text) return symbol;
    }
    if (scope.parentScope === null) return null;
    return findSymbolWithParent(scope.parentScope, token);
}


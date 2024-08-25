import {ParsedToken} from "./parsedToken";
import {createSymbolScope} from "./symbolScopes";
import {createVirtualToken} from "./tokenUtils";
import {TokenKind} from "./tokens";
import {numberTypeSet} from "./tokenReservedWords";
import {PrimitiveType, SymbolicType, SymbolKind} from "./symbols";
import assert = require("node:assert");

function createBuiltinType(virtualToken: ParsedToken, name: PrimitiveType): SymbolicType {
    return {
        symbolKind: SymbolKind.Type,
        declaredPlace: virtualToken,
        declaredScope: createSymbolScope(undefined, undefined, ''),
        sourceType: name,
        membersScope: undefined,
    } as const;
}

const builtinNumberTypeMap: Map<string, SymbolicType> = (() => {
    const map = new Map<string, SymbolicType>();
    for (const name of numberTypeSet) {
        map.set(name, createBuiltinType(createVirtualToken(TokenKind.Reserved, name), PrimitiveType.Number));
    }
    return map;
})();

export const builtinStringType: SymbolicType = createBuiltinType(createVirtualToken(TokenKind.String, 'string'), PrimitiveType.String);

export const builtinIntType = builtinNumberTypeMap.get('int')!;

export const builtinFloatType = builtinNumberTypeMap.get('float')!;

export const builtinDoubleType = builtinNumberTypeMap.get('double')!;

function assignBuiltinNumberType(key: string): SymbolicType {
    const type = builtinNumberTypeMap.get(key);
    if (type !== undefined) return type;
    assert(false);
}

export const builtinBoolType: SymbolicType = createBuiltinType(createVirtualToken(TokenKind.Reserved, 'bool'), PrimitiveType.Bool);

export const builtinVoidType: SymbolicType = createBuiltinType(createVirtualToken(TokenKind.Reserved, 'void'), PrimitiveType.Void);

export const builtinAnyType: SymbolicType = createBuiltinType(createVirtualToken(TokenKind.Reserved, '?'), PrimitiveType.Any);

export const builtinAutoType: SymbolicType = createBuiltinType(createVirtualToken(TokenKind.Reserved, 'auto'), PrimitiveType.Auto);

export function tryGetBuiltInType(token: ParsedToken): SymbolicType | undefined {
    if (token.kind !== TokenKind.Reserved) return undefined;

    const identifier = token.text;
    if ((identifier === 'bool')) return builtinBoolType;
    else if ((identifier === 'void')) return builtinVoidType;
    else if (identifier === '?') return builtinAnyType;
    else if (identifier === 'auto') return builtinAutoType;
    else if (token.kind === TokenKind.Reserved && token.property.isNumber) return assignBuiltinNumberType(identifier);

    return undefined;
}

export const builtinThisToken = createVirtualToken(TokenKind.Identifier, 'this');

export const builtinSetterValueToken = createVirtualToken(TokenKind.Identifier, 'value');
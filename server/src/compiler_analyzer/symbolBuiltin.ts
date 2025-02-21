import {ParserToken} from "../compiler_parser/parserToken";
import {createSymbolScope} from "./symbolScope";
import {createVirtualToken} from "../compiler_tokenizer/tokenUtils";
import {TokenKind} from "../compiler_tokenizer/tokens";
import {numberTypeSet} from "../compiler_tokenizer/tokenReservedWords";
import {SymbolType} from "./symbolObject";
import assert = require("node:assert");
import {ResolvedType} from "./resolvedType";

function createBuiltinType(virtualToken: ParserToken): SymbolType {
    return SymbolType.create({
        declaredPlace: virtualToken, // The built-in type uses a virtual token
        declaredScope: createSymbolScope(undefined, undefined, ''),
        sourceNode: undefined,
        membersScope: undefined,
    });
}

const builtinNumberTypeMap: Map<string, SymbolType> = (() => {
    const map = new Map<string, SymbolType>();
    for (const name of numberTypeSet) {
        map.set(name, createBuiltinType(createVirtualToken(TokenKind.Reserved, name)));
    }
    return map;
})();

// export const builtinStringType: SymbolType = createBuiltinType(createVirtualToken(TokenKind.String, 'string'));

// export const resolvedBuiltinString: ResolvedType = new ResolvedType(builtinStringType);

export const builtinIntType = builtinNumberTypeMap.get('int')!;

export const resolvedBuiltinInt: ResolvedType = new ResolvedType(builtinIntType);

export const builtinFloatType = builtinNumberTypeMap.get('float')!;

export const resolvedBuiltinFloat: ResolvedType = new ResolvedType(builtinFloatType);

export const builtinDoubleType = builtinNumberTypeMap.get('double')!;

export const resolvedBuiltinDouble: ResolvedType = new ResolvedType(builtinDoubleType);

function assignBuiltinNumberType(key: string): SymbolType {
    const type = builtinNumberTypeMap.get(key);
    if (type !== undefined) return type;
    assert(false);
}

export const builtinBoolType: SymbolType = createBuiltinType(createVirtualToken(TokenKind.Reserved, 'bool'));

export const resolvedBuiltinBool: ResolvedType = new ResolvedType(builtinBoolType);

export const builtinVoidType: SymbolType = createBuiltinType(createVirtualToken(TokenKind.Reserved, 'void'));

export const builtinAnyType: SymbolType = createBuiltinType(createVirtualToken(TokenKind.Reserved, '?'));

export const builtinAutoType: SymbolType = createBuiltinType(createVirtualToken(TokenKind.Reserved, 'auto'));

export function tryGetBuiltInType(token: ParserToken): SymbolType | undefined {
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
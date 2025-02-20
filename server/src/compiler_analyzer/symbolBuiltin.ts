import {ParserToken} from "../compiler_parser/parserToken";
import {createSymbolScope} from "./symbolScope";
import {createVirtualToken} from "../compiler_tokenizer/tokenUtils";
import {TokenKind} from "../compiler_tokenizer/tokens";
import {numberTypeSet} from "../compiler_tokenizer/tokenReservedWords";
import {PrimitiveType, SymbolType} from "./symbols";
import assert = require("node:assert");
import {ResolvedType} from "./resolvedType";

function createBuiltinType(virtualToken: ParserToken, name: PrimitiveType): SymbolType {
    return SymbolType.create({
        declaredPlace: virtualToken, // The built-in type uses a virtual token
        declaredScope: createSymbolScope(undefined, undefined, ''),
        definitionSource: name,
        membersScope: undefined,
    } );
}

const builtinNumberTypeMap: Map<string, SymbolType> = (() => {
    const map = new Map<string, SymbolType>();
    for (const name of numberTypeSet) {
        map.set(name, createBuiltinType(createVirtualToken(TokenKind.Reserved, name), PrimitiveType.Number));
    }
    return map;
})();

export const builtinStringType: SymbolType = createBuiltinType(createVirtualToken(TokenKind.String, 'string'), PrimitiveType.String);

export const resolvedBuiltinString: ResolvedType = {symbolType: builtinStringType, sourceScope: undefined};

export const builtinIntType = builtinNumberTypeMap.get('int')!;

export const resolvedBuiltinInt: ResolvedType = {symbolType: builtinIntType, sourceScope: undefined};

export const builtinFloatType = builtinNumberTypeMap.get('float')!;

export const resolvedBuiltinFloat: ResolvedType = {symbolType: builtinFloatType, sourceScope: undefined};

export const builtinDoubleType = builtinNumberTypeMap.get('double')!;

export const resolvedBuiltinDouble: ResolvedType = {symbolType: builtinDoubleType, sourceScope: undefined};

function assignBuiltinNumberType(key: string): SymbolType {
    const type = builtinNumberTypeMap.get(key);
    if (type !== undefined) return type;
    assert(false);
}

export const builtinBoolType: SymbolType = createBuiltinType(createVirtualToken(TokenKind.Reserved, 'bool'), PrimitiveType.Bool);

export const resolvedBuiltinBool: ResolvedType = {symbolType: builtinBoolType, sourceScope: undefined};

export const builtinVoidType: SymbolType = createBuiltinType(createVirtualToken(TokenKind.Reserved, 'void'), PrimitiveType.Void);

export const builtinAnyType: SymbolType = createBuiltinType(createVirtualToken(TokenKind.Reserved, '?'), PrimitiveType.Any);

export const builtinAutoType: SymbolType = createBuiltinType(createVirtualToken(TokenKind.Reserved, 'auto'), PrimitiveType.Auto);

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
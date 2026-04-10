import {IdentifierToken, TokenKind, TokenObject, ReservedToken} from '../compiler_tokenizer/tokenObject';
import {numberTypeSet} from '../compiler_tokenizer/reservedWord';
import {SymbolType} from './symbolObject';
import assert = require('node:assert');
import {ResolvedType} from './resolvedType';
import {SymbolScope} from './symbolScope';

function createBuiltinType(virtualToken: TokenObject): SymbolType {
    return SymbolType.create({
        identifierToken: virtualToken, // The built-in type uses a virtual token
        scopePath: [],
        linkedNode: undefined,
        membersScopePath: undefined
    });
}

const builtinNumberTypeMap: Map<string, SymbolType> = (() => {
    const map = new Map<string, SymbolType>();
    for (const name of numberTypeSet) {
        map.set(name, createBuiltinType(ReservedToken.createVirtual(name)));
    }

    return map;
})();

// export const builtinStringType: SymbolType = createBuiltinType(createVirtualToken(TokenKind.String, 'string'));

// export const resolvedBuiltinString: ResolvedType = new ResolvedType(builtinStringType);

export const builtinIntType = builtinNumberTypeMap.get('int')!;
export const resolvedBuiltinInt: ResolvedType = new ResolvedType(builtinIntType);

export const builtinUIntType = builtinNumberTypeMap.get('uint')!;
export const resolvedBuiltinUInt: ResolvedType = new ResolvedType(builtinUIntType);

export const builtinFloatType = builtinNumberTypeMap.get('float')!;
export const resolvedBuiltinFloat: ResolvedType = new ResolvedType(builtinFloatType);

export const builtinDoubleType = builtinNumberTypeMap.get('double')!;
export const resolvedBuiltinDouble: ResolvedType = new ResolvedType(builtinDoubleType);

function assignBuiltinNumberType(key: string): SymbolType {
    const type = builtinNumberTypeMap.get(key);
    if (type !== undefined) {
        return type;
    }

    assert(false);
}

export const builtinBoolType: SymbolType = createBuiltinType(ReservedToken.createVirtual('bool'));

export const resolvedBuiltinBool: ResolvedType = new ResolvedType(builtinBoolType);

export const builtinVoidType: SymbolType = createBuiltinType(ReservedToken.createVirtual('void'));

export const builtinAnyType: SymbolType = createBuiltinType(ReservedToken.createVirtual('?'));

export const builtinAutoType: SymbolType = createBuiltinType(ReservedToken.createVirtual('auto'));

export function tryGetBuiltinType(token: TokenObject): SymbolType | undefined {
    if (token.kind !== TokenKind.Reserved) {
        return undefined;
    }

    const identifier = token.text;
    if (identifier === 'bool') {
        return builtinBoolType;
    } else if (identifier === 'void') {
        return builtinVoidType;
    } else if (identifier === '?') {
        return builtinAnyType;
    } else if (identifier === 'auto') {
        return builtinAutoType;
    } else if (token.isReservedToken() && token.property.isNumber) {
        return assignBuiltinNumberType(identifier);
    }

    return undefined;
}

export const builtinThisToken = IdentifierToken.createVirtual('this');

export const builtinSetterValueToken = IdentifierToken.createVirtual('value');

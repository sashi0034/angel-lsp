import {ResolvedType, resolveTemplateType} from "./resolvedType";
import assert = require("node:assert");
import {resolveActiveScope} from "./symbolScope";
import {isDefinitionNodeClassOrInterface, SymbolFunction, SymbolType} from "./symbolObject";
import {NodeName} from "../compiler_parser/nodes";
import {resolvedBuiltinInt, resolvedBuiltinUInt} from "./symbolBuiltin";

export enum ConversionType {
    Implicit = 'Implicit', // asIC_IMPLICIT_CONV
    ExplicitRefCast = 'ExplicitRefCast', // asIC_EXPLICIT_REF_CAST
    ExplicitValueCast = 'ExplicitValue', // asIC_EXPLICIT_VAL_CAST
}

enum ConversionConst {
    NoConv = 0,
    ConstConv = 1,
    EnumSameSizeConv = 2,
    EnumDiffSizeConv = 3,
    PrimitiveSizeUpConv = 4,
    PrimitiveSizeDownConv = 5,
    SignedToUnsignedConv = 6,
    UnsignedToSignedConv = 7,
    IntToFloatConv = 8,
    FloatToIntConv = 9,
    RefConv = 10,
    ObjToPrimitiveConv = 12,
    ToObjectConv = 14,
    VariableConv = 16,

    Unknown = 255,
}

export function evaluateConversionCost(
    src: ResolvedType | undefined,
    dest: ResolvedType | undefined,
    // type: ConversionType = ConversionType.Implicit // TODO?
): ConversionConst | undefined {
    src = normalizeType(src);
    dest = normalizeType(dest);

    if (src === undefined || dest === undefined) return ConversionConst.Unknown;

    const srcTypeOrFunc = src.typeOrFunc;
    const destTypeOrFunc = dest.typeOrFunc;

    // Template types must be the same
    if (areTemplateTypesEqual(src, dest) === false) return undefined;

    // Source or destination is a function type
    if (srcTypeOrFunc.isFunction() || destTypeOrFunc.isFunction()) {
        if (!srcTypeOrFunc.isFunction() || !destTypeOrFunc.isFunction()) return undefined;

        return areFunctionsEqual(srcTypeOrFunc, destTypeOrFunc) ? ConversionConst.RefConv : undefined;
    }

    const srcType: SymbolType = srcTypeOrFunc;
    const destType: SymbolType = destTypeOrFunc;

    // FIXME: Handle init list?

    if (srcType.identifierText === 'void') return ConversionConst.NoConv;

    // FIXME?
    if (srcType.identifierText === '?') return ConversionConst.VariableConv;
    if (srcType.identifierText === 'auto') return ConversionConst.VariableConv;

    if (destType.isPrimitiveOrEnum()) {
        // Destination is a primitive type
        if (srcType.isPrimitiveOrEnum()) {
            // Source is a primitive type
            return evaluateConvPrimitiveToPrimitive(src, dest);
        } else {
            // Source is an object type
            return evaluateConvObjectToPrimitive(src, dest);
        }
    } else {
        // Destination is an object type defined by a user
        if (srcType.isPrimitiveOrEnum()) {
            // Source is a primitive type
            return evaluateConvPrimitiveToObject(src, dest);
        } else {
            // Source is an object type
            return evaluateConvObjectToObject(src, dest);
        }
    }
}

function normalizeType(type: ResolvedType | undefined) {
    if (type === undefined) return undefined;

    if (type.typeOrFunc.isType() && type.typeOrFunc.isTypeParameter) {
        // e.g., when the type is 'T' in 'array<T>', 'T' should be replaced with 'int' in the context of 'array<int>'
        return resolveTemplateType(type.templateTranslator, type);
    }

    // We use int and uint instead of int32 and uint32 respectively here.
    if (type.identifierText === 'int32') return resolvedBuiltinInt;

    if (type.identifierText === 'uint32') return resolvedBuiltinUInt;

    return type;
}

// -----------------------------------------------
// Primitive to Primitive
// as_compiler.cpp: ImplicitConvPrimitiveToPrimitive

const numberSizeInBytes = new Map<string, number>([
    ['double', 8],
    ['float', 4],
    ['int64', 8],
    ['uint64', 8],
    ['int', 4],
    ['uint', 4],
    ['int16', 2],
    ['uint16', 2],
    ['int8', 1],
    ['uint8', 1],

    // Note: int32 and uint32 are normalized to int and uint respectively at the beginning of the evaluation.
]);

const sizeof_int32 = 4;

function evaluateConvPrimitiveToPrimitive(
    src: ResolvedType,
    dest: ResolvedType,
) {
    // FIXME: Check a primitive is const or not?
    const srcType = src.typeOrFunc;
    const destType = dest.typeOrFunc;

    assert(srcType.isType() && destType.isType());
    assert((srcType.isPrimitiveOrEnum() || destType.isPrimitiveOrEnum()));

    if (srcType.equals(destType)) {
        return ConversionConst.NoConv;
    } else if (srcType.isEnumType() && destType.isEnumType()) {
        // FIXME: Handle different enum types but same identifier such as 'enum A::Red' and 'enum B::Red'

        // Mismatches enum types
        return undefined;
    }

    if (src.identifierText === 'bool' || dest.identifierText === 'bool') {
        // Cannot convert bool to any other type (If both are bool, it is already handled by the above condition)
        return undefined;
    }

    const srcText: string = src.identifierText;
    const destText: string = dest.identifierText;

    const srcToken = srcType.identifierToken;
    const destToken = destType.identifierToken;

    const srcProperty = srcToken.isReservedToken() ? srcToken.property : undefined;
    const destProperty = destToken.isReservedToken() ? destToken.property : undefined;

    // Get the size of the source and destination types. Enum values are treated as int32 for now.
    const srcBytes = numberSizeInBytes.get(srcText) ?? sizeof_int32;
    const destBytes = numberSizeInBytes.get(destText) ?? sizeof_int32;

    let cost = ConversionConst.NoConv;
    if ((srcProperty?.isFloat || srcProperty?.isDouble) && (destProperty?.isSignedInteger || destProperty?.isUnsignedInteger)) {
        cost = ConversionConst.FloatToIntConv;
    } else if ((srcProperty?.isSignedInteger || srcProperty?.isUnsignedInteger) && (destProperty?.isFloat || destProperty?.isDouble)) {
        cost = ConversionConst.IntToFloatConv;
    } else if (srcType.isEnumType() && destProperty?.isSignedInteger && srcBytes === destBytes) {
        cost = ConversionConst.EnumSameSizeConv;
    } else if (srcType.isEnumType() && destProperty?.isSignedInteger && srcBytes !== destBytes) {
        cost = ConversionConst.EnumDiffSizeConv;
    } else if (srcProperty?.isSignedInteger && destProperty?.isUnsignedInteger) {
        cost = ConversionConst.SignedToUnsignedConv;
    } else if (srcProperty?.isUnsignedInteger && destProperty?.isSignedInteger) {
        cost = ConversionConst.UnsignedToSignedConv;
    } else if (srcBytes < destBytes) {
        cost = ConversionConst.PrimitiveSizeUpConv;
    } else if (srcBytes > destBytes) {
        cost = ConversionConst.PrimitiveSizeDownConv;
    }

    return cost;
}

// -----------------------------------------------
// Object to Primitive
// as_compiler.cpp: ImplicitConvObjectToPrimitive

const numberConversionCostTable = new Map<string, string[]>([
    ['double', ['float', 'int64', 'uint64', 'int', 'uint', 'int16', 'uint16', 'int8', 'uint8']],
    ['float', ['double', 'int64', 'uint64', 'int', 'uint', 'int16', 'uint16', 'int8', 'uint8']],
    ['int64', ['uint64', 'int', 'uint', 'int16', 'uint16', 'int8', 'uint8', 'double', 'float']],
    ['uint64', ['int64', 'uint', 'int', 'uint16', 'int16', 'uint8', 'int8', 'double', 'float']],
    ['int', ['uint', 'int64', 'uint64', 'int16', 'uint16', 'int8', 'uint8', 'double', 'float']],
    ['uint', ['int', 'uint64', 'int64', 'uint16', 'int16', 'uint8', 'int8', 'double', 'float']],
    ['int16', ['uint16', 'int', 'uint', 'int64', 'uint64', 'int8', 'uint8', 'double', 'float']],
    ['uint16', ['int16', 'uint', 'int', 'uint64', 'int64', 'uint8', 'int8', 'double', 'float']],
    ['int8', ['uint8', 'int16', 'uint16', 'int', 'uint', 'int64', 'uint64', 'double', 'float']],
    ['uint8', ['int8', 'uint16', 'int16', 'uint', 'int', 'uint64', 'int64', 'double', 'float']],
]);

function evaluateConvObjectToPrimitive(src: ResolvedType, dest: ResolvedType): ConversionConst | undefined {
    const srcType = src.typeOrFunc;
    const destType = dest.typeOrFunc;

    assert(srcType.isType() && destType.isType());
    assert((srcType.isPrimitiveOrEnum() === false || destType.isPrimitiveOrEnum()));

    // FIXME: An explicit handle cannot be converted to a primitive

    // FIXME: Consider ConversionType

    const convFuncList: SymbolFunction[ ] = [];
    const srcMembers = resolveActiveScope(srcType.scopePath).symbolTable.values();
    for (const methodHolder of srcMembers) {
        if (methodHolder.isFunctionHolder() && ['opConv', 'opImplConv'].includes(methodHolder.identifierText)
        ) {
            convFuncList.push(...methodHolder.toList());
        }
    }

    let selectedConvFunc: SymbolFunction | undefined = undefined;
    if (destType.isNumberType()) {
        // Find the best matching cast operator
        const tableRow = numberConversionCostTable.get(dest.identifierText);
        assert(tableRow !== undefined);

        for (const nextType of tableRow) {
            for (const convFunc of convFuncList) {
                if (convFunc.returnType?.identifierText === nextType) {
                    selectedConvFunc = convFunc;
                    break;
                }
            }

            if (selectedConvFunc !== undefined) break;
        }
    } else {
        // Only accept the exact conversion for non-math types
        for (const convFunc of convFuncList) {
            const returnType = convFunc.returnType?.typeOrFunc;
            if (returnType?.isVariable() === false) continue;
            if (returnType?.identifierToken.equals(destType.identifierToken)) {
                selectedConvFunc = convFunc;
                break;
            }
        }
    }

    if (selectedConvFunc === undefined) return undefined;

    const returnType = selectedConvFunc.returnType;
    assert(returnType !== undefined);

    return ConversionConst.ObjToPrimitiveConv + (evaluateConvObjectToPrimitive(returnType, dest) ?? 0);

    // FIXME: Add more process?
}

// -----------------------------------------------
// Primitive to Object
// as_compiler.cpp: ImplicitConvPrimitiveToObject

function evaluateConvPrimitiveToObject(src: ResolvedType, dest: ResolvedType): ConversionConst | undefined {
    const srcType = src.typeOrFunc;
    const destType = dest.typeOrFunc;

    assert(srcType.isType() && destType.isType());
    assert(srcType.isPrimitiveOrEnum() && destType.isPrimitiveOrEnum() === false);

    return evaluateConversionByConstructor(src, dest);
}

// -----------------------------------------------
// Object to Object
// as_compiler.cpp: ImplicitConvObjectToObject

function evaluateConvObjectToObject(src: ResolvedType, dest: ResolvedType): ConversionConst | undefined {
    const srcType = src.typeOrFunc;
    const destType = dest.typeOrFunc;

    assert(srcType.isType() && destType.isType());
    assert(srcType.isPrimitiveOrEnum() === false && destType.isPrimitiveOrEnum() === false);

    if (srcType.linkedNode === destType.linkedNode) return ConversionConst.NoConv;

    // FIXME?
    if (canDownCast(srcType, destType)) return ConversionConst.ToObjectConv;

    const constByConstructor = evaluateConversionByConstructor(src, dest);
    if (constByConstructor !== undefined) return constByConstructor;

    return undefined;
}

// -----------------------------------------------
// Helper functions

function evaluateConversionByConstructor(src: ResolvedType, dest: ResolvedType): ConversionConst | undefined {
    const srcType = src.typeOrFunc;
    const destType = dest.typeOrFunc;

    assert(srcType.isType() && destType.isType());

    const destScope = resolveActiveScope(destType.scopePath);

    // Search for the constructor of the given type from the scope to which the given type belongs.
    const constructorScope = destScope.lookupScope(destType.identifierText);
    if (constructorScope?.linkedNode?.nodeName !== NodeName.Class) return undefined;

    // Search for the constructor of the given type from the scope of the type itself.
    const constructorHolder = constructorScope.lookupSymbol(destType.identifierText);
    if (constructorHolder === undefined || constructorHolder?.isFunctionHolder() === false) return undefined;

    for (const constructor of constructorHolder.toList()) {
        // The constructor should be one argument.
        if (constructor.parameterTypes.length !== 1) continue;

        // The parameter of the constructor must be not a function but a type.
        const paramType = constructor.parameterTypes[0];
        if (paramType === undefined || paramType.typeOrFunc.isType() === false) continue;

        // Prevent infinite recursion.
        if (paramType === dest) continue;

        // Source type must be convertible to the parameter type of the constructor.
        const cost = evaluateConversionCost(src, paramType);
        if (cost === undefined) continue;

        return ConversionConst.ToObjectConv; // FIXME?
    }

    return undefined;
}

export function canDownCast(srcType: SymbolType, destType: SymbolType): boolean {
    const srcNode = srcType.linkedNode;
    if (srcType.isPrimitiveType()) return false;

    if (srcType.linkedNode === destType.linkedNode) return true;

    if (isDefinitionNodeClassOrInterface(srcNode)) {
        if (srcType.baseList === undefined) return false;

        for (const srcBase of srcType.baseList) {
            if (srcBase?.typeOrFunc === undefined) continue;
            if (srcBase.typeOrFunc.isType() === false) continue;

            if (canDownCast(srcBase.typeOrFunc, destType)) return true;
        }
    }

    return false;
}

function areFunctionsEqual(src: SymbolFunction, dest: SymbolFunction): boolean {
    if (src.parameterTypes.length !== dest.parameterTypes.length) return false;

    for (let i = 0; i < src.parameterTypes.length; i++) {
        const srcParam = normalizeType(src.parameterTypes[i]);
        const destParam = normalizeType(dest.parameterTypes[i]);

        if (srcParam === undefined || destParam === undefined) continue; // FIXME?

        if (srcParam.typeOrFunc.equals(destParam.typeOrFunc) === false) return false;
        // if (areTypesEqual(srcParam, destParam) === false) return false;
    }

    return true;
}

function areTemplateTypesEqual(src: ResolvedType, dest: ResolvedType): boolean {
    if (src.typeOrFunc.isFunction() || dest.typeOrFunc.isFunction()) {
        // TODO: Function template types
        return true;
    }

    const srcType = src.typeOrFunc;
    const destType = dest.typeOrFunc;

    if (srcType.templateTypes?.length !== destType.templateTypes?.length) {
        // The number of template types is different.
        return false;
    } else if (srcType.templateTypes === undefined || destType.templateTypes === undefined
        || srcType.templateTypes.length == 0
    ) {
        // Both types do not have template types.
        return true;
    }

    const srcTemplateTypes = srcType.templateTypes?.map(token => src.templateTranslator?.get(token));
    const destTemplates = destType.templateTypes?.map(token => dest.templateTranslator?.get(token));

    // Check if the template types are the same respectively.
    for (let i = 0; i < srcTemplateTypes.length; i++) {
        const srcParam = normalizeType(srcTemplateTypes[i]);
        const destParam = normalizeType(destTemplates[i]);

        if (srcParam === undefined || destParam === undefined) continue; // FIXME?

        if (srcParam.typeOrFunc.equals(destParam.typeOrFunc) === false) return false;

        if (areTemplateTypesEqual(srcParam, destParam) === false) return false;
    }

    return true;
}

/**
 * Check if the source type can be converted to the destination type.
 * @param src
 * @param dest
 */
import {ResolvedType} from "./resolvedType";
import assert = require("node:assert");

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
    type: ConversionType = ConversionType.Implicit
) {
    if (src === undefined || dest === undefined) return ConversionConst.Unknown;

    const srcType = src.symbolType;
    const destType = dest.symbolType;

    if (srcType.isFunction() || destType.isFunction()) {
        // TODO
        return ConversionConst.NoConv;
    }

    // FIXME: Handle init list?

    if (srcType.identifierText === 'void') return ConversionConst.NoConv;

    // FIXME?
    if (srcType.identifierText === '?') return ConversionConst.VariableConv;
    if (srcType.identifierText === 'auto') return ConversionConst.VariableConv;

    if (destType.isNumberOrEnum()) {
        // Destination is a primitive type
        if (srcType.isNumberOrEnum()) {
            // Source is a primitive type
            return evaluateConvPrimitiveToPrimitive(src, dest, type);
        } else {
            // Source is an object type
            return evaluateConvObjectToPrimitive(src, dest, type);
        }
    } else {
        // Destination is a user-defined type
        // TODO
    }

    return ConversionConst.NoConv;
}

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
]);

const sizeof_int32 = 4;

// See: ImplicitConvPrimitiveToPrimitive in as_compiler.cpp
function evaluateConvPrimitiveToPrimitive(
    src: ResolvedType,
    dest: ResolvedType,
    type: ConversionType,
) {
    // FIXME: Check a primitive is const or not?
    const srcType = src.symbolType;
    const destType = dest.symbolType;
    assert(srcType.isType() && destType.isType());
    assert(srcType.isNumberOrEnum() && destType.isNumberOrEnum());

    if (destType.equals(srcType)) return ConversionConst.NoConv;

    const srcText: string = src.identifierText;
    const destText: string = dest.identifierText;

    const srcToken = srcType.defToken;
    const destToken = destType.defToken;

    // if (srcToken.isReservedToken() === false || destToken.isReservedToken() === false) return ConversionConst.NoConv;

    // FIXME: Handle enum here?

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

// TODO: Use this for evaluating object to primitive
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

// See: ImplicitConvObjectToPrimitive in as_compiler.cpp
function evaluateConvObjectToPrimitive(src: ResolvedType, dest: ResolvedType, type: ConversionType) {
    return ConversionConst.ObjToPrimitiveConv;
}


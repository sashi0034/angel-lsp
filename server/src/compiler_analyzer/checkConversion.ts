/**
 * Check if the source type can be converted to the destination type.
 * @param src
 * @param dest
 */
import {ResolvedType} from "./resolvedType";
import {SymbolFunction} from "./symbolObject";

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

    // if (destType.isSystemType()) {
    //     // Destination is a primitive type
    //     if (srcType.isSystemType()) {
    //         // Source is a primitive type
    //         return evaluateConvPrimitiveToPrimitive(src, dest, type);
    //     } else {
    //         // Source is an object type
    //         return evaluateConvObjectToPrimitive(src, dest, type);
    //     }
    // } else {
    //     // Destination is a user-defined type
    //     // TODO
    // }

    return ConversionConst.NoConv;
}

function evaluateConvPrimitiveToPrimitive(
    src: ResolvedType,
    dest: ResolvedType,
    type: ConversionType,
) {
    // const srcType = src.symbolType.identifierText;
    return ConversionConst.PrimitiveSizeUpConv;
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

function evaluateConvObjectToPrimitive(src: ResolvedType, dest: ResolvedType, type: ConversionType) {
    // TODO
    return ConversionConst.ObjToPrimitiveConv;
}

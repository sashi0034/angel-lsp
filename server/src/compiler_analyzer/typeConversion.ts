import {ResolvedType} from './resolvedType';
import {getActiveGlobalScope, resolveActiveScope} from './symbolScope';
import {isNodeClassOrInterface, FunctionSymbol, TypeSymbol} from './symbolObject';
import {NodeName} from '../compiler_parser/nodes';
import {resolvedBuiltinInt, resolvedBuiltinUInt} from './builtinType';
import assert = require('node:assert');

export enum ConversionType {
    Implicit = 'Implicit', // asIC_IMPLICIT_CONV
    ExplicitRefCast = 'ExplicitRefCast', // asIC_EXPLICIT_REF_CAST
    ExplicitValueCast = 'ExplicitValue' // asIC_EXPLICIT_VAL_CAST
}

enum ConversionCost {
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
    // RefConv + ConstConv = 11
    ObjToPrimitiveConv = 12,
    // ObjToPrimitiveConv + ConstConv = 13
    ToObjectConv = 14,
    // ToObjectConv + ConstConv = 15
    VariableConv = 16,

    Unknown = 255
}

export interface ConversionEvaluation {
    cost: ConversionCost;
    resolvedOverload?: FunctionSymbol;
    lambdaTarget?: ResolvedType;
}

export function canTypeConvert(
    src: ResolvedType | undefined,
    dest: ResolvedType | undefined
    // type: ConversionType = ConversionType.Implicit // TODO?
): boolean {
    const evaluation = evaluateTypeConversion(src, dest);
    return evaluation !== undefined;
}

/**
 * Evaluate the cost of converting the source type to the destination type.
 */
export function evaluateTypeConversion(
    src: ResolvedType | undefined,
    dest: ResolvedType | undefined
    // type: ConversionType = ConversionType.Implicit // TODO?
): ConversionEvaluation | undefined {
    const initialState: EvaluationState = {
        allowObjectConstruct: true
    };

    return evaluateTypeConversionInternal(initialState, src, dest);
}

interface EvaluationState {
    allowObjectConstruct: boolean;
}

function evaluateTypeConversionInternal(
    state: EvaluationState,
    src: ResolvedType | undefined,
    dest: ResolvedType | undefined
    // type: ConversionType = ConversionType.Implicit // TODO?
): ConversionEvaluation | undefined {
    src = normalizeType(src);
    dest = normalizeType(dest);

    if (src === undefined || dest === undefined) {
        return {cost: ConversionCost.Unknown};
    }

    if (src.isNullType() || dest.isNullType()) {
        return evaluateNullConversion(src, dest);
    }

    const srcTypeOrFunc = src.typeOrFunc;
    const destTypeOrFunc = dest.typeOrFunc;

    if (src.lambdaInfo !== undefined) {
        return evaluateLambdaConversion(src, dest);
    }

    if (destTypeOrFunc.isType()) {
        // Any type can be converted to a var/auto type
        if (dest.isAnyType() || dest.isAutoType()) {
            return {cost: ConversionCost.VariableConv};
        }
    }

    // Template arguments must be the same.
    if (areTemplateArgumentsEqual(src, dest) === false) {
        return undefined;
    }

    // Source or destination is a function type
    if (destTypeOrFunc.isFunction()) {
        if (!srcTypeOrFunc.isFunction()) {
            return undefined;
        }

        const srcOverloadList = collectFunctionOverloads(srcTypeOrFunc);
        for (const srcOverload of srcOverloadList) {
            if (areFunctionsEqual(srcOverload, destTypeOrFunc)) {
                return {cost: ConversionCost.RefConv, resolvedOverload: srcOverload};
            }
        }

        return undefined;
    }

    const destType: TypeSymbol = destTypeOrFunc; // <-- destTypeOrFunc is guaranteed to be a type here

    if (srcTypeOrFunc.isFunction()) {
        return undefined;
    }

    const srcType: TypeSymbol = srcTypeOrFunc; // <-- srcTypeOrFunc is guaranteed to be a type here

    // FIXME: Handle init list?

    // No conversion from void to any other type
    if (srcType.identifierText === 'void') {
        return {cost: ConversionCost.NoConv};
    }

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
            return evaluateConvPrimitiveToObject(state, src, dest);
        } else {
            // Source is an object type
            return evaluateConvObjectToObject(state, src, dest);
        }
    }
}

function evaluateLambdaConversion(src: ResolvedType, dest: ResolvedType): ConversionEvaluation | undefined {
    assert(src.lambdaInfo !== undefined);

    const destTypeOrFunc = dest.typeOrFunc;
    if (!destTypeOrFunc.isFunction() || destTypeOrFunc.linkedNode.nodeName !== NodeName.FuncDef) {
        return undefined;
    }

    if (src.lambdaInfo.node.paramList.length !== destTypeOrFunc.parameterTypes.length) {
        return undefined;
    }

    for (let i = 0; i < src.lambdaInfo.parameterTypes.length; i++) {
        const explicitLambdaParam = normalizeType(src.lambdaInfo.parameterTypes[i]);
        const expectedParam = normalizeType(destTypeOrFunc.parameterTypes[i]);
        if (explicitLambdaParam === undefined || expectedParam === undefined) {
            continue;
        }

        if (!explicitLambdaParam.equals(expectedParam)) {
            return undefined;
        }
    }

    return {cost: ConversionCost.RefConv, lambdaTarget: dest};
}

// -----------------------------------------------
// A primitive to a primitive
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
    ['uint8', 1]

    // Note: int32 and uint32 are normalized to int and uint respectively at the beginning of the evaluation.
]);

const sizeof_int32 = 4;

function evaluateConvPrimitiveToPrimitive(src: ResolvedType, dest: ResolvedType) {
    // FIXME: Check a primitive is const or not?
    const srcType = src.typeOrFunc;
    const destType = dest.typeOrFunc;

    assert(srcType.isType() && destType.isType());
    assert(srcType.isPrimitiveOrEnum() || destType.isPrimitiveOrEnum());

    if (srcType.equals(destType)) {
        return {cost: ConversionCost.NoConv};
    } else if (srcType.isEnumType() && destType.isEnumType()) {
        // Resolve ambiguous enum members
        for (const candidate of srcType.multipleEnumCandidates ?? []) {
            if (candidate.type?.typeOrFunc.equals(destType)) {
                return {cost: ConversionCost.NoConv};
            }
        }

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

    let cost = ConversionCost.NoConv;
    if (
        (srcProperty?.isFloat || srcProperty?.isDouble) &&
        (destProperty?.isSignedInteger || destProperty?.isUnsignedInteger)
    ) {
        cost = ConversionCost.FloatToIntConv;
    } else if (
        (srcProperty?.isSignedInteger || srcProperty?.isUnsignedInteger) &&
        (destProperty?.isFloat || destProperty?.isDouble)
    ) {
        cost = ConversionCost.IntToFloatConv;
    } else if (srcType.isEnumType() && destProperty?.isSignedInteger && srcBytes === destBytes) {
        cost = ConversionCost.EnumSameSizeConv;
    } else if (srcType.isEnumType() && destProperty?.isSignedInteger && srcBytes !== destBytes) {
        cost = ConversionCost.EnumDiffSizeConv;
    } else if (srcProperty?.isSignedInteger && destProperty?.isUnsignedInteger) {
        cost = ConversionCost.SignedToUnsignedConv;
    } else if (srcProperty?.isUnsignedInteger && destProperty?.isSignedInteger) {
        cost = ConversionCost.UnsignedToSignedConv;
    } else if (srcBytes < destBytes) {
        cost = ConversionCost.PrimitiveSizeUpConv;
    } else if (srcBytes > destBytes) {
        cost = ConversionCost.PrimitiveSizeDownConv;
    }

    return {cost};
}

// -----------------------------------------------
// An object to a primitive
// as_compiler.cpp: ImplicitConvObjectToPrimitive

const numberConversionCostTable = new Map<string, string[]>([
    ['double', ['double', 'float', 'int64', 'uint64', 'int', 'uint', 'int16', 'uint16', 'int8', 'uint8']],
    ['float', ['float', 'double', 'int64', 'uint64', 'int', 'uint', 'int16', 'uint16', 'int8', 'uint8']],
    ['int64', ['int64', 'uint64', 'int', 'uint', 'int16', 'uint16', 'int8', 'uint8', 'double', 'float']],
    ['uint64', ['uint64', 'int64', 'uint', 'int', 'uint16', 'int16', 'uint8', 'int8', 'double', 'float']],
    ['int', ['int', 'uint', 'int64', 'uint64', 'int16', 'uint16', 'int8', 'uint8', 'double', 'float']],
    ['uint', ['uint', 'int', 'uint64', 'int64', 'uint16', 'int16', 'uint8', 'int8', 'double', 'float']],
    ['int16', ['int16', 'uint16', 'int', 'uint', 'int64', 'uint64', 'int8', 'uint8', 'double', 'float']],
    ['uint16', ['uint16', 'int16', 'uint', 'int', 'uint64', 'int64', 'uint8', 'int8', 'double', 'float']],
    ['int8', ['int8', 'uint8', 'int16', 'uint16', 'int', 'uint', 'int64', 'uint64', 'double', 'float']],
    ['uint8', ['uint8', 'int8', 'uint16', 'int16', 'uint', 'int', 'uint64', 'int64', 'double', 'float']]
]);

function evaluateConvObjectToPrimitive(src: ResolvedType, dest: ResolvedType): ConversionEvaluation | undefined {
    const srcType = src.typeOrFunc;
    const destType = dest.typeOrFunc;

    assert(srcType.isType() && destType.isType());
    assert(srcType.isPrimitiveOrEnum() === false || destType.isPrimitiveOrEnum());

    // FIXME: Consider ConversionType
    const convFuncList = collectOpConvFunctions(srcType);

    let selectedConvFunc: FunctionSymbol | undefined = undefined;
    if (destType.isNumberType()) {
        // Find the best matching cast operator
        const tableRow = numberConversionCostTable.get(dest.identifierText);
        assert(tableRow !== undefined);

        for (const nextType of tableRow) {
            for (const convFunc of convFuncList) {
                if (normalizeType(convFunc.returnType)?.identifierText === nextType) {
                    selectedConvFunc = convFunc;
                    break;
                }
            }

            if (selectedConvFunc !== undefined) {
                break;
            }
        }
    } else {
        // Only accept the exact conversion for non-math types
        for (const convFunc of convFuncList) {
            const returnType = normalizeType(convFunc.returnType);
            if (returnType?.typeOrFunc.equals(destType)) {
                selectedConvFunc = convFunc;
                break;
            }
        }
    }

    if (selectedConvFunc === undefined) {
        return undefined;
    }

    const returnType = selectedConvFunc.returnType;
    assert(returnType !== undefined);

    return {cost: ConversionCost.ObjToPrimitiveConv + (evaluateConvObjectToPrimitive(returnType, dest)?.cost ?? 0)};

    // FIXME: Add more process?
}

// -----------------------------------------------
// A primitive to an object
// as_compiler.cpp: ImplicitConvPrimitiveToObject

function evaluateConvPrimitiveToObject(
    state: EvaluationState,
    src: ResolvedType,
    dest: ResolvedType
): ConversionEvaluation | undefined {
    const srcType = src.typeOrFunc;
    const destType = dest.typeOrFunc;

    assert(srcType.isType() && destType.isType());
    assert(srcType.isPrimitiveOrEnum() && destType.isPrimitiveOrEnum() === false);

    return evaluateConversionByConstructor(state, src, dest);
}

// -----------------------------------------------
// An object to An object
// as_compiler.cpp: ImplicitConvObjectToObject

function evaluateConvObjectToObject(
    state: EvaluationState,
    src: ResolvedType,
    dest: ResolvedType
): ConversionEvaluation | undefined {
    const srcType = src.typeOrFunc;
    const destType = dest.typeOrFunc;

    assert(srcType.isType() && destType.isType());
    assert(srcType.isPrimitiveOrEnum() === false && destType.isPrimitiveOrEnum() === false);

    // Check if these are identical
    if (srcType.equals(destType)) {
        return {cost: ConversionCost.NoConv};
    }

    // FIXME?
    if (canDownCast(srcType, destType)) {
        return {cost: ConversionCost.ToObjectConv};
    }

    // Check the conversion using a construct with a single parameter.
    const constByConstructor = evaluateConversionByConstructor(state, src, dest);
    if (constByConstructor !== undefined) {
        return constByConstructor;
    }

    // Check the conversion using the opConv and opImpl function.
    const convFuncList = collectOpConvFunctions(srcType);
    for (const convFunc of convFuncList) {
        if (convFunc.returnType?.equals(dest)) {
            return {cost: ConversionCost.ToObjectConv};
        }
    }

    return undefined;
}

// -----------------------------------------------
// Helper functions

function evaluateNullConversion(src: ResolvedType, dest: ResolvedType): ConversionEvaluation | undefined {
    if (src.isNullType() && dest.isNullType()) {
        return {cost: ConversionCost.NoConv};
    }

    const nonNullType = src.isNullType() ? dest : src;
    if (nonNullType.isHandle === true) {
        return {cost: ConversionCost.RefConv};
    }

    return undefined;
}

export function normalizeType(type: ResolvedType | undefined) {
    if (type === undefined) {
        return undefined;
    }

    if (type.typeOrFunc.isType() && type.typeOrFunc.aliasTargetType !== undefined) {
        return normalizeType(type.cloneWithType(type.typeOrFunc.aliasTargetType));
    }

    // We use int and uint instead of int32 and uint32 respectively here.
    if (type.identifierText === 'int32') {
        return resolvedBuiltinInt.cloneWithHandle(type.isHandle);
    }

    if (type.identifierText === 'uint32') {
        return resolvedBuiltinUInt.cloneWithHandle(type.isHandle);
    }

    return type;
}

function evaluateConversionByConstructor(
    state: EvaluationState,
    src: ResolvedType,
    dest: ResolvedType
): ConversionEvaluation | undefined {
    if (!state.allowObjectConstruct) {
        return undefined;
    }

    const srcType = src.typeOrFunc;
    const destType = dest.typeOrFunc;

    assert(srcType.isType() && destType.isType());

    const destScope = resolveActiveScope(destType.scopePath);

    // Search for the constructor of the given type from the scope to which the given type belongs.
    const constructorScope = destScope.lookupScope(destType.identifierText);
    if (constructorScope?.linkedNode?.nodeName !== NodeName.Class) {
        return undefined;
    }

    // Search for the constructor of the given type from the scope of the type itself.
    const constructorHolder = constructorScope.lookupSymbol(destType.identifierText);
    if (constructorHolder === undefined || constructorHolder?.isFunctionHolder() === false) {
        return undefined;
    }

    for (const constructor of constructorHolder.toList()) {
        // The constructor should be one argument.
        if (constructor.parameterTypes.length !== 1) {
            continue;
        }

        // The parameter of the constructor must be not a function but a type.
        const paramType = constructor.parameterTypes[0];
        if (paramType === undefined || paramType.typeOrFunc.isType() === false) {
            continue;
        }

        // Prevent infinite recursion.
        if (paramType === dest) {
            continue;
        }

        assert(state.allowObjectConstruct); // because of the condition at the beginning of the function
        state.allowObjectConstruct = false; // To prevent infinite recursion

        // Source type must be convertible to the parameter type of the constructor.
        const cost = evaluateTypeConversionInternal(state, src, paramType);

        state.allowObjectConstruct = true;

        if (cost === undefined) {
            continue;
        }

        return {cost: ConversionCost.ToObjectConv + cost.cost}; // FIXME?
    }

    return undefined;
}

export function canDownCast(srcType: TypeSymbol, destType: TypeSymbol): boolean {
    const srcNode = srcType.linkedNode;
    if (srcType.isPrimitiveType()) {
        return false;
    }

    // Check if these are identical
    if (srcType.equals(destType)) {
        return true;
    }

    if (isNodeClassOrInterface(srcNode)) {
        if (srcType.baseList === undefined) {
            return false;
        }

        for (const srcBase of srcType.baseList) {
            if (srcBase?.typeOrFunc === undefined) {
                continue;
            }

            if (srcBase.typeOrFunc.isType() === false) {
                continue;
            }

            if (canDownCast(srcBase.typeOrFunc, destType)) {
                return true;
            }
        }
    }

    return false;
}

function collectFunctionOverloads(func: FunctionSymbol) {
    if (func.linkedNode.nodeName === NodeName.FuncDef) {
        return [func];
    }

    const overloadList: FunctionSymbol[] = [];
    const scope = getActiveGlobalScope().resolveScope(func.scopePath)?.lookupSymbol(func.identifierText);
    for (const symbol of scope?.toList() ?? []) {
        if (symbol.isFunction()) {
            overloadList.push(symbol);
        }
    }

    return overloadList;
}

function areFunctionsEqual(src: FunctionSymbol, dest: FunctionSymbol): boolean {
    if (src.parameterTypes.length !== dest.parameterTypes.length) {
        return false;
    }

    const srcReturnType = normalizeType(src.returnType);
    const destReturnType = normalizeType(dest.returnType);
    if (srcReturnType?.equals(destReturnType) === false) {
        return false;
    }

    for (let i = 0; i < src.parameterTypes.length; i++) {
        const srcParam = normalizeType(src.parameterTypes[i]);
        const destParam = normalizeType(dest.parameterTypes[i]);

        if (srcParam === undefined || destParam === undefined) {
            continue;
        }

        if (srcParam.equals(destParam) === false) {
            return false;
        }
    }

    return true;
}

function areTemplateArgumentsEqual(src: ResolvedType, dest: ResolvedType): boolean {
    if (src.typeOrFunc.isFunction() || dest.typeOrFunc.isFunction()) {
        // TODO: Function template arguments.
        return true;
    }

    const srcType = src.typeOrFunc;
    const destType = dest.typeOrFunc;

    if (srcType.templateParameters?.length !== destType.templateParameters?.length) {
        // The number of template arguments is different.
        return false;
    } else if (
        srcType.templateParameters === undefined ||
        destType.templateParameters === undefined ||
        srcType.templateParameters.length == 0
    ) {
        // Both types do not have template parameters.
        return true;
    }

    const srcTemplateArguments = src.getTemplateArguments();
    const destTemplateArguments = dest.getTemplateArguments();

    // Check if the template arguments are the same respectively.
    for (let i = 0; i < srcTemplateArguments.length; i++) {
        const srcArg = normalizeType(srcTemplateArguments[i]);
        const destArg = normalizeType(destTemplateArguments[i]);

        if (
            srcArg === undefined ||
            destArg === undefined ||
            srcArg.identifierText === '?' ||
            destArg.identifierText === '?'
        ) {
            continue; // FIXME?
        }

        if (srcArg.typeOrFunc.equals(destArg.typeOrFunc) === false) {
            return false;
        }

        if (srcArg.isHandle !== destArg.isHandle) {
            return false;
        }

        if (areTemplateArgumentsEqual(srcArg, destArg) === false) {
            return false;
        }
    }

    return true;
}

function collectOpConvFunctions(srcType: TypeSymbol | FunctionSymbol) {
    // TODO: Consider implicit or explicit

    const convFuncList: FunctionSymbol[] = [];
    const srcMembers =
        resolveActiveScope(srcType.scopePath).lookupScope(srcType.identifierText)?.symbolTable.values() ?? [];
    for (const methodHolder of srcMembers) {
        if (
            methodHolder.isFunctionHolder() &&
            [
                'opConv',
                'opImplConv',
                'opImplCast' // TODO: This opImplCast is incorrect. It needs to be handled with a dedicated handle.
            ].includes(methodHolder.identifierText)
        ) {
            convFuncList.push(...methodHolder.toList());
        }
    }

    return convFuncList;
}

import {ResolvedType} from './resolvedType';
import {getActiveGlobalScope, resolveActiveScope} from './symbolScope';
import {isNodeClassOrInterface, FunctionSymbol, TypeSymbol} from './symbolObject';
import {NodeName} from '../compiler_parser/nodeObject';
import {resolvedBuiltinInt, resolvedBuiltinUInt} from './builtinType';
import assert = require('node:assert');

export enum ConversionMode {
    Implicit = 'Implicit', // asIC_IMPLICIT_CONV
    ExplicitRefCast = 'ExplicitRefCast', // asIC_EXPLICIT_REF_CAST (for cast<Type>)
    ExplicitValueCast = 'ExplicitValueCast' // asIC_EXPLICIT_VAL_CAST (for Type(source))
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
    from: ResolvedType | undefined,
    to: ResolvedType | undefined,
    mode: ConversionMode = ConversionMode.Implicit
): boolean {
    const evaluation = evaluateTypeConversion(from, to, mode);
    return evaluation !== undefined;
}

/**
 * Evaluate the cost of converting the source type to the destination type.
 */
export function evaluateTypeConversion(
    from: ResolvedType | undefined,
    to: ResolvedType | undefined,
    mode: ConversionMode = ConversionMode.Implicit
): ConversionEvaluation | undefined {
    const initialState: EvaluationState = {
        allowObjectConstruct: true
    };

    return evaluateTypeConversionInternal(initialState, from, to, mode);
}

interface EvaluationState {
    allowObjectConstruct: boolean;
}

function evaluateTypeConversionInternal(
    state: EvaluationState,
    from: ResolvedType | undefined,
    to: ResolvedType | undefined,
    mode: ConversionMode = ConversionMode.Implicit
): ConversionEvaluation | undefined {
    from = normalizeType(from);
    to = normalizeType(to);

    if (from === undefined || to === undefined) {
        return {cost: ConversionCost.Unknown};
    }

    if (from.isNullType() || to.isNullType()) {
        return evaluateNullConversion(from, to);
    }

    const fromTypeOrFunc = from.typeOrFunc;
    const toTypeOrFunc = to.typeOrFunc;

    if (from.lambdaInfo !== undefined) {
        return evaluateLambdaConversion(from, to);
    }

    // No conversion from a const type to a non-const type if either the source or destination is a handle type. (e.g., `const MyObj@` to `MyObj@` or `const MyObj` to `MyObj`)
    if (from.isConst && !to.isConst && (from.handle !== undefined || to.handle !== undefined)) {
        return undefined;
    }

    if (toTypeOrFunc.isType()) {
        // Any type can be converted to a var/auto type
        if (to.isAnyType() || to.isAutoType()) {
            return {cost: ConversionCost.VariableConv};
        }
    }

    // Template arguments must be the same.
    if (areTemplateArgumentsEqual(from, to) === false) {
        return undefined;
    }

    // Source or destination is a function type
    if (toTypeOrFunc.isFunction()) {
        if (!fromTypeOrFunc.isFunction()) {
            return undefined;
        }

        const fromOverloadList = collectFunctionOverloads(fromTypeOrFunc);
        for (const fromOverload of fromOverloadList) {
            if (areFunctionsEqual(fromOverload, toTypeOrFunc)) {
                return {cost: ConversionCost.RefConv, resolvedOverload: fromOverload};
            }
        }

        return undefined;
    }

    const toType: TypeSymbol = toTypeOrFunc; // <-- toTypeOrFunc is guaranteed to be a type here

    if (fromTypeOrFunc.isFunction()) {
        return undefined;
    }

    const fromType: TypeSymbol = fromTypeOrFunc; // <-- fromTypeOrFunc is guaranteed to be a type here

    // FIXME: Handle init list?

    // No conversion from void to any other type
    if (fromType.identifierText === 'void') {
        return {cost: ConversionCost.NoConv};
    }

    if (toType.isPrimitiveOrEnum()) {
        // Destination is a primitive type
        if (fromType.isPrimitiveOrEnum()) {
            // Source is a primitive type
            return evaluateConvPrimitiveToPrimitive(from, to);
        } else {
            // Source is an object type
            return evaluateConvObjectToPrimitive(from, to, mode);
        }
    } else {
        // Destination is an object type defined by a user
        if (fromType.isPrimitiveOrEnum()) {
            // Source is a primitive type
            return evaluateConvPrimitiveToObject(state, from, to);
        } else {
            // Source is an object type
            return evaluateConvObjectToObject(state, from, to, mode);
        }
    }
}

function evaluateLambdaConversion(from: ResolvedType, to: ResolvedType): ConversionEvaluation | undefined {
    assert(from.lambdaInfo !== undefined);

    const toTypeOrFunc = to.typeOrFunc;
    if (!toTypeOrFunc.isFunction() || toTypeOrFunc.linkedNode.nodeName !== NodeName.FuncDef) {
        return undefined;
    }

    if (from.lambdaInfo.node.paramList.length !== toTypeOrFunc.parameterTypes.length) {
        return undefined;
    }

    for (let i = 0; i < from.lambdaInfo.parameterTypes.length; i++) {
        const explicitLambdaParam = normalizeType(from.lambdaInfo.parameterTypes[i]);
        const expectedParam = normalizeType(toTypeOrFunc.parameterTypes[i]);
        if (explicitLambdaParam === undefined || expectedParam === undefined) {
            continue;
        }

        if (!explicitLambdaParam.equals(expectedParam)) {
            return undefined;
        }
    }

    return {cost: ConversionCost.RefConv, lambdaTarget: to};
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

function evaluateConvPrimitiveToPrimitive(from: ResolvedType, to: ResolvedType) {
    // FIXME: Check a primitive is const or not?
    const fromType = from.typeOrFunc;
    const toType = to.typeOrFunc;

    assert(fromType.isType() && toType.isType());
    assert(fromType.isPrimitiveOrEnum() || toType.isPrimitiveOrEnum());

    if (fromType.equals(toType)) {
        return {cost: ConversionCost.NoConv};
    } else if (fromType.isEnumType() && toType.isEnumType()) {
        // Resolve ambiguous enum members
        for (const candidate of fromType.multipleEnumCandidates ?? []) {
            if (candidate.type?.typeOrFunc.equals(toType)) {
                return {cost: ConversionCost.NoConv};
            }
        }

        return undefined;
    }

    if (from.identifierText === 'bool' || to.identifierText === 'bool') {
        // Cannot convert bool to any other type (If both are bool, it is already handled by the above condition)
        return undefined;
    }

    const fromText: string = from.identifierText;
    const toText: string = to.identifierText;

    const fromToken = fromType.identifierToken;
    const toToken = toType.identifierToken;

    const fromProperty = fromToken.isReservedToken() ? fromToken.property : undefined;
    const toProperty = toToken.isReservedToken() ? toToken.property : undefined;

    // Get the size of the source and destination types. Enum values are treated as int32 for now.
    const fromBytes = numberSizeInBytes.get(fromText) ?? sizeof_int32;
    const toBytes = numberSizeInBytes.get(toText) ?? sizeof_int32;

    let cost = ConversionCost.NoConv;
    if (fromProperty?.isFloatingPoint && toProperty?.isIntegerType) {
        cost = ConversionCost.FloatToIntConv;
    } else if (fromProperty?.isIntegerType && toProperty?.isFloatingPoint) {
        cost = ConversionCost.IntToFloatConv;
    } else if (fromType.isEnumType() && toProperty?.isSignedInteger && fromBytes === toBytes) {
        cost = ConversionCost.EnumSameSizeConv;
    } else if (fromType.isEnumType() && toProperty?.isSignedInteger && fromBytes !== toBytes) {
        cost = ConversionCost.EnumDiffSizeConv;
    } else if (fromProperty?.isSignedInteger && toProperty?.isUnsignedInteger) {
        cost = ConversionCost.SignedToUnsignedConv;
    } else if (fromProperty?.isUnsignedInteger && toProperty?.isSignedInteger) {
        cost = ConversionCost.UnsignedToSignedConv;
    } else if (fromBytes < toBytes) {
        cost = ConversionCost.PrimitiveSizeUpConv;
    } else if (fromBytes > toBytes) {
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

function evaluateConvObjectToPrimitive(
    from: ResolvedType,
    to: ResolvedType,
    mode: ConversionMode = ConversionMode.Implicit
): ConversionEvaluation | undefined {
    const fromType = from.typeOrFunc;
    const toType = to.typeOrFunc;

    assert(fromType.isType() && toType.isType());
    assert(fromType.isPrimitiveOrEnum() === false || toType.isPrimitiveOrEnum());

    const convFuncList = collectConversionFunctions(fromType, mode);

    let selectedConvFunc: FunctionSymbol | undefined = undefined;
    if (toType.isNumberType()) {
        // Find the best matching cast operator
        const tableRow = numberConversionCostTable.get(to.identifierText);
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
            if (returnType?.typeOrFunc.equals(toType)) {
                selectedConvFunc = convFunc;
                break;
            }
        }
    }

    if (selectedConvFunc === undefined && mode === ConversionMode.ExplicitValueCast) {
        selectedConvFunc = convFuncList.find(convFunc => isAnyConvFunction(convFunc));
    }

    if (selectedConvFunc === undefined) {
        return undefined;
    }

    const returnType = selectedConvFunc.returnType;
    assert(returnType !== undefined);

    return {
        cost:
            ConversionCost.ObjToPrimitiveConv +
            (returnType.identifierText === 'void' ? 0 : (evaluateTypeConversion(returnType, to, mode)?.cost ?? 0))
    };
}

// -----------------------------------------------
// A primitive to an object
// as_compiler.cpp: ImplicitConvPrimitiveToObject

function evaluateConvPrimitiveToObject(
    state: EvaluationState,
    from: ResolvedType,
    to: ResolvedType
): ConversionEvaluation | undefined {
    const fromType = from.typeOrFunc;
    const toType = to.typeOrFunc;

    assert(fromType.isType() && toType.isType());
    assert(fromType.isPrimitiveOrEnum() && toType.isPrimitiveOrEnum() === false);

    return evaluateConversionByConstructor(state, from, to);
}

// -----------------------------------------------
// An object to An object
// as_compiler.cpp: ImplicitConvObjectToObject

function evaluateConvObjectToObject(
    state: EvaluationState,
    from: ResolvedType,
    to: ResolvedType,
    mode: ConversionMode = ConversionMode.Implicit
): ConversionEvaluation | undefined {
    const fromType = from.typeOrFunc;
    const toType = to.typeOrFunc;

    assert(fromType.isType() && toType.isType());
    assert(fromType.isPrimitiveOrEnum() === false && toType.isPrimitiveOrEnum() === false);

    // Check if these are identical
    if (fromType.equals(toType)) {
        return {cost: ConversionCost.NoConv};
    }

    if (mode === ConversionMode.ExplicitRefCast && from.handle !== undefined && to.handle !== undefined) {
        return {cost: ConversionCost.RefConv};
    }

    // FIXME?
    if (canDownCast(fromType, toType)) {
        return {cost: ConversionCost.ToObjectConv};
    }

    // Check the conversion using a construct with a single parameter.
    const constByConstructor = evaluateConversionByConstructor(state, from, to);
    if (constByConstructor !== undefined) {
        return constByConstructor;
    }

    // Check the conversion using the opConv and opImpl function.
    const convFuncList = collectConversionFunctions(fromType, mode);
    for (const convFunc of convFuncList) {
        if (convFunc.returnType?.equals(to)) {
            return {cost: ConversionCost.ToObjectConv};
        }
    }

    if (mode === ConversionMode.ExplicitRefCast && to.handle !== undefined) {
        const outRefConvFunc = convFuncList.find(convFunc => isAnyCastFunction(convFunc));
        if (outRefConvFunc !== undefined) {
            return {cost: ConversionCost.RefConv};
        }
    }

    return undefined;
}

// -----------------------------------------------
// Helper functions

function evaluateNullConversion(from: ResolvedType, to: ResolvedType): ConversionEvaluation | undefined {
    if (from.isNullType() && to.isNullType()) {
        return {cost: ConversionCost.NoConv};
    }

    const nonNullType = from.isNullType() ? to : from;
    if (nonNullType.handle !== undefined) {
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
        return resolvedBuiltinInt.cloneWithHandle(type.handle).cloneWithConst(type.isConst);
    }

    if (type.identifierText === 'uint32') {
        return resolvedBuiltinUInt.cloneWithHandle(type.handle).cloneWithConst(type.isConst);
    }

    return type;
}

function evaluateConversionByConstructor(
    state: EvaluationState,
    from: ResolvedType,
    to: ResolvedType
): ConversionEvaluation | undefined {
    if (!state.allowObjectConstruct) {
        return undefined;
    }

    const fromType = from.typeOrFunc;
    const toType = to.typeOrFunc;

    assert(fromType.isType() && toType.isType());

    const toScope = resolveActiveScope(toType.scopePath);

    // Search for the constructor of the given type from the scope to which the given type belongs.
    const constructorScope = toScope.lookupScope(toType.identifierText);
    if (constructorScope?.linkedNode?.nodeName !== NodeName.Class) {
        return undefined;
    }

    // Search for the constructor of the given type from the scope of the type itself.
    const constructorHolder = constructorScope.lookupSymbol(toType.identifierText);
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
        if (paramType === to) {
            continue;
        }

        assert(state.allowObjectConstruct); // because of the condition at the beginning of the function
        state.allowObjectConstruct = false; // To prevent infinite recursion

        // Source type must be convertible to the parameter type of the constructor.
        const cost = evaluateTypeConversionInternal(state, from, paramType);

        state.allowObjectConstruct = true;

        if (cost === undefined) {
            continue;
        }

        return {cost: ConversionCost.ToObjectConv + cost.cost}; // FIXME?
    }

    return undefined;
}

export function canDownCast(fromType: TypeSymbol, toType: TypeSymbol): boolean {
    const fromNode = fromType.linkedNode;
    if (fromType.isPrimitiveType()) {
        return false;
    }

    // Check if these are identical
    if (fromType.equals(toType)) {
        return true;
    }

    if (isNodeClassOrInterface(fromNode)) {
        if (fromType.baseList === undefined) {
            return false;
        }

        for (const fromBase of fromType.baseList) {
            if (fromBase?.typeOrFunc === undefined) {
                continue;
            }

            if (fromBase.typeOrFunc.isType() === false) {
                continue;
            }

            if (canDownCast(fromBase.typeOrFunc, toType)) {
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

function areFunctionsEqual(from: FunctionSymbol, to: FunctionSymbol): boolean {
    if (from.parameterTypes.length !== to.parameterTypes.length) {
        return false;
    }

    const fromReturnType = normalizeType(from.returnType);
    const toReturnType = normalizeType(to.returnType);
    if (fromReturnType?.equals(toReturnType) === false) {
        return false;
    }

    for (let i = 0; i < from.parameterTypes.length; i++) {
        const fromParam = normalizeType(from.parameterTypes[i]);
        const toParam = normalizeType(to.parameterTypes[i]);

        if (fromParam === undefined || toParam === undefined) {
            continue;
        }

        if (fromParam.equals(toParam) === false) {
            return false;
        }
    }

    return true;
}

function areTemplateArgumentsEqual(from: ResolvedType, to: ResolvedType): boolean {
    if (from.typeOrFunc.isFunction() || to.typeOrFunc.isFunction()) {
        // TODO: Function template arguments.
        return true;
    }

    const fromType = from.typeOrFunc;
    const toType = to.typeOrFunc;

    if (fromType.templateParameters?.length !== toType.templateParameters?.length) {
        // The number of template arguments is different.
        return false;
    } else if (
        fromType.templateParameters === undefined ||
        toType.templateParameters === undefined ||
        fromType.templateParameters.length == 0
    ) {
        // Both types do not have template parameters.
        return true;
    }

    const fromTemplateArguments = from.getTemplateArguments();
    const toTemplateArguments = to.getTemplateArguments();

    // Check if the template arguments are the same respectively.
    for (let i = 0; i < fromTemplateArguments.length; i++) {
        const fromArg = normalizeType(fromTemplateArguments[i]);
        const toArg = normalizeType(toTemplateArguments[i]);

        if (
            fromArg === undefined ||
            toArg === undefined ||
            fromArg.identifierText === '?' ||
            toArg.identifierText === '?'
        ) {
            continue; // FIXME?
        }

        if (fromArg.typeOrFunc.equals(toArg.typeOrFunc) === false) {
            return false;
        }

        if (fromArg.handle !== toArg.handle) {
            return false;
        }

        if (areTemplateArgumentsEqual(fromArg, toArg) === false) {
            return false;
        }
    }

    return true;
}

function collectConversionFunctions(
    fromType: TypeSymbol | FunctionSymbol,
    mode: ConversionMode = ConversionMode.Implicit
) {
    const convFuncList: FunctionSymbol[] = [];
    const fromMembers =
        resolveActiveScope(fromType.scopePath).lookupScope(fromType.identifierText)?.symbolTable.values() ?? [];
    for (const methodHolder of fromMembers) {
        if (methodHolder.isFunctionHolder() === false) {
            continue;
        }

        if (methodHolder.identifierText === 'opImplConv') {
            convFuncList.push(...methodHolder.toList());
        } else if (methodHolder.identifierText === 'opConv') {
            if (mode === ConversionMode.ExplicitValueCast) {
                convFuncList.push(...methodHolder.toList());
            }
        } else if (methodHolder.identifierText === 'opImplCast') {
            if (mode === ConversionMode.ExplicitRefCast) {
                convFuncList.push(...methodHolder.toList());
            }
        } else if (methodHolder.identifierText === 'opCast') {
            if (mode === ConversionMode.ExplicitRefCast) {
                convFuncList.push(...methodHolder.toList());
            }
        }
    }

    return convFuncList;
}

// Check whether the function is `void opConv(?&out)` or `void opImplConv(?&out)`.
function isAnyConvFunction(convFunc: FunctionSymbol): boolean {
    if (convFunc.identifierText !== 'opConv' && convFunc.identifierText !== 'opImplConv') {
        return false;
    }

    return hasAnyOutParamSignature(convFunc);
}

// Check whether the function is `void opCast(?&out)` or `void opImplCast(?&out)`.
function isAnyCastFunction(convFunc: FunctionSymbol): boolean {
    if (convFunc.identifierText !== 'opCast' && convFunc.identifierText !== 'opImplCast') {
        return false;
    }

    return hasAnyOutParamSignature(convFunc);
}

function hasAnyOutParamSignature(convFunc: FunctionSymbol): boolean {
    if (convFunc.returnType?.identifierText !== 'void') {
        return false;
    }

    if (convFunc.parameterTypes.length !== 1 || convFunc.linkedNode.paramList.params.length !== 1) {
        return false;
    }

    if (convFunc.linkedNode.paramList.params[0].inOutToken?.text !== 'out') {
        return false;
    }

    const paramType = normalizeType(convFunc.parameterTypes[0]);
    return paramType?.isAnyType() === true;
}

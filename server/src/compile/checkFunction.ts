import {diagnostic} from "../code/diagnostic";
import {getNodeLocation, ParsedRange, stringifyNodeType} from "./nodes";
import {
    DeducedType,
    PrimitiveType,
    resolveTemplateTypes,
    stringifyDeducedType,
    stringifyDeducedTypes,
    SymbolicFunction,
    SymbolKind,
    SymbolScope,
    TemplateTranslation
} from "./symbolic";
import {isTypeMatch} from "./checkType";
import {ParsingToken} from "./parsingToken";

export interface FunctionMatchingArgs {
    scope: SymbolScope;
    callerIdentifier: ParsingToken;
    callerRange: ParsedRange;
    callerArgRanges: ParsedRange[];
    callerArgTypes: (DeducedType | undefined)[];
    calleeFunc: SymbolicFunction;
    templateTranslators: (TemplateTranslation | undefined)[];
}

export function checkFunctionMatch(
    args: FunctionMatchingArgs
): DeducedType | undefined {
    pushReferenceOfFuncOrConstructor(args.callerIdentifier, args.scope, args.calleeFunc);
    return checkFunctionMatchInternal(args, args.calleeFunc);
}

function pushReferenceOfFuncOrConstructor(callerIdentifier: ParsingToken, scope: SymbolScope, calleeFunc: SymbolicFunction) {
    scope.referencedList.push({declaredSymbol: calleeFunc, referencedToken: callerIdentifier});
}

export function checkFunctionMatchInternal(
    args: FunctionMatchingArgs,
    overloadedHead: SymbolicFunction
): DeducedType | undefined {
    const {scope, callerRange, callerArgRanges, callerArgTypes, calleeFunc, templateTranslators} = args;
    const calleeParams = calleeFunc.sourceNode.paramList;

    if (callerArgTypes.length > calleeParams.length) {
        // Handle too many caller arguments | 呼び出し側の引数の数が多すぎる場合へ対処
        return handleTooMuchCallerArgs(args, overloadedHead);
    }

    for (let i = 0; i < calleeParams.length; i++) {
        if (i >= callerArgTypes.length) {
            // When the caller arguments are insufficient | 呼び出し側の引数が足りない場合
            const param = calleeParams[i];

            if (param.defaultExpr === undefined) {
                // When there is no default value | デフォルト値も存在しない場合
                if (calleeFunc.nextOverload !== undefined) return checkFunctionMatchInternal({
                    ...args,
                    calleeFunc: calleeFunc.nextOverload
                }, overloadedHead);
                if (handleErrorWhenOverloaded(callerRange, callerArgTypes, calleeFunc, overloadedHead) === false) {
                    diagnostic.addError(getNodeLocation(callerRange), `Missing argument for parameter '${stringifyNodeType(param.type)}' 💢`);
                }
                break;
            }
        }

        let actualType = callerArgTypes[i];
        let expectedType = calleeFunc.parameterTypes[i];
        actualType = resolveTemplateTypes(templateTranslators, actualType);
        expectedType = resolveTemplateTypes(templateTranslators, expectedType);

        if (isTypeMatch(actualType, expectedType)) continue;

        // Use the overload if it exists | オーバーロードが存在するなら使用
        if (calleeFunc.nextOverload !== undefined) return checkFunctionMatchInternal(
            {...args, calleeFunc: calleeFunc.nextOverload},
            overloadedHead);
        if (handleErrorWhenOverloaded(callerRange, callerArgTypes, calleeFunc, overloadedHead) === false) {
            diagnostic.addError(getNodeLocation(callerRange),
                `Cannot convert '${stringifyDeducedType(actualType)}' to parameter type '${stringifyDeducedType(expectedType)}' 💢`);
        }
    }

    return resolveTemplateTypes(templateTranslators, calleeFunc.returnType);
}

function handleTooMuchCallerArgs(args: FunctionMatchingArgs, overloadedHead: SymbolicFunction) {
    const {scope, callerRange, callerArgRanges, callerArgTypes, calleeFunc, templateTranslators} = args;

    // Use the overload if it exists | オーバーロードが存在するなら使用
    if (calleeFunc.nextOverload !== undefined) return checkFunctionMatchInternal({
        ...args,
        calleeFunc: calleeFunc.nextOverload
    }, overloadedHead);
    if (handleErrorWhenOverloaded(callerRange, callerArgTypes, calleeFunc, overloadedHead) === false) {
        diagnostic.addError(getNodeLocation(callerRange),
            `Function has ${calleeFunc.sourceNode.paramList.length} parameters, but ${callerArgTypes.length} were provided 💢`);
    }

    return calleeFunc.returnType;
}

function handleErrorWhenOverloaded(
    callerRange: ParsedRange,
    callerArgs: (DeducedType | undefined)[],
    calleeFunc: SymbolicFunction,
    overloadedHead: SymbolicFunction
) {
    if (calleeFunc === overloadedHead) return false; // Not overloaded

    let message = 'No viable function 💢';
    message += `\nArguments types: (${stringifyDeducedTypes(callerArgs)})`;
    message += '\nCandidates considered:';

    let cursor: SymbolicFunction | undefined = overloadedHead;
    while (cursor !== undefined) {
        message += `\n(${stringifyDeducedTypes(cursor.parameterTypes)})`;
        cursor = cursor.nextOverload;
    }

    diagnostic.addError(getNodeLocation(callerRange), message);
    return true;
}

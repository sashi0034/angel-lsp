import {
    SymbolFunction,
} from "./symbolObject";
import {canTypeConvert} from "./checkType";
import {stringifyNodeType} from "../compiler_parser/nodesUtils";
import {resolveTemplateTypes, stringifyResolvedType, stringifyResolvedTypes, TemplateTranslation} from "./symbolUtils";
import {SymbolScope} from "./symbolScope";
import {ResolvedType} from "./resolvedType";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {TokenRange} from "../compiler_parser/tokenRange";

export interface FunctionMatchingArgs {
    scope: SymbolScope;
    callerIdentifier: TokenObject;
    callerRange: TokenRange;
    callerArgRanges: TokenRange[];
    callerArgTypes: (ResolvedType | undefined)[];
    calleeFunc: SymbolFunction;
    templateTranslators: (TemplateTranslation | undefined)[];
}

/**
 * Checks whether the arguments provided by the caller match the parameters of the function definition.
 * @param args
 */
export function checkFunctionMatch(
    args: FunctionMatchingArgs
): ResolvedType | undefined {
    pushReferenceOfFuncOrConstructor(args.callerIdentifier, args.scope, args.calleeFunc);
    return checkFunctionMatchInternal(args, args.calleeFunc);
}

function pushReferenceOfFuncOrConstructor(callerIdentifier: TokenObject, scope: SymbolScope, calleeFunc: SymbolFunction) {
    scope.referencedList.push({declaredSymbol: calleeFunc, referencedToken: callerIdentifier});
}

// FIXME: Calculate cost of conversion and consider it in the overload selection.

function checkFunctionMatchInternal(
    args: FunctionMatchingArgs,
    overloadedHead: SymbolFunction
): ResolvedType | undefined {
    const {scope, callerRange, callerArgRanges, callerArgTypes, calleeFunc, templateTranslators} = args;
    const calleeParams = calleeFunc.sourceNode.paramList;

    if (callerArgTypes.length > calleeParams.length) {
        // Handle too many caller arguments.
        return handleTooMuchCallerArgs(args, overloadedHead);
    }

    for (let i = 0; i < calleeParams.length; i++) {
        if (i >= callerArgTypes.length) {
            // When the caller arguments are insufficient
            const param = calleeParams[i];

            if (param.defaultExpr !== undefined) continue;

            // When there is also no default expression

            if (calleeFunc.nextOverload !== undefined) {
                return checkFunctionMatchInternal({...args, calleeFunc: calleeFunc.nextOverload}, overloadedHead);
            }

            if (handleErrorWhenOverloaded(
                callerRange,
                callerArgTypes,
                calleeFunc,
                overloadedHead,
                templateTranslators) === false) {
                analyzerDiagnostic.add(
                    callerRange.getBoundingLocation(),
                    `Missing argument for parameter '${stringifyNodeType(param.type)}'.`);
            }

            break;
        }

        let actualType = callerArgTypes[i];
        let expectedType = calleeFunc.parameterTypes[i];
        actualType = resolveTemplateTypes(templateTranslators, actualType);
        expectedType = resolveTemplateTypes(templateTranslators, expectedType);

        if (canTypeConvert(actualType, expectedType)) continue;

        // Use the overload if it exists
        if (calleeFunc.nextOverload !== undefined) {
            return checkFunctionMatchInternal({...args, calleeFunc: calleeFunc.nextOverload}, overloadedHead);
        }

        if (handleErrorWhenOverloaded(
            callerRange,
            callerArgTypes,
            calleeFunc,
            overloadedHead,
            templateTranslators) === false) {
            analyzerDiagnostic.add(
                callerRange.getBoundingLocation(),
                `Cannot convert '${stringifyResolvedType(actualType)}' to parameter type '${stringifyResolvedType(
                    expectedType)}'.`);
        }
    }

    return resolveTemplateTypes(templateTranslators, calleeFunc.returnType);
}

function handleTooMuchCallerArgs(args: FunctionMatchingArgs, overloadedHead: SymbolFunction) {
    const {scope, callerRange, callerArgRanges, callerArgTypes, calleeFunc, templateTranslators} = args;

    // Use the overload if it exists
    if (calleeFunc.nextOverload !== undefined) {
        return checkFunctionMatchInternal({...args, calleeFunc: calleeFunc.nextOverload}, overloadedHead);
    }

    if (handleErrorWhenOverloaded(
        callerRange,
        callerArgTypes,
        calleeFunc,
        overloadedHead,
        templateTranslators) === false) {
        analyzerDiagnostic.add(
            callerRange.getBoundingLocation(),
            `Function has ${calleeFunc.sourceNode.paramList.length} parameters, but ${callerArgTypes.length} were provided.`);
    }

    return calleeFunc.returnType;
}

function handleErrorWhenOverloaded(
    callerRange: TokenRange,
    callerArgs: (ResolvedType | undefined)[],
    calleeFunc: SymbolFunction,
    overloadedHead: SymbolFunction,
    templateTranslators: (TemplateTranslation | undefined)[]
) {
    if (calleeFunc === overloadedHead) return false; // Not overloaded

    let message = 'No viable function.';
    message += `\nArguments types: (${stringifyResolvedTypes(callerArgs)})`;
    message += '\nCandidates considered:';

    let cursor: SymbolFunction | undefined = overloadedHead;
    while (cursor !== undefined) {
        const resolvedTypes = cursor.parameterTypes.map(t => resolveTemplateTypes(templateTranslators, t));
        message += `\n(${stringifyResolvedTypes(resolvedTypes)})`;
        cursor = cursor.nextOverload;
    }

    analyzerDiagnostic.add(callerRange.getBoundingLocation(), message);
    return true;
}

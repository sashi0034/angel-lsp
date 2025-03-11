import {
    SymbolFunction, SymbolFunctionHolder,
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
    calleeFuncHolder: SymbolFunctionHolder;
    templateTranslators: (TemplateTranslation | undefined)[];
}

/**
 * Checks whether the arguments provided by the caller match the parameters of the function definition.
 * @param args
 */
export function checkFunctionMatch(
    args: FunctionMatchingArgs
): ResolvedType | undefined {
    pushReferenceOfFuncOrConstructor(args.callerIdentifier, args.scope, args.calleeFuncHolder.first); // FIXME: Select the best overload
    return checkFunctionMatchInternal(args, 0);
}

function pushReferenceOfFuncOrConstructor(callerIdentifier: TokenObject, scope: SymbolScope, calleeFunc: SymbolFunction) {
    scope.referencedList.push({declaredSymbol: calleeFunc, referencedToken: callerIdentifier});
}

// FIXME: Calculate cost of conversion and consider it in the overload selection.

function checkFunctionMatchInternal(
    args: FunctionMatchingArgs,
    nextOverloadIndex: number
): ResolvedType | undefined {
    const {scope, callerRange, callerArgRanges, callerArgTypes, calleeFuncHolder, templateTranslators} = args;
    const calleeFunc = calleeFuncHolder.overloadList[nextOverloadIndex];
    const calleeParams = calleeFunc.linkedNode.paramList;

    if (callerArgTypes.length > calleeParams.length &&
        (!calleeParams.length || !calleeParams[calleeParams.length - 1].isVariadic)) {
        // Handle too many caller arguments.
        return handleTooMuchCallerArgs(args, nextOverloadIndex);
    }

    for (let i = 0; i < calleeParams.length; i++) {
        if (i >= callerArgTypes.length) {
            // When the caller arguments are insufficient
            const param = calleeParams[i];

            if (param.defaultExpr !== undefined) continue;

            // When there is also no default expression

            if (nextOverloadIndex + 1 < calleeFuncHolder.count) {
                return checkFunctionMatchInternal(args, nextOverloadIndex + 1);
            }

            if (handleErrorWhenOverloaded(
                callerRange,
                callerArgTypes,
                calleeFuncHolder,
                templateTranslators) === false) {
                analyzerDiagnostic.add(
                    callerRange.getBoundingLocation(),
                    `Missing argument for parameter '${stringifyNodeType(param.type)}'.`);
            }

            break;
        }

        let expectedType = calleeFunc.parameterTypes[i];
        expectedType = resolveTemplateTypes(templateTranslators, expectedType);

        // note: variadic functions require at least one argument
        // in the "rest" slot.
        const numRest = (i === calleeParams.length - 1 && calleeParams[calleeParams.length - 1].isVariadic) ?
            ((callerArgTypes.length - calleeParams.length) + 1) : 1;

        for (let callerArgIndex = i; callerArgIndex < i + numRest; callerArgIndex++) {
            let actualType = callerArgTypes[callerArgIndex];
            actualType = resolveTemplateTypes(templateTranslators, actualType);

            if (canTypeConvert(actualType, expectedType)) continue;

            // Use the overload if it exists
            if (nextOverloadIndex + 1 < calleeFuncHolder.count) {
                return checkFunctionMatchInternal(args, nextOverloadIndex + 1);
            }

            if (handleErrorWhenOverloaded(
                callerRange,
                callerArgTypes,
                calleeFuncHolder,
                templateTranslators) === false) {
                analyzerDiagnostic.add(
                    callerRange.getBoundingLocation(),
                    `Cannot convert '${stringifyResolvedType(actualType)}' to parameter type '${stringifyResolvedType(
                        expectedType)}'.`);
            }
        }
    }

    return resolveTemplateTypes(templateTranslators, calleeFunc.returnType);
}

function handleTooMuchCallerArgs(args: FunctionMatchingArgs, nextOverloadIndex: number) {
    const {scope, callerRange, callerArgRanges, callerArgTypes, calleeFuncHolder, templateTranslators} = args;

    // Use the overload if it exists
    if (nextOverloadIndex + 1 < calleeFuncHolder.count) {
        return checkFunctionMatchInternal(args, nextOverloadIndex + 1);
    }

    const calleeFunc = calleeFuncHolder.overloadList[nextOverloadIndex];
    if (handleErrorWhenOverloaded(
        callerRange,
        callerArgTypes,
        calleeFuncHolder,
        templateTranslators) === false) {
        analyzerDiagnostic.add(
            callerRange.getBoundingLocation(),
            `Function has ${calleeFunc.linkedNode.paramList.length} parameters, but ${callerArgTypes.length} were provided.`);
    }

    return calleeFunc.returnType;
}

function handleErrorWhenOverloaded(
    callerRange: TokenRange,
    callerArgs: (ResolvedType | undefined)[],
    calleeFuncHolder: SymbolFunctionHolder,
    templateTranslators: (TemplateTranslation | undefined)[]
) {
    if (calleeFuncHolder.count === 1) return false; // No overload

    let message = 'No viable function.';
    message += `\nArguments types: (${stringifyResolvedTypes(callerArgs)})`;
    message += '\nCandidates considered:';

    // TODO: suffix `...` for variadic functions
    for (const overload of calleeFuncHolder.overloadList) {
        const resolvedTypes = overload.parameterTypes.map(t => resolveTemplateTypes(templateTranslators, t));
        message += `\n(${stringifyResolvedTypes(resolvedTypes)})`;
    }

    analyzerDiagnostic.add(callerRange.getBoundingLocation(), message);
    return true;
}

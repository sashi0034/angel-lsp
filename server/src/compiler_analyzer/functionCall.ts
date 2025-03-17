import {
    SymbolFunction, SymbolFunctionHolder, SymbolVariable,
} from "./symbolObject";
import {stringifyResolvedType, stringifyResolvedTypes} from "./symbolUtils";
import {SymbolScope} from "./symbolScope";
import {applyTemplateTranslator, ResolvedType, TemplateTranslator} from "./resolvedType";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {TokenRange} from "../compiler_tokenizer/tokenRange";
import {evaluateConversionCost} from "./typeConversion";

interface CallerArgument {
    name: TokenObject | undefined; // Support for named arguments
    range?: TokenRange; // The range of the argument without the name. It is used for error messages.
    type: ResolvedType | undefined;
}

interface FunctionCallArgs {
    // caller arguments
    callerScope: SymbolScope;
    callerIdentifier: TokenObject;
    callerRange: TokenRange;
    callerArgs: CallerArgument[];

    // callee arguments
    calleeFuncHolder: SymbolFunctionHolder;
    calleeTemplateTranslator: (TemplateTranslator | undefined);
    calleeDelegate?: SymbolVariable; // This is required because the delegate is called by a variable.
}

interface FunctionCallResult {
    bestMatching: SymbolFunction | undefined;

    /**
     * The return type of the function.
     */
    returnType: ResolvedType | undefined;

    /**
     * Side effect of the function call. (e.g. output error message)
     */
    sideEffect: () => void;
}

/**
 * Evaluates the function call and returns its resolved type.
 * It does not trigger side effects.
 */
export function evaluateFunctionCall(args: FunctionCallArgs): FunctionCallResult {
    return checkFunctionCallInternal(args);
}

/**
 * Checks whether the arguments provided by the caller match the parameters of the callee function.
 * If the function call is valid, it triggers side effects and returns the resolved return type.
 */
export function checkFunctionCall(args: FunctionCallArgs): ResolvedType | undefined {
    const result = checkFunctionCallInternal(args);
    result.sideEffect();
    return result.returnType;
}

interface FunctionAndCost {
    function: SymbolFunction;
    cost: number;
}

type MismatchReason = {
    tooManyArguments: true,
    fewerArguments?: false
} | {
    tooManyArguments?: false,
    fewerArguments: true
} | {
    tooManyArguments: false,
    fewerArguments: false,
    mismatchIndex: number,
    expectedType: ResolvedType | undefined,
    actualType: ResolvedType | undefined,
}

function checkFunctionCallInternal(args: FunctionCallArgs): FunctionCallResult {
    const {callerScope, callerIdentifier, calleeFuncHolder, calleeDelegate} = args;

    let bestMatching: FunctionAndCost | undefined = undefined;
    let lastMismatchReason: MismatchReason = {tooManyArguments: true};

    // Find the best matching function.
    for (const callee of calleeFuncHolder.toList()) {
        const evaluated = evaluateFunctionMatch(args, callee);
        if (typeof evaluated !== "number") {
            // Handle mismatch errors.
            lastMismatchReason = evaluated;
            continue;
        }

        if (bestMatching === undefined || evaluated < bestMatching.cost) {
            // Update the best matching function.
            bestMatching = {function: callee, cost: evaluated};
        }
    }

    if (bestMatching !== undefined) {
        // Return the return type of the best matching function
        return {
            bestMatching: bestMatching.function,
            returnType: applyTemplateTranslator(bestMatching.function.returnType, args.calleeTemplateTranslator),
            sideEffect: () => {
                // Add the reference to the function that was called.
                callerScope.pushReference({
                    toSymbol: calleeDelegate ?? bestMatching.function, fromToken: callerIdentifier
                });
            }
        };
    } else {
        return {
            bestMatching: undefined,
            returnType: undefined,
            sideEffect: () => {
                // Handle mismatch errors.
                handleMismatchError(args, lastMismatchReason);

                // Although the function call resolution fails, an approximate symbol is added as a reference.
                callerScope.pushReference({
                    toSymbol: calleeDelegate ?? calleeFuncHolder.first, fromToken: callerIdentifier
                });
            }
        };
    }
}

function evaluateFunctionMatch(args: FunctionCallArgs, callee: SymbolFunction): number | MismatchReason {
    const {callerArgs, calleeTemplateTranslator} = args;

    let totalCost = 0;

    // Caller arguments must be at least as many as the callee parameters.
    if (callee.parameterTypes.length < callerArgs.length) return {tooManyArguments: true};

    // let callerArgId = 0; // TODO
    for (let calleeParamId = 0; calleeParamId < callee.parameterTypes.length; calleeParamId++) {
        if (calleeParamId >= callerArgs.length) {
            // Handle when the caller arguments are insufficient.
            if (callee.linkedNode.paramList[calleeParamId].defaultExpr !== undefined) {
                // When there is default expressions
                break;
            } else {
                return {fewerArguments: true};
            }
        }

        const expectedType =
            applyTemplateTranslator(callee.parameterTypes[calleeParamId], calleeTemplateTranslator);
        const actualType = callerArgs[calleeParamId].type;

        const cost = evaluateConversionCost(actualType, expectedType);
        if (cost === undefined) {
            return {
                tooManyArguments: false,
                fewerArguments: false,
                mismatchIndex: calleeParamId,
                expectedType: expectedType,
                actualType: actualType
            };
        }

        totalCost += cost;
    }

    return totalCost;
}

function handleMismatchError(args: FunctionCallArgs, lastMismatchReason: MismatchReason) {
    const {callerRange, callerArgs, calleeFuncHolder, calleeTemplateTranslator} = args;
    if (calleeFuncHolder.count === 1) {
        const calleeFunction = calleeFuncHolder.first;
        if (lastMismatchReason.tooManyArguments || lastMismatchReason.fewerArguments) {
            analyzerDiagnostic.add(
                callerRange.getBoundingLocation(),
                `Function has ${calleeFunction.linkedNode.paramList.length} parameters, but ${callerArgs.length} were provided.`
            );
        } else {
            const actualTypeMessage = stringifyResolvedType(lastMismatchReason.actualType);
            const expectedTypeMessage = stringifyResolvedType(lastMismatchReason.expectedType);
            const callerArgRange = callerArgs[lastMismatchReason.mismatchIndex].range;
            analyzerDiagnostic.add(
                callerArgRange?.getBoundingLocation() ?? callerRange.getBoundingLocation(),
                `Cannot convert '${actualTypeMessage}' to parameter type '${expectedTypeMessage}'.`
            );
        }
    } else {
        let message = 'No viable function.\n';
        message += `Arguments types: (${stringifyResolvedTypes(callerArgs.map(arg => arg.type))})\n`;
        message += 'Candidates considered:';

        // TODO: suffix `...` for variadic functions
        for (const overload of calleeFuncHolder.overloadList) {
            const resolvedTypes =
                overload.parameterTypes.map(t => applyTemplateTranslator(t, calleeTemplateTranslator));
            message += `\n(${stringifyResolvedTypes(resolvedTypes)})`;
        }

        analyzerDiagnostic.add(callerRange.getBoundingLocation(), message);
    }
}
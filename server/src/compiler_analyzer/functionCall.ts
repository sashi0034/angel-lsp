import {
    SymbolFunction, SymbolFunctionHolder,
} from "./symbolObject";
import {stringifyResolvedType, stringifyResolvedTypes} from "./symbolUtils";
import {SymbolScope} from "./symbolScope";
import {applyTemplateTranslator, ResolvedType, TemplateTranslator} from "./resolvedType";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {TokenRange} from "../compiler_parser/tokenRange";
import {evaluateConversionCost} from "./typeConversion";

interface FunctionCallArgs {
    // caller arguments
    callerScope: SymbolScope;
    callerIdentifier: TokenObject;
    callerRange: TokenRange;
    callerArgRanges: TokenRange[];
    callerArgTypes: (ResolvedType | undefined)[];

    // callee arguments
    calleeFuncHolder: SymbolFunctionHolder;
    calleeTemplateTranslator: (TemplateTranslator | undefined);
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
    const {callerScope, callerIdentifier, calleeFuncHolder} = args;

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
                callerScope.referencedList.push({
                    declaredSymbol: bestMatching.function, referencedToken: callerIdentifier
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
            }
        };
    }
}

function evaluateFunctionMatch(args: FunctionCallArgs, callee: SymbolFunction): number | MismatchReason {
    const {callerArgTypes, calleeTemplateTranslator} = args;

    let totalCost = 0;

    // Caller arguments must be at least as many as the callee parameters.
    if (callee.parameterTypes.length < callerArgTypes.length) return {tooManyArguments: true};

    for (let paramId = 0; paramId < callee.parameterTypes.length; paramId++) {
        if (paramId >= callerArgTypes.length) {
            // Handle when the caller arguments are insufficient.
            if (callee.linkedNode.paramList[paramId].defaultExpr !== undefined) {
                // When there is default expressions
                break;
            } else {
                return {fewerArguments: true};
            }
        }

        const expectedType =
            applyTemplateTranslator(callee.parameterTypes[paramId], calleeTemplateTranslator);
        const actualType = callerArgTypes[paramId];

        const cost = evaluateConversionCost(actualType, expectedType);
        if (cost === undefined) {
            return {
                tooManyArguments: false,
                fewerArguments: false,
                mismatchIndex: paramId,
                expectedType: expectedType,
                actualType: actualType
            };
        }

        totalCost += cost;
    }

    return totalCost;
}

function handleMismatchError(args: FunctionCallArgs, lastMismatchReason: MismatchReason) {
    const {callerRange, callerArgRanges, callerArgTypes, calleeFuncHolder, calleeTemplateTranslator} = args;
    if (calleeFuncHolder.count === 1) {
        const calleeFunction = calleeFuncHolder.first;
        if (lastMismatchReason.tooManyArguments || lastMismatchReason.fewerArguments) {
            analyzerDiagnostic.add(
                callerRange.getBoundingLocation(),
                `Function has ${calleeFunction.linkedNode.paramList.length} parameters, but ${callerArgTypes.length} were provided.`
            );
        } else {
            const actualTypeMessage = stringifyResolvedType(lastMismatchReason.actualType);
            const expectedTypeMessage = stringifyResolvedType(lastMismatchReason.expectedType);
            analyzerDiagnostic.add(
                callerArgRanges[lastMismatchReason.mismatchIndex].getBoundingLocation(),
                `Cannot convert '${actualTypeMessage}' to parameter type '${expectedTypeMessage}'.`
            );
        }
    } else {
        let message = 'No viable function.\n';
        message += `Arguments types: (${stringifyResolvedTypes(callerArgTypes)})\n`;
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
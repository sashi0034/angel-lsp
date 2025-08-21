import {
    SymbolFunction, SymbolFunctionHolder, SymbolObject, SymbolVariable,
} from "./symbolObject";
import {stringifyResolvedType, stringifyResolvedTypes} from "./symbolUtils";
import {getActiveGlobalScope, resolveActiveScope, SymbolScope} from "./symbolScope";
import {applyTemplateTranslator, ResolvedType, TemplateTranslator} from "./resolvedType";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {TokenRange} from "../compiler_tokenizer/tokenRange";
import {evaluateTypeConversion} from "./typeConversion";
import {NodeName} from "../compiler_parser/nodes";
import {causeTypeConversionSideEffect} from "./typeConversionSideEffect";

interface CallerArgument {
    name: TokenObject | undefined; // Support for named arguments
    range?: TokenRange; // The range of the argument without the name. It is used for error messages.
    type: ResolvedType | undefined;
}

interface FunctionCallArgs {
    // caller arguments
    callerIdentifier: TokenObject;
    callerRange: TokenRange;
    callerArgs: CallerArgument[];

    // callee arguments
    calleeFuncHolder: SymbolFunctionHolder;
    calleeTemplateTranslator: (TemplateTranslator | undefined);
    calleeDelegateVariable?: SymbolVariable; // This is required because the delegate is called by a variable.
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

// -----------------------------------------------

type TypeConversionSideEffect = (() => void);

interface BestMatching {
    function: SymbolFunction;
    cost: number;
    sideEffects: TypeConversionSideEffect[];
}

enum MismatchKind {
    TooManyArguments = 'TooManyArguments',
    FewerArguments = 'FewerArguments',
    InvalidNamedArgumentOrder = 'InvalidNamedArgumentOrder',
    DuplicateNamedArgument = 'DuplicateNamedArgument',
    NotFoundNamedArgument = 'NotFoundNamedArgument',
    ParameterMismatch = 'ParameterMismatch'
}

const mismatchPriority: Map<MismatchKind, number> = new Map([
    [MismatchKind.TooManyArguments, 0],
    [MismatchKind.FewerArguments, 0],
    [MismatchKind.InvalidNamedArgumentOrder, 10], // We highly prioritize errors related to named arguments.
    [MismatchKind.DuplicateNamedArgument, 10],
    [MismatchKind.NotFoundNamedArgument, 10],
    [MismatchKind.ParameterMismatch, 5]
]);

type MismatchReason = {
    reason: MismatchKind.TooManyArguments
} | {
    reason: MismatchKind.FewerArguments
} | {
    reason: MismatchKind.InvalidNamedArgumentOrder,
    invalidArgumentIndex: number
} | {
    reason: MismatchKind.DuplicateNamedArgument
    nameIndex: number
} | {
    reason: MismatchKind.NotFoundNamedArgument
    nameIndex: number
} | {
    reason: MismatchKind.ParameterMismatch,
    mismatchIndex: number,
    expectedType: ResolvedType | undefined,
    actualType: ResolvedType | undefined,
}

function hasMismatchReason(reason: number | MismatchReason): reason is MismatchReason {
    return typeof reason !== "number";
}

function checkFunctionCallInternal(args: FunctionCallArgs): FunctionCallResult {
    const {callerIdentifier, calleeFuncHolder, calleeDelegateVariable} = args;

    // If the callee is a delegate and succeeds in casting, return it directly.
    const delegateCast = evaluateDelegateCast(args);
    if (delegateCast !== undefined) {
        return delegateCast;
    }

    let bestMatching: BestMatching | undefined = undefined;
    let mismatchReason: MismatchReason = {reason: MismatchKind.TooManyArguments};

    // Find the best matching function.
    for (const callee of calleeFuncHolder.toList()) {
        const sideEffectBuffer: TypeConversionSideEffect[] = [];
        const evaluated = evaluateFunctionMatch(args, callee, sideEffectBuffer);
        if (hasMismatchReason(evaluated)) {
            // Handle mismatch errors.
            if (mismatchPriority.get(evaluated.reason)! >= mismatchPriority.get(mismatchReason.reason)!) {
                mismatchReason = evaluated;
            }

            continue;
        }

        if (bestMatching === undefined || evaluated < bestMatching.cost) {
            // Update the best matching function.
            bestMatching = {function: callee, cost: evaluated, sideEffects: sideEffectBuffer};
        }
    }

    if (bestMatching !== undefined) {
        // Return the return type of the best matching function
        return {
            bestMatching: bestMatching.function,
            returnType: applyTemplateTranslator(bestMatching.function.returnType, args.calleeTemplateTranslator),
            sideEffect: () => {
                bestMatching?.sideEffects.forEach(sideEffect => sideEffect());

                // Add the reference to the function that was called.
                getActiveGlobalScope().info.reference.push(({
                    toSymbol: calleeDelegateVariable ?? bestMatching.function, fromToken: callerIdentifier
                }));

                pushReferenceToNamedArguments(args.callerArgs, bestMatching.function);
            }
        };
    } else {
        return {
            bestMatching: undefined,
            returnType: undefined,
            sideEffect: () => {
                // Handle mismatch errors.
                handleMismatchError(args, mismatchReason);

                // Although the function call resolution fails, a fallback symbol is added as a reference.
                const fallbackCallee = calleeFuncHolder.first;
                getActiveGlobalScope().info.reference.push(({
                    toSymbol: calleeDelegateVariable ?? fallbackCallee, fromToken: callerIdentifier
                }));

                pushReferenceToNamedArguments(args.callerArgs, fallbackCallee);
            }
        };
    }
}

function pushReferenceToNamedArguments(callerArgs: CallerArgument[], callee: SymbolFunction) {
    if (callee.functionScopePath === undefined) return;
    const functionScope = resolveActiveScope(callee.functionScopePath);

    for (const args of callerArgs) {
        if (args.name === undefined) continue;

        const name = args.name.text;
        const paramId = callee.linkedNode.paramList.findIndex(p => p.identifier?.text === name);
        if (paramId === -1) continue;

        const toSymbol = functionScope.lookupSymbol(name);
        if (toSymbol === undefined || toSymbol.isVariable() === false) continue;

        // Add a reference to the named argument in the callee function scope.
        getActiveGlobalScope().info.reference.push(({toSymbol: toSymbol, fromToken: args.name}));
    }
}

function evaluateDelegateCast(args: FunctionCallArgs): FunctionCallResult | undefined {
    const {callerIdentifier, callerArgs, calleeFuncHolder, calleeTemplateTranslator} = args;

    if (calleeFuncHolder.first.linkedNode.nodeName !== NodeName.FuncDef) return undefined;

    // If the callee is a delegate, check if it can be cast to a delegate.
    const delegateType = ResolvedType.create({
        typeOrFunc: calleeFuncHolder.first,
        templateTranslator: calleeTemplateTranslator
    });

    if (callerArgs.length !== 1) {
        return undefined;
    }

    const evaluation = evaluateTypeConversion(callerArgs[0].type, delegateType);
    if (evaluation === undefined) {
        return undefined;
    }

    return {
        bestMatching: calleeFuncHolder.first,
        returnType: applyTemplateTranslator(delegateType, calleeTemplateTranslator),
        sideEffect: () => {
            causeTypeConversionSideEffect(evaluation, callerArgs[0].type, delegateType, callerArgs[0].range);

            // Add the reference to the function that was called.
            getActiveGlobalScope().info.reference.push(({
                toSymbol: calleeFuncHolder.first, fromToken: callerIdentifier
            }));

            // Probably we do not need to add references to named arguments for delegates.
        }
    };
}

// -----------------------------------------------

function evaluateFunctionMatch(
    args: FunctionCallArgs, callee: SymbolFunction, sideEffects: TypeConversionSideEffect[]
): number | MismatchReason {
    const {callerArgs} = args;

    let totalCost = 0;

    // Caller arguments must be at least as many as the callee parameters.
    if (callee.parameterTypes.length < callerArgs.length) {
        if (!callee.linkedNode.paramList.at(-1)?.isVariadic) {
            // The number of arguments is too many.
            return {reason: MismatchKind.TooManyArguments};
        }
    }

    // The order of the caller arguments is expected to be as follows:
    // ('positional', 'positional', ... 'positional', 'named', 'named', ... 'named')

    // -----------------------------------------------
    // Evaluate the named arguments in the caller
    const namedArgumentCost = evaluatePassingNamedArgument(args, callee, sideEffects);
    if (hasMismatchReason(namedArgumentCost)) {
        return namedArgumentCost;
    }

    totalCost += namedArgumentCost;

    // -----------------------------------------------
    // Evaluate the positional arguments in the caller
    const positionalArgumentCost = evaluatePassingPositionalArgument(args, callee, sideEffects);
    if (hasMismatchReason(positionalArgumentCost)) {
        return positionalArgumentCost;
    }

    totalCost += positionalArgumentCost;

    return totalCost;
}

function evaluatePassingNamedArgument(
    args: FunctionCallArgs, callee: SymbolFunction, sideEffectBuffer: TypeConversionSideEffect[]
): number | MismatchReason {
    const {callerArgs} = args;

    let totalCost = 0;
    let foundNamedArgument = false;
    for (let argId = 0; argId < callerArgs.length; argId++) {
        const callerArgName = callerArgs[argId].name?.text;
        if (callerArgName === undefined) {
            if (foundNamedArgument) {
                // Positional arguments cannot be passed after named arguments
                return {reason: MismatchKind.InvalidNamedArgumentOrder, invalidArgumentIndex: argId};
            } else {
                continue;
            }
        }

        // At this point, the named argument is found.
        foundNamedArgument = true;

        // Check if the named argument is duplicated.
        for (let i = 0; i < argId; i++) {
            if (callerArgs[i].name?.text === callerArgName) {
                return {reason: MismatchKind.DuplicateNamedArgument, nameIndex: argId};
            }
        }

        // Find the matching parameter name in the callee function.
        for (let paramId = 0; paramId < callee.parameterTypes.length; paramId++) {
            const calleeArgName = callee.linkedNode.paramList[paramId].identifier?.text;
            if (callerArgName === calleeArgName) {
                // Found a matching parameter name between the caller and callee

                // Check the type of the passing argument
                const cost =
                    evaluatePassingArgument(args, argId, callee.parameterTypes[paramId], sideEffectBuffer);
                if (hasMismatchReason(cost)) {
                    return cost;
                }

                totalCost += cost;
                break;
            }

            if (paramId === callee.parameterTypes.length - 1) {
                return {reason: MismatchKind.NotFoundNamedArgument, nameIndex: argId};
            }
        }
    }

    return totalCost;
}

function evaluatePassingPositionalArgument(
    args: FunctionCallArgs, callee: SymbolFunction, sideEffectBuffer: TypeConversionSideEffect[]
): number | MismatchReason {
    const {callerArgs} = args;
    let totalCost = 0;

    // Iterate over the parameters of the callee function.
    for (let paramId = 0; paramId < callee.parameterTypes.length; paramId++) {
        if (paramId >= callerArgs.length) {
            // Handle when the caller arguments are insufficient.
            if (callee.linkedNode.paramList[paramId].defaultExpr !== undefined) {
                // When there is default expressions
                break;
            } else {
                return {reason: MismatchKind.FewerArguments};
            }
        }

        if (callerArgs[paramId].name !== undefined) {
            // Finish the positional arguments when the named argument is found.
            break;
        }

        // Check the type of the passing argument
        const cost =
            evaluatePassingArgument(args, paramId, callee.parameterTypes[paramId], sideEffectBuffer);
        if (hasMismatchReason(cost)) {
            return cost;
        }

        totalCost += cost;
    }

    if (callee.linkedNode.paramList.at(-1)?.isVariadic) {
        // Check the rest of the caller's variadic arguments.
        // e.g. 'arg1', 'arg2' in 'format(fmt, arg0, arg1, arg2)' (arg0 has already been checked above);
        for (let paramId = callee.parameterTypes.length; paramId < callerArgs.length; paramId++) {
            const cost =
                evaluatePassingArgument(args, paramId, callee.parameterTypes.at(-1), sideEffectBuffer);
            if (hasMismatchReason(cost)) {
                return cost;
            }

            totalCost += cost;
        }
    }

    return totalCost;
}

function evaluatePassingArgument(
    args: FunctionCallArgs,
    callerArgId: number,
    calleeParam: ResolvedType | undefined,
    sideEffectBuffer: TypeConversionSideEffect[]
): number | MismatchReason {
    const {callerArgs, calleeTemplateTranslator} = args;
    const expectedType =
        applyTemplateTranslator(calleeParam, calleeTemplateTranslator);

    const actualType = callerArgs[callerArgId].type;

    const evaluation = evaluateTypeConversion(actualType, expectedType);
    if (evaluation === undefined) {
        return {
            reason: MismatchKind.ParameterMismatch,
            mismatchIndex: callerArgId,
            expectedType: expectedType,
            actualType: actualType
        };
    }

    sideEffectBuffer.push(() => {
        causeTypeConversionSideEffect(evaluation, actualType, expectedType, callerArgs[callerArgId].range);
    });

    return evaluation.cost;
}

// -----------------------------------------------

function handleMismatchError(args: FunctionCallArgs, mismatchReason: MismatchReason) {
    const {callerRange, callerArgs, calleeFuncHolder, calleeTemplateTranslator} = args;

    if (mismatchReason.reason === MismatchKind.InvalidNamedArgumentOrder) {
        const argRange = callerArgs[mismatchReason.invalidArgumentIndex].range;
        analyzerDiagnostic.error(
            argRange?.getBoundingLocation() ?? callerRange.getBoundingLocation(),
            'Positional arguments cannot be passed after named arguments.'
        );
        return;
    } else if (mismatchReason.reason === MismatchKind.DuplicateNamedArgument) {
        const argLocation = callerArgs[mismatchReason.nameIndex].name?.location;
        analyzerDiagnostic.error(
            argLocation ?? callerRange.getBoundingLocation(),
            `Duplicate named argument '${callerArgs[mismatchReason.nameIndex].name?.text}'.`
        );
        return;
    } else if (mismatchReason.reason === MismatchKind.NotFoundNamedArgument) {
        const argLocation = callerArgs[mismatchReason.nameIndex].name?.location;
        analyzerDiagnostic.error(
            argLocation ?? callerRange.getBoundingLocation(),
            `Named argument '${callerArgs[mismatchReason.nameIndex].name?.text}' does not found in '${calleeFuncHolder.identifierText}'.`
        );
        return;
    }

    if (calleeFuncHolder.count === 1) {
        const calleeFunction = calleeFuncHolder.first;
        if (mismatchReason.reason === MismatchKind.TooManyArguments || mismatchReason.reason === MismatchKind.FewerArguments) {
            analyzerDiagnostic.error(
                callerRange.getBoundingLocation(),
                `Function has ${calleeFunction.linkedNode.paramList.length} parameters, but ${callerArgs.length} were provided.`
            );
        } else { // lastMismatchReason.reason === MismatchKind.ParameterMismatch
            const actualTypeMessage = stringifyResolvedType(mismatchReason.actualType);
            const expectedTypeMessage = stringifyResolvedType(mismatchReason.expectedType);
            const callerArgRange = callerArgs[mismatchReason.mismatchIndex].range;
            analyzerDiagnostic.error(
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

        analyzerDiagnostic.error(callerRange.getBoundingLocation(), message);
    }
}
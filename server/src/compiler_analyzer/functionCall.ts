import {FunctionSymbol, FunctionSymbolHolder, VariableSymbol} from './symbolObject';
import {getActiveGlobalScope, resolveActiveScope} from './symbolScope';
import {applyTemplateMapping, ResolvedType, TemplateMapping} from './resolvedType';
import {analyzerDiagnostic} from './analyzerDiagnostic';
import {TokenObject} from '../compiler_tokenizer/tokenObject';
import {TokenRange} from '../compiler_tokenizer/tokenRange';
import {evaluateTypeConversion} from './typeConversion';
import {NodeName} from '../compiler_parser/nodeObject';
import {causeTypeConversionSideEffect} from './typeConversionSideEffect';
import {stringifyResolvedType, stringifyResolvedTypes} from './symbolStringifier';

interface CallerArgument {
    name: TokenObject | undefined; // Support for named arguments
    range?: TokenRange; // The range of the argument without the name. It is used for error messages.
    type: ResolvedType | undefined;
}

interface FunctionCallArgs {
    // Caller-side arguments
    callerIdentifier: TokenObject;
    callerRange: TokenRange;
    callerArgs: CallerArgument[];
    callerInstanceType?: ResolvedType;

    // Callee-side arguments
    calleeFuncHolder: FunctionSymbolHolder;
    calleeTemplateMapping: TemplateMapping | undefined;
    calleeDelegateVariable?: VariableSymbol; // This is required because the delegate is called by a variable.
}

interface FunctionCallResult {
    bestMatching: FunctionSymbol | undefined;

    /**
     * The return type of the function.
     */
    returnType: ResolvedType | undefined;

    /**
     * Side effects of the function call, such as reporting an error.
     */
    sideEffect: () => void;
}

/**
 * Evaluate the function call and return its resolved type.
 * This does not trigger side effects.
 */
export function evaluateFunctionCall(args: FunctionCallArgs): FunctionCallResult {
    return checkFunctionCallInternal(args);
}

/**
 * Check whether the caller arguments match the callee parameters.
 * If the call is valid, trigger side effects and return the resolved return type.
 */
export function checkFunctionCall(args: FunctionCallArgs): ResolvedType | undefined {
    const result = checkFunctionCallInternal(args);
    result.sideEffect();
    return result.returnType;
}

// -----------------------------------------------

type TypeConversionSideEffect = () => void;

interface BestMatching {
    function: FunctionSymbol;
    cost: number;
    sideEffects: TypeConversionSideEffect[];
}

enum MismatchKind {
    TooManyArguments = 'TooManyArguments',
    FewerArguments = 'FewerArguments',
    InvalidNamedArgumentOrder = 'InvalidNamedArgumentOrder',
    DuplicateNamedArgument = 'DuplicateNamedArgument',
    NotFoundNamedArgument = 'NotFoundNamedArgument',
    ParameterMismatch = 'ParameterMismatch',
    MissingConstOverload = 'MissingConstOverload',
    AmbiguousOverload = 'AmbiguousOverload'
}

const mismatchPriority: Map<MismatchKind, number> = new Map([
    [MismatchKind.TooManyArguments, 0],
    [MismatchKind.FewerArguments, 0],
    [MismatchKind.InvalidNamedArgumentOrder, 10], // Prioritize named-argument errors highly.
    [MismatchKind.DuplicateNamedArgument, 10],
    [MismatchKind.NotFoundNamedArgument, 10],
    [MismatchKind.ParameterMismatch, 5],
    [MismatchKind.MissingConstOverload, 15],
    [MismatchKind.AmbiguousOverload, 100] // FIXME?
]);

type MismatchReason =
    | {
          reason: MismatchKind.TooManyArguments;
      }
    | {
          reason: MismatchKind.FewerArguments;
      }
    | {
          reason: MismatchKind.InvalidNamedArgumentOrder;
          invalidArgumentIndex: number;
      }
    | {
          reason: MismatchKind.DuplicateNamedArgument;
          nameIndex: number;
      }
    | {
          reason: MismatchKind.NotFoundNamedArgument;
          nameIndex: number;
      }
    | {
          reason: MismatchKind.AmbiguousOverload;
      }
    | {
          reason: MismatchKind.ParameterMismatch;
          mismatchIndex: number;
          expectedType: ResolvedType | undefined;
          actualType: ResolvedType | undefined;
      }
    | {
          reason: MismatchKind.MissingConstOverload;
          callee: FunctionSymbol;
      };

function hasMismatchReason(reason: number | MismatchReason): reason is MismatchReason {
    return typeof reason !== 'number';
}

function checkFunctionCallInternal(args: FunctionCallArgs): FunctionCallResult {
    const {callerIdentifier, calleeFuncHolder, calleeDelegateVariable} = args;

    // If the callee is a delegate and the cast succeeds, return it directly.
    const delegateCast = evaluateDelegateCast(args);
    if (delegateCast !== undefined) {
        return delegateCast;
    }

    let bestMatchings: BestMatching[] = [];
    let mismatchReason: MismatchReason = {reason: MismatchKind.TooManyArguments};

    // Find the best-matching overload.
    for (const callee of calleeFuncHolder.toList()) {
        const sideEffectBuffer: TypeConversionSideEffect[] = [];
        const evaluated = evaluateFunctionMatch(args, callee, sideEffectBuffer);
        if (hasMismatchReason(evaluated)) {
            // Track mismatch errors.
            if (mismatchPriority.get(evaluated.reason)! >= mismatchPriority.get(mismatchReason.reason)!) {
                mismatchReason = evaluated;
            }

            continue;
        }

        if (bestMatchings.length === 0 || evaluated < bestMatchings[0].cost) {
            // Update the current best match.
            bestMatchings = [{function: callee, cost: evaluated, sideEffects: sideEffectBuffer}];
        } else if (evaluated === bestMatchings[0].cost) {
            bestMatchings.push({function: callee, cost: evaluated, sideEffects: sideEffectBuffer});
        }
    }

    bestMatchings = dropConstOverloadsWhenMutableExists(args, bestMatchings);
    const hasAmbiguousLambdaOverload =
        bestMatchings.length > 1 && args.callerArgs.some(arg => arg.type?.lambdaInfo !== undefined);
    const bestMatching = bestMatchings[0];

    if (bestMatching !== undefined && !hasAmbiguousLambdaOverload) {
        // Return the best-matching function's return type.
        return {
            bestMatching: bestMatching.function,
            returnType: applyTemplateMapping(bestMatching.function.returnType, args.calleeTemplateMapping),
            sideEffect: () => {
                bestMatching?.sideEffects.forEach(sideEffect => sideEffect());

                // Add a reference to the function that was called.
                getActiveGlobalScope().pushReference({
                    toSymbol: calleeDelegateVariable ?? bestMatching.function,
                    fromToken: callerIdentifier
                });

                pushReferenceToNamedArguments(args.callerArgs, bestMatching.function);
            }
        };
    } else {
        if (hasAmbiguousLambdaOverload) {
            mismatchReason = {reason: MismatchKind.AmbiguousOverload};
        }

        return {
            bestMatching: undefined,
            returnType: undefined,
            sideEffect: () => {
                // Report mismatch errors.
                handleMismatchError(args, mismatchReason);

                // Even if resolution fails, add a fallback symbol reference.
                const fallbackCallee = calleeFuncHolder.first;
                getActiveGlobalScope().pushReference({
                    toSymbol: calleeDelegateVariable ?? fallbackCallee,
                    fromToken: callerIdentifier
                });

                pushReferenceToNamedArguments(args.callerArgs, fallbackCallee);
            }
        };
    }
}

function dropConstOverloadsWhenMutableExists(args: FunctionCallArgs, matchings: BestMatching[]): BestMatching[] {
    if (args.callerInstanceType === undefined || args.callerInstanceType.isConst) {
        return matchings;
    }

    const hasMutableMethod = matchings.some(matching => isMutableMethod(matching.function));
    if (!hasMutableMethod) {
        return matchings;
    }

    return matchings.filter(matching => !isConstMethod(matching.function));
}

function isConstMethod(symbol: FunctionSymbol): boolean {
    return symbol.linkedNode.nodeName !== NodeName.FuncDef && symbol.linkedNode.postfixConstToken !== undefined;
}

function isMutableMethod(symbol: FunctionSymbol): boolean {
    return symbol.linkedNode.nodeName !== NodeName.FuncDef && symbol.linkedNode.postfixConstToken === undefined;
}

function pushReferenceToNamedArguments(callerArgs: CallerArgument[], callee: FunctionSymbol) {
    if (callee.functionScopePath === undefined) {
        return;
    }

    const functionScope = resolveActiveScope(callee.functionScopePath);

    for (const args of callerArgs) {
        if (args.name === undefined) {
            continue;
        }

        const name = args.name.text;
        const paramId = callee.linkedNode.paramList.params.findIndex(p => p.identifier?.text === name);
        if (paramId === -1) {
            continue;
        }

        const toSymbol = functionScope.lookupSymbol(name);
        if (toSymbol === undefined || toSymbol.isVariable() === false) {
            continue;
        }

        // Add a reference to the named argument in the callee scope.
        getActiveGlobalScope().pushReference({toSymbol: toSymbol, fromToken: args.name});
    }
}

function evaluateDelegateCast(args: FunctionCallArgs): FunctionCallResult | undefined {
    const {callerIdentifier, callerArgs, calleeFuncHolder, calleeTemplateMapping, calleeDelegateVariable} = args;

    if (calleeFuncHolder.first.linkedNode.nodeName !== NodeName.FuncDef) {
        return undefined;
    }

    if (calleeDelegateVariable !== undefined) {
        return undefined;
    }

    // If the callee is a delegate, check whether the argument can be cast to it.
    const delegateType = ResolvedType.create({
        typeOrFunc: calleeFuncHolder.first,
        templateMapping: calleeTemplateMapping
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
        returnType: applyTemplateMapping(delegateType, calleeTemplateMapping),
        sideEffect: () => {
            causeTypeConversionSideEffect(evaluation, callerArgs[0].type, delegateType, callerArgs[0].range);

            // Add a reference to the function that was called.
            getActiveGlobalScope().pushReference({
                toSymbol: calleeFuncHolder.first,
                fromToken: callerIdentifier
            });

            // We probably do not need named-argument references for delegates.
        }
    };
}

// -----------------------------------------------

function evaluateFunctionMatch(
    args: FunctionCallArgs,
    callee: FunctionSymbol,
    sideEffects: TypeConversionSideEffect[]
): number | MismatchReason {
    const {callerArgs} = args;

    let totalCost = 0;

    // A non-const object cannot call a postfix-const function such as `void getValue() const`.
    if (
        args.callerInstanceType?.isConst &&
        callee.linkedNode.nodeName !== NodeName.FuncDef &&
        callee.linkedNode.postfixConstToken === undefined
    ) {
        return {reason: MismatchKind.MissingConstOverload, callee};
    }

    // Caller arguments must be at least as many as the callee parameters.
    if (callee.parameterTypes.length < callerArgs.length) {
        if (!callee.linkedNode.paramList.params.at(-1)?.isVariadic) {
            // The number of arguments is too many.
            return {reason: MismatchKind.TooManyArguments};
        }
    }

    // Caller arguments are expected in the following order:
    // ('positional', 'positional', ... 'positional', 'named', 'named', ... 'named')

    // -----------------------------------------------
    // Evaluate named arguments from the caller.
    const namedArgumentCost = evaluatePassingNamedArgument(args, callee, sideEffects);
    if (hasMismatchReason(namedArgumentCost)) {
        return namedArgumentCost;
    }

    totalCost += namedArgumentCost;

    // -----------------------------------------------
    // Evaluate positional arguments from the caller.
    const positionalArgumentCost = evaluatePassingPositionalArgument(args, callee, sideEffects);
    if (hasMismatchReason(positionalArgumentCost)) {
        return positionalArgumentCost;
    }

    totalCost += positionalArgumentCost;

    return totalCost;
}

function evaluatePassingNamedArgument(
    args: FunctionCallArgs,
    callee: FunctionSymbol,
    sideEffectBuffer: TypeConversionSideEffect[]
): number | MismatchReason {
    const {callerArgs} = args;

    let totalCost = 0;
    let foundNamedArgument = false;
    for (let argId = 0; argId < callerArgs.length; argId++) {
        const callerArgName = callerArgs[argId].name?.text;
        if (callerArgName === undefined) {
            if (foundNamedArgument) {
                // Positional arguments cannot appear after named arguments.
                return {reason: MismatchKind.InvalidNamedArgumentOrder, invalidArgumentIndex: argId};
            } else {
                continue;
            }
        }

        // At this point, we have encountered a named argument.
        foundNamedArgument = true;

        // Check for duplicate named arguments.
        for (let i = 0; i < argId; i++) {
            if (callerArgs[i].name?.text === callerArgName) {
                return {reason: MismatchKind.DuplicateNamedArgument, nameIndex: argId};
            }
        }

        // Find the matching parameter name in the callee.
        for (let paramId = 0; paramId < callee.parameterTypes.length; paramId++) {
            const calleeArgName = callee.linkedNode.paramList.params[paramId].identifier?.text;
            if (callerArgName === calleeArgName) {
                // Found a matching parameter name in the callee.

                // Check the type of the passed argument.
                const cost = evaluatePassingArgument(
                    args,
                    argId,
                    callee.parameterTypes[paramId],
                    callee.linkedNode.paramList.params[paramId].inOutToken?.text,
                    sideEffectBuffer
                );
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
    args: FunctionCallArgs,
    callee: FunctionSymbol,
    sideEffectBuffer: TypeConversionSideEffect[]
): number | MismatchReason {
    const {callerArgs} = args;
    let totalCost = 0;

    // Iterate over the callee parameters.
    for (let paramId = 0; paramId < callee.parameterTypes.length; paramId++) {
        if (paramId >= callerArgs.length) {
            // Handle cases where too few caller arguments were provided.
            // If the parameter has a default expression or is variadic (can accept zero args),
            // treat it as satisfied and stop checking further positional parameters.
            if (
                callee.linkedNode.paramList.params[paramId].defaultExpr !== undefined ||
                callee.linkedNode.paramList.params[paramId].isVariadic
            ) {
                break;
            } else {
                return {reason: MismatchKind.FewerArguments};
            }
        }

        if (callerArgs[paramId].name !== undefined) {
            // Stop processing positional arguments once a named argument appears.
            break;
        }

        // Check the type of the passed argument.
        const cost = evaluatePassingArgument(
            args,
            paramId,
            callee.parameterTypes[paramId],
            callee.linkedNode.paramList.params[paramId].inOutToken?.text,
            sideEffectBuffer
        );
        if (hasMismatchReason(cost)) {
            return cost;
        }

        totalCost += cost;
    }

    if (callee.linkedNode.paramList.params.at(-1)?.isVariadic) {
        // Check the rest of the caller's variadic arguments.
        // e.g. 'arg1', 'arg2' in 'format(fmt, arg0, arg1, arg2)' (arg0 has already been checked above);
        for (let paramId = callee.parameterTypes.length; paramId < callerArgs.length; paramId++) {
            const cost = evaluatePassingArgument(
                args,
                paramId,
                callee.parameterTypes.at(-1),
                callee.linkedNode.paramList.params.at(-1)?.inOutToken?.text,
                sideEffectBuffer
            );
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
    calleeInOut: 'in' | 'out' | 'inout' | undefined,
    sideEffectBuffer: TypeConversionSideEffect[]
): number | MismatchReason {
    const {callerArgs, calleeTemplateMapping} = args;
    const expectedType = applyTemplateMapping(calleeParam, calleeTemplateMapping);

    const actualType = callerArgs[callerArgId].type;

    if (actualType?.typeOrFunc.identifierText === 'void') {
        if (calleeInOut === 'out') {
            return 0;
        }

        return {
            reason: MismatchKind.ParameterMismatch,
            mismatchIndex: callerArgId,
            expectedType: expectedType,
            actualType: actualType
        };
    }

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
    const {callerRange, callerArgs, callerInstanceType, calleeFuncHolder, calleeTemplateMapping} = args;

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
            `Named argument '${callerArgs[mismatchReason.nameIndex].name?.text}' was not found in '${calleeFuncHolder.identifierText}'.`
        );
        return;
    } else if (mismatchReason.reason === MismatchKind.AmbiguousOverload) {
        analyzerDiagnostic.error(callerRange.getBoundingLocation(), 'Ambiguous overload for lambda argument.');
        return;
    }

    if (calleeFuncHolder.count === 1) {
        const calleeFunction = calleeFuncHolder.first;
        if (
            mismatchReason.reason === MismatchKind.TooManyArguments ||
            mismatchReason.reason === MismatchKind.FewerArguments
        ) {
            analyzerDiagnostic.error(
                callerRange.getBoundingLocation(),
                `Function has ${calleeFunction.linkedNode.paramList.params.length} parameters, but ${callerArgs.length} were provided.`
            );
        } else if (mismatchReason.reason === MismatchKind.MissingConstOverload) {
            analyzerDiagnostic.error(
                callerRange.getBoundingLocation(),
                `Cannot call non-const method '${callerInstanceType?.identifierText}::${mismatchReason.callee.identifierText}()' on a const '${callerInstanceType?.identifierText}' instance.`
            );
        } else {
            // lastMismatchReason.reason === MismatchKind.ParameterMismatch
            const actualTypeMessage = stringifyResolvedType(mismatchReason.actualType);
            const expectedTypeMessage = stringifyResolvedType(mismatchReason.expectedType);
            const callerArgRange = callerArgs[mismatchReason.mismatchIndex].range;
            analyzerDiagnostic.error(
                callerArgRange?.getBoundingLocation() ?? callerRange.getBoundingLocation(),
                `Cannot convert '${actualTypeMessage}' to parameter type '${expectedTypeMessage}'.`
            );
        }
    } else {
        let message = 'No viable overload found.\n';
        message += `Argument types: (${stringifyResolvedTypes(callerArgs.map(arg => arg.type))})\n`;
        message += 'Candidate overloads:';

        // TODO: suffix `...` for variadic functions
        for (const overload of calleeFuncHolder.overloadList) {
            const resolvedTypes = overload.parameterTypes.map(t => applyTemplateMapping(t, calleeTemplateMapping));
            message += `\n(${stringifyResolvedTypes(resolvedTypes)})`;
        }

        analyzerDiagnostic.error(callerRange.getBoundingLocation(), message);
    }
}

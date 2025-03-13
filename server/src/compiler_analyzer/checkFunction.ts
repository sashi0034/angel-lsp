import {
    SymbolFunction, SymbolFunctionHolder,
} from "./symbolObject";
import {stringifyResolvedType, stringifyResolvedTypes} from "./symbolUtils";
import {SymbolScope} from "./symbolScope";
import {ResolvedType, resolveTemplateTypes, TemplateTranslator} from "./resolvedType";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {TokenRange} from "../compiler_parser/tokenRange";
import {evaluateConversionCost} from "./checkConversion";

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

/**
 * Checks whether the arguments provided by the caller match the parameters of the callee function.
 * @param args
 */
export function checkFunctionCall(args: FunctionCallArgs): ResolvedType | undefined {
    return checkFunctionCallInternal(args);
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

function checkFunctionCallInternal(args: FunctionCallArgs): ResolvedType | undefined {
    const {callerScope, callerIdentifier, calleeFuncHolder} = args;

    let matching: FunctionAndCost | undefined = undefined;
    let lastMismatchReason: MismatchReason = {tooManyArguments: true};

    // Find the best matching function.
    for (const callee of calleeFuncHolder.toList()) {
        const evaluated = evaluateFunctionMatch(args, callee);
        if (typeof evaluated !== "number") {
            // Handle mismatch errors.
            lastMismatchReason = evaluated;
            continue;
        }

        if (matching === undefined || evaluated < matching.cost) {
            // Update the best matching function.
            matching = {function: callee, cost: evaluated};
        }
    }

    if (matching !== undefined) {
        // Add the reference to the function that was called.
        callerScope.referencedList.push({
            declaredSymbol: matching.function, referencedToken: callerIdentifier
        });

        // Return the return type of the best matching function
        return matching.function.returnType;
    } else {
        // Handle mismatch errors.
        handleMismatchError(args, lastMismatchReason);

        return undefined;
    }
}

// e.g.1:
// target: array<T> with {T: T}
// translator: {T: int}
// -> array<T> with {T: int}
// i.e., T at the end of the target is replaced with int

// e.g.2:
// target: array<T> with {T: array<T> with {T: T}}
// translator: {T: bool}
// -> array<T> with {T: array<T> with {T: bool}}
// i.e., T at the end of the target is replaced with bool
function attachTemplateTranslator(target: ResolvedType | undefined, translator: TemplateTranslator | undefined): ResolvedType | undefined {
    if (target === undefined || translator === undefined) return target;

    if (target.typeOrFunc.templateTypes?.length === 0) return target;

    if (target.templateTranslator === undefined) return target;

    // Create a new template translator by replacing the template type with the translated type.
    const newTranslator = new Map<TokenObject, ResolvedType | undefined>();
    for (const [token, translatedType] of target.templateTranslator) {
        if (translatedType?.identifierToken !== undefined && translator.has(translatedType?.identifierToken)) {
            // Replace `T` at the end of the target with the translated type.
            newTranslator.set(token, translator.get(translatedType?.identifierToken));
        } else {
            // Templates may be nested, so visit recursively.
            newTranslator.set(token, attachTemplateTranslator(translatedType, translator));
        }
    }

    return target.cloneWithTemplateTranslator(translator);
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
            attachTemplateTranslator(callee.parameterTypes[paramId], calleeTemplateTranslator);
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
                overload.parameterTypes.map(t => attachTemplateTranslator(t, calleeTemplateTranslator));
            message += `\n(${stringifyResolvedTypes(resolvedTypes)})`;
        }

        analyzerDiagnostic.add(callerRange.getBoundingLocation(), message);
    }
}
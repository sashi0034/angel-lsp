import {resolveActiveScope, SymbolScope} from "./symbolScope";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {ResolvedType} from "./resolvedType";
import {TokenRange} from "../compiler_tokenizer/tokenRange";
import {evaluateFunctionCall} from "./functionCall";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {stringifyResolvedType, stringifyResolvedTypes} from "./symbolUtils";
import assert = require("node:assert");
import {checkTypeCast} from "./typeCast";
import {resolvedBuiltinInt} from "./builtinType";
import {canTypeConvert, normalizeType} from "./typeConversion";
import {extendTokenLocation} from "../compiler_tokenizer/tokenUtils";

type OverloadedOperatorCallArgs = {
    // For dual operators
    callerOperator: TokenObject,
    alias: string,
    alias_r: string,
    lhs: ResolvedType,
    lhsRange: TokenRange,
    rhs: ResolvedType,
    rhsRange: TokenRange,
    rhsArgNames?: undefined,
} | {
    // For the case where the alias_r is not defined.
    callerOperator: TokenObject,
    alias: string,
    alias_r?: undefined, // The alias_r is not defined.
    lhs: ResolvedType,
    lhsRange: TokenRange,
    rhs: ResolvedType | (ResolvedType | undefined)[], // If alias_r is not defined, the rhs can be an array.
    rhsRange: TokenRange,
    rhsArgNames?: (TokenObject | undefined)[] // Support for named arguments.
}

/**
 * Check if the overloaded operator call is valid.
 */
export function checkOverloadedOperatorCall(args: OverloadedOperatorCallArgs) {
    return checkOverloadedOperatorCallInternal(args);
}

/**
 * Evaluate the operator call is possible by converting one side to a number.
 */
export function evaluateNumberOperatorCall(lhs: ResolvedType, rhs: ResolvedType): ResolvedType | undefined {
    if (lhs.typeOrFunc.isType() === false || rhs.typeOrFunc.isType() === false) {
        return undefined;
    }

    lhs = lhs.typeOrFunc.isEnumType() ? resolvedBuiltinInt : lhs;
    rhs = rhs.typeOrFunc.isEnumType() ? resolvedBuiltinInt : rhs;

    assert(lhs.typeOrFunc.isType() && rhs.typeOrFunc.isType());

    if (lhs.typeOrFunc.isNumberType() && rhs.typeOrFunc.isNumberType()) {
        return takeWiderNumberType(lhs, rhs);
    }

    if (lhs.typeOrFunc.isNumberType()) {
        if (checkTypeCast(rhs, lhs)) return lhs;
    } else if (rhs.typeOrFunc.isNumberType()) {
        if (checkTypeCast(lhs, rhs)) return rhs;
    }

    return undefined;
}

/**
 * Check if the comparison operator call is available.
 */
export function canComparisonOperatorCall(lhs: ResolvedType, rhs: ResolvedType): ResolvedType | undefined {
    // FIXME: Probably it is wrong.
    if (checkTypeCast(lhs, rhs)) return lhs;
    if (checkTypeCast(rhs, lhs)) return rhs;
    return undefined;
}

// -----------------------------------------------

function checkOverloadedOperatorCallInternal(args: OverloadedOperatorCallArgs): ResolvedType | undefined {
    const lhsResult = checkLhsOverloadedOperatorCall({
        callerOperator: args.callerOperator,
        alias: args.alias,
        lhs: args.lhs,
        rhs: args.rhs,
        rhsRange: args.rhsRange,
        rhsArgNames: args.rhsArgNames
    });

    if (args.alias_r === undefined) {
        if (hasMismatchReason(lhsResult)) {
            handleMismatchError(args, lhsResult);
            return undefined;
        } else {
            return lhsResult;
        }
    } else if (hasMismatchReason(lhsResult) === false) {
        return lhsResult;
    }

    // If the alias_r is defined, also check the rhs operator call.

    const rhsResult = checkLhsOverloadedOperatorCall({
        callerOperator: args.callerOperator,
        alias: args.alias_r,
        lhs: args.rhs,
        rhs: args.lhs,
        rhsRange: args.lhsRange,
        rhsArgNames: args.rhsArgNames
    });

    if (hasMismatchReason(rhsResult)) {
        handleMismatchError(args, lhsResult, rhsResult); // FIXME: Also consider the rhs reason.
        return undefined;
    } else {
        return rhsResult;
    }
}

function handleMismatchError(args: OverloadedOperatorCallArgs, lhsReason: MismatchReason, rhsReason?: MismatchReason) {
    const {callerOperator, alias, alias_r, lhs, rhs} = args;

    const operatorLocation = extendTokenLocation(callerOperator, 1, 1);

    // FIXME: Consider the rhs reason.

    if (lhsReason.reason === MismatchKind.MissingAliasOperator) {
        if (lhsReason.foundButNotFunction) {
            analyzerDiagnostic.error(
                operatorLocation,
                `The operator '${alias}' in ${stringifyResolvedType(lhs)} is found, but it is not a function.`
            );
            return;
        } else if (alias_r !== undefined) {
            analyzerDiagnostic.error(
                operatorLocation,
                `The operator '${stringifyResolvedType(lhs)}::${alias}' or '${stringifyResolvedType(rhs)}::${alias_r}' is not defined.`
            );
            return;
        } else {
            analyzerDiagnostic.error(
                operatorLocation,
                `The operator '${alias}' in ${stringifyResolvedType(lhs)} is not defined.`
            );
            return;
        }
    } else if (lhsReason.reason === MismatchKind.MismatchOverload) {
        const rhsText = Array.isArray(rhs) ? stringifyResolvedTypes(rhs) : stringifyResolvedType(rhs);
        analyzerDiagnostic.error(
            operatorLocation,
            `The operator '${alias}' in ${stringifyResolvedType(lhs)} does not match the argument types ${rhsText}.`
        );
        return;
    } else if (lhsReason.reason === MismatchKind.MismatchIndexedPropertyAccessor) {
        const rhsText = Array.isArray(rhs) ? stringifyResolvedTypes(rhs) : stringifyResolvedType(rhs);
        analyzerDiagnostic.error(
            args.rhsRange.getBoundingLocation(),
            `'${lhs.accessSourceToken?.text ?? '[ ]'}' expects one integer argument, but got '${rhsText}'.`
        );
        return;
    }

    assert(false);
}

enum MismatchKind {
    MissingAliasOperator = 'MissingAliasOperator',
    MismatchOverload = 'MismatchOverload',
    MismatchIndexedPropertyAccessor = 'MismatchIndexedPropertyAccessor',
}

type MismatchReason = {
    reason: MismatchKind.MissingAliasOperator,
    foundButNotFunction?: boolean
} | {
    reason: MismatchKind.MismatchOverload,
} | {
    reason: MismatchKind.MismatchIndexedPropertyAccessor,
}

function hasMismatchReason(reason: ResolvedType | MismatchReason | undefined): reason is MismatchReason {
    if (reason === undefined) return false;
    return 'reason' in reason;
}

interface LhsOperatorCallArgs {
    callerOperator: TokenObject,
    alias: string,
    lhs: ResolvedType,
    rhs: ResolvedType | (ResolvedType | undefined)[],
    rhsRange: TokenRange,
    rhsArgNames: (TokenObject | undefined)[] | undefined
}

function checkLhsOverloadedOperatorCall(args: LhsOperatorCallArgs): ResolvedType | undefined | MismatchReason {
    const {callerOperator, alias, lhs, rhs, rhsRange, rhsArgNames} = args;

    const rhsArgs = Array.isArray(args.rhs) ? args.rhs : [args.rhs];

    if (lhs.accessSourceVariable?.isIndexedPropertyAccessor) {
        if (rhsArgs.length == 1 && canTypeConvert(rhsArgs[0], resolvedBuiltinInt)) {
            // e.g., `myNotebook[123]` where `class MyNotebook { string get_texts(int idx) property { ... } }`
            return lhs.accessSourceVariable.type;
        }

        return {reason: MismatchKind.MismatchIndexedPropertyAccessor};
    }

    if (lhs.typeOrFunc.isType() && lhs.typeOrFunc.isPrimitiveType()) {
        return {reason: MismatchKind.MissingAliasOperator};
    }

    if (lhs.scopePath === undefined) {
        return {reason: MismatchKind.MissingAliasOperator};
    }

    const aliasFunction =
        resolveActiveScope(lhs.scopePath).lookupScope(lhs.identifierText)?.lookupSymbol(alias);
    if (aliasFunction === undefined) {
        return {reason: MismatchKind.MissingAliasOperator};
    } else if (aliasFunction.isFunctionHolder() === false) {
        return {reason: MismatchKind.MissingAliasOperator, foundButNotFunction: true};
    }

    const callerArgs = rhsArgs.map((arg, i) => {
        return {
            name: rhsArgNames !== undefined ? rhsArgNames[i] : undefined,
            range: undefined, // We don't need to specify the range because we'll print the error later.
            type: arg
        };
    });

    const evaluated = evaluateFunctionCall({
        callerIdentifier: callerOperator,
        callerRange: new TokenRange(callerOperator, callerOperator),
        callerArgs: callerArgs,
        calleeFuncHolder: aliasFunction,
        calleeTemplateTranslator: lhs.templateTranslator // FIXME?
    });

    if (evaluated.bestMatching === undefined) {
        return {reason: MismatchKind.MismatchOverload};
    }

    // Add a reference to the function call.
    evaluated.sideEffect();

    return evaluated.returnType;
}

const widerNumberTable = [
    'double', 'float', 'int64', 'uint64', 'int', 'uint', 'int16', 'uint16', 'int8', 'uint'
];

function takeWiderNumberType(lhs: ResolvedType, rhs: ResolvedType): ResolvedType {
    lhs = normalizeType(lhs)!;
    rhs = normalizeType(rhs)!;

    assert(lhs.typeOrFunc.isType() && lhs.typeOrFunc.isNumberType());
    assert(rhs.typeOrFunc.isType() && rhs.typeOrFunc.isNumberType());

    // Take the wider number type.
    for (const type of widerNumberTable) {
        if (lhs.identifierText === type) return lhs;
        if (rhs.identifierText === type) return rhs;
    }

    assert(false);
}


import {resolveActiveScope, SymbolScope} from "./symbolScope";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {ResolvedType} from "./resolvedType";
import {TokenRange} from "../compiler_parser/tokenRange";
import {evaluateFunctionCall} from "./functionCall";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {stringifyResolvedType, stringifyResolvedTypes} from "./symbolUtils";
import assert = require("node:assert");
import {canTypeCast} from "./typeCast";
import {resolvedBuiltinInt} from "./builtinType";
import {normalizeType} from "./typeConversion";

type OverloadedOperatorCallArgs = {
    // For dual operators
    callerScope: SymbolScope,
    callerOperator: TokenObject,
    alias: string,
    alias_r: string,
    lhs: ResolvedType,
    lhsRange: TokenRange,
    rhs: ResolvedType,
    rhsRange: TokenRange
} | {
    // For the case where the alias_r is not defined.
    callerScope: SymbolScope,
    callerOperator: TokenObject,
    alias: string,
    alias_r?: undefined, // The alias_r is not defined.
    lhs: ResolvedType,
    lhsRange: TokenRange,
    rhs: ResolvedType | (ResolvedType | undefined)[], // If alias_r is not defined, the rhs can be an array.
    rhsRange: TokenRange
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
        if (canTypeCast(rhs, lhs)) return lhs;
    } else if (rhs.typeOrFunc.isNumberType()) {
        if (canTypeCast(lhs, rhs)) return rhs;
    }

    return undefined;
}

/**
 * Check if the comparison operator call is available.
 */
export function canComparisonOperatorCall(lhs: ResolvedType, rhs: ResolvedType): ResolvedType | undefined {
    // FIXME: Probably it is wrong.
    if (canTypeCast(lhs, rhs)) return lhs;
    if (canTypeCast(rhs, lhs)) return rhs;
    return undefined;
}

// -----------------------------------------------

function checkOverloadedOperatorCallInternal(args: OverloadedOperatorCallArgs): ResolvedType | undefined {
    const lhsResult = checkLhsOverloadedOperatorCall({
        callerScope: args.callerScope,
        callerOperator: args.callerOperator,
        alias: args.alias,
        lhs: args.lhs,
        rhs: args.rhs,
        rhsRange: args.rhsRange
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
        callerScope: args.callerScope,
        callerOperator: args.callerOperator,
        alias: args.alias_r,
        lhs: args.rhs,
        rhs: args.lhs,
        rhsRange: args.lhsRange
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

    const operatorLocation = callerOperator.location; // FIXME: More user-friendly location.

    // FIXME: Consider the rhs reason.

    if (lhsReason.reason === MismatchKind.MissingAliasOperator) {
        if (lhsReason.foundButNotFunction) {
            analyzerDiagnostic.add(
                operatorLocation,
                `The operator '${alias}' in ${stringifyResolvedType(lhs)} is found, but it is not a function.`
            );
            return;
        } else if (alias_r !== undefined) {
            analyzerDiagnostic.add(
                operatorLocation,
                `The operator '${stringifyResolvedType(lhs)}::${alias}' or '${stringifyResolvedType(rhs)}::${alias_r}' is not defined.`
            );
            return;
        } else {
            analyzerDiagnostic.add(
                operatorLocation,
                `The operator '${alias}' in ${stringifyResolvedType(lhs)} is not defined.`
            );
            return;
        }
    } else if (lhsReason.reason === MismatchKind.MismatchOverload) {
        const rhsText = Array.isArray(rhs) ? stringifyResolvedTypes(rhs) : stringifyResolvedType(rhs);
        analyzerDiagnostic.add(
            operatorLocation,
            `The operator '${alias}' in ${stringifyResolvedType(lhs)} does not match the argument types ${rhsText}.`
        );
        return;
    }

    assert(false);
}

enum MismatchKind {
    MissingAliasOperator = 'MissingAliasOperator',
    MismatchOverload = 'MismatchOverload',
}

type MismatchReason = {
    reason: MismatchKind.MissingAliasOperator,
    foundButNotFunction?: boolean
} | {
    reason: MismatchKind.MismatchOverload,
}

function hasMismatchReason(reason: ResolvedType | MismatchReason | undefined): reason is MismatchReason {
    if (reason === undefined) return false;
    return 'reason' in reason;
}

interface LhsOperatorCallArgs {
    callerScope: SymbolScope,
    callerOperator: TokenObject,
    alias: string,
    lhs: ResolvedType,
    rhs: ResolvedType | (ResolvedType | undefined)[],
    rhsRange: TokenRange
}

function checkLhsOverloadedOperatorCall(args: LhsOperatorCallArgs): ResolvedType | undefined | MismatchReason {
    const {callerScope, callerOperator, alias, lhs, rhs, rhsRange} = args;

    const rhsArgs = Array.isArray(args.rhs) ? args.rhs : [args.rhs];

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

    const evaluated = evaluateFunctionCall({
        callerScope: callerScope,
        callerIdentifier: callerOperator,
        callerRange: new TokenRange(callerOperator, callerOperator),
        callerArgRanges: [rhsRange],
        callerArgTypes: rhsArgs,
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


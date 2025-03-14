import {resolveActiveScope, SymbolScope} from "./symbolScope";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {ResolvedType} from "./resolvedType";
import {TokenRange} from "../compiler_parser/tokenRange";
import {evaluateFunctionCall} from "./functionCall";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {stringifyResolvedType, stringifyResolvedTypes} from "./symbolUtils";
import assert = require("node:assert");

type OperatorCallArgs = {
    callerScope: SymbolScope,
    operator: TokenObject,
    alias: string,
    alias_r: string,
    lhs: ResolvedType,
    lhsRange: TokenRange,
    rhs: ResolvedType,
    rhsRange: TokenRange
} | {
    // For the case where the alias_r is not defined.
    callerScope: SymbolScope,
    operator: TokenObject,
    alias: string,
    alias_r?: undefined,
    lhs: ResolvedType,
    lhsRange: TokenRange,
    rhs: (ResolvedType | undefined)[], // If alias_r is not defined, the rhs can be an array.
    rhsRange: TokenRange
}

/**
 * Check if the operator call is valid.
 */
export function checkOperatorCall(args: OperatorCallArgs) {
    return checkOperatorCallInternal(args);
}

// -----------------------------------------------

function checkOperatorCallInternal(args: OperatorCallArgs): ResolvedType | undefined {
    const lhsResult = checkLhsOperatorCall({
        callerScope: args.callerScope,
        operator: args.operator,
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

    const rhsResult = checkLhsOperatorCall({
        callerScope: args.callerScope,
        operator: args.operator,
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

function handleMismatchError(args: OperatorCallArgs, lhsReason: MismatchReason, rhsReason?: MismatchReason) {
    const {operator, alias, alias_r, lhs, rhs} = args;

    const operatorLocation = operator.location; // FIXME: More user-friendly location.

    // FIXME: Consider the rhs reason.

    if (lhsReason.reason === MismatchKind.MissingAliasOperator) {
        if (lhsReason.foundButNotFunction) {
            analyzerDiagnostic.add(
                operatorLocation,
                `The operator '${alias}' of ${stringifyResolvedType(lhs)} is found, but it is not a function.`
            );
            return;
        } else if (alias_r !== undefined) {
            analyzerDiagnostic.add(
                operatorLocation,
                `The operator '${alias}' of ${stringifyResolvedType(lhs)} or '${alias_r}' of ${stringifyResolvedType(rhs)} is not defined.`
            );
            return;
        } else {
            analyzerDiagnostic.add(
                operatorLocation,
                `The operator '${alias}' of ${stringifyResolvedType(lhs)} is not defined.`
            );
            return;
        }
    } else if (lhsReason.reason === MismatchKind.MismatchOverload) {
        const rhsText = Array.isArray(rhs) ? stringifyResolvedTypes(rhs) : stringifyResolvedType(rhs);
        analyzerDiagnostic.add(
            operatorLocation,
            `The operator '${alias}' of ${stringifyResolvedType(lhs)} does not match the argument types ${rhsText}.`
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
    operator: TokenObject,
    alias: string,
    lhs: ResolvedType,
    rhs: ResolvedType | (ResolvedType | undefined)[],
    rhsRange: TokenRange
}

function checkLhsOperatorCall(args: LhsOperatorCallArgs): ResolvedType | undefined | MismatchReason {
    const {callerScope, operator, alias, lhs, rhs, rhsRange} = args;

    const rhsArgs = Array.isArray(args.rhs) ? args.rhs : [args.rhs];

    if (lhs.typeOrFunc.isType() && lhs.typeOrFunc.isPrimitiveType()) {
        return {reason: MismatchKind.MissingAliasOperator};
    }

    if (lhs.scopePath === undefined) {
        return {reason: MismatchKind.MissingAliasOperator};
    }

    const aliasFunction = resolveActiveScope(lhs.scopePath).lookupSymbol(alias);
    if (aliasFunction === undefined) {
        return {reason: MismatchKind.MissingAliasOperator};
    } else if (aliasFunction.isFunctionHolder() === false) {
        return {reason: MismatchKind.MissingAliasOperator, foundButNotFunction: true};
    }

    const evaluated = evaluateFunctionCall({
        callerScope: callerScope,
        callerIdentifier: operator,
        callerRange: new TokenRange(operator, operator),
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

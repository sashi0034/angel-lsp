import {
    SymbolType,
    SymbolObjectHolder,
} from "./symbolObject";
import {AccessModifier, NodeName} from "../compiler_parser/nodes";
import {resolveActiveScope, isScopeChildOrGrandchild, SymbolScope} from "./symbolScope";
import assert = require("assert");
import {stringifyResolvedType} from "./symbolUtils";
import {ResolvedType} from "./resolvedType";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {TokenRange} from "../compiler_parser/tokenRange";
import {canDownCast, evaluateConversionCost} from "./typeConversion";

/**
 * Check if the source type can be converted to the destination type.
 * If it cannot be converted, an error message is added to the diagnostic.
 * @param src
 * @param dest
 * @param nodeRange
 */
export function checkTypeCast(
    src: ResolvedType | undefined,
    dest: ResolvedType | undefined,
    nodeRange: TokenRange,
): boolean {
    if (canTypeCast(src, dest)) return true;

    analyzerDiagnostic.add(
        nodeRange.getBoundingLocation(),
        `'${stringifyResolvedType(src)}' cannot be converted to '${stringifyResolvedType(dest)}'.`
    );

    return false;
}

/**
 * Check if the source type can be converted to the destination type.
 * @param src
 * @param dest
 */
export function canTypeCast(
    src: ResolvedType | undefined, dest: ResolvedType | undefined
): boolean {
    if (src === undefined || dest === undefined) return true;

    const cost = evaluateConversionCost(src, dest);
    return cost !== undefined;
}

/**
 * Check if the accessing scope is allowed to access the instance member.
 * @param accessingScope
 * @param instanceMember
 */
export function isAllowedToAccessInstanceMember(accessingScope: SymbolScope, instanceMember: SymbolObjectHolder): boolean {
    const instanceMemberSymbol = instanceMember.toList()[0]; // FIXME: What if there are multiple functions?

    if (instanceMemberSymbol instanceof SymbolType) return true;

    if (instanceMemberSymbol.accessRestriction === undefined) return true;

    const instanceMemberScope = resolveActiveScope(instanceMemberSymbol.scopePath);

    if (instanceMemberSymbol.accessRestriction === AccessModifier.Private) {
        return isScopeChildOrGrandchild(accessingScope, instanceMemberScope);
    } else if (instanceMemberSymbol.accessRestriction === AccessModifier.Protected) {
        if (instanceMemberScope.linkedNode === undefined) return false;

        const nearestClassScope = accessingScope.takeParentByNode([NodeName.Class, NodeName.Interface]);
        if (nearestClassScope === undefined || nearestClassScope.parentScope === undefined) return false;

        // Get the symbol of the class to which the accessing scope belongs.
        const nearestClassSymbol = nearestClassScope.parentScope.lookupSymbol(nearestClassScope.key);
        if (nearestClassSymbol === undefined || nearestClassSymbol.isType() === false) return false;

        // Get the symbol of the class to which the instance member belongs.
        if (instanceMemberScope.parentScope === undefined) return false;
        const instanceClassSymbol = instanceMemberScope.parentScope.lookupSymbol(instanceMemberScope.key);
        if (instanceClassSymbol === undefined || instanceClassSymbol.isType() === false) return false;

        return (canDownCast(nearestClassSymbol, instanceClassSymbol));
    } else {
        assert(false);
    }
}

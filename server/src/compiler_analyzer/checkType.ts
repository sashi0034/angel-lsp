import {
    SymbolFunction,
    SymbolType,
    SymbolObjectHolder,
} from "./symbolObject";
import {AccessModifier, NodeName} from "../compiler_parser/nodes";
import {resolveActiveScope, isScopeChildOrGrandchild, SymbolScope} from "./symbolScope";
import assert = require("assert");
import {stringifyResolvedType} from "./symbolUtils";
import {ResolvedType, resolveTemplateType} from "./resolvedType";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {TokenRange} from "../compiler_parser/tokenRange";
import {canDownCast, evaluateConversionCost} from "./checkConversion";

/**
 * Check if the source type can be converted to the destination type.
 * If it cannot be converted, an error message is added to the diagnostic.
 * @param src
 * @param dest
 * @param nodeRange
 */
export function checkTypeMatch(
    src: ResolvedType | undefined,
    dest: ResolvedType | undefined,
    nodeRange: TokenRange,
): boolean {
    if (canTypeConvert(src, dest)) return true;

    analyzerDiagnostic.add(
        nodeRange.getBoundingLocation(),
        `'${stringifyResolvedType(src)}' cannot be converted to '${stringifyResolvedType(dest)}'.`);
    return false;
}

/**
 * Check if the source type can be converted to the destination type.
 * @param src
 * @param dest
 */
export function canTypeConvert(
    src: ResolvedType | undefined, dest: ResolvedType | undefined
): boolean {
    if (src === undefined || dest === undefined) return true;

    const cost = evaluateConversionCost(src, dest);
    return cost !== undefined;
}

// Check if the symbol can be accessed from the scope.
export function isAllowedToAccessMember(checkingScope: SymbolScope, declaredSymbolHolder: SymbolObjectHolder): boolean {
    const declaredSymbol = declaredSymbolHolder.toList()[0];
    if (declaredSymbol instanceof SymbolType) return true;
    if (declaredSymbol.accessRestriction === undefined) return true;

    const scopePath = resolveActiveScope(declaredSymbol.scopePath);

    if (declaredSymbol.accessRestriction === AccessModifier.Private) {
        return isScopeChildOrGrandchild(checkingScope, scopePath);
    } else if (declaredSymbol.accessRestriction === AccessModifier.Protected) {
        if (scopePath.linkedNode === undefined) return false;

        const checkingOuterScope = checkingScope.takeParentByNode([NodeName.Class, NodeName.Interface]);
        if (checkingOuterScope === undefined || checkingOuterScope.parentScope === undefined) return false;

        // Get the symbol of the class to which the referring part belongs.
        const checkingOuterClass = checkingOuterScope.parentScope.lookupSymbol(checkingOuterScope.key);
        if (checkingOuterClass instanceof SymbolType === false) return false;

        // Get the symbol of the class to which the declared part belongs.
        if (scopePath.parentScope === undefined) return false;
        const declaredOuterClass = scopePath.parentScope.lookupSymbol(scopePath.key);
        if (declaredOuterClass instanceof SymbolType === false) return false;

        return (canDownCast(checkingOuterClass, declaredOuterClass));
    } else {
        assert(false);
    }
}

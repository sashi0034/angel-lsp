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

// function isTypeMatchInternal(
//     src: ResolvedType, dest: ResolvedType
// ): boolean {
//     const srcType = src.typeOrFunc;
//     const destType = dest.typeOrFunc;
//
//     // Check the function handler type.
//     if (srcType.isFunction()) {
//
//         // Are we trying to pass something into ?
//         if (destType instanceof SymbolType)
//             if (destType.identifierText === '?') return true;
//
//         // if (dest.isHandler === false) return false; // FIXME: Handler Checking?
//         return isFunctionHandlerMatch(srcType, destType);
//     } else if (destType.isFunction()) {
//         return false;
//     }
//
//     const srcNode = srcType.linkedNode;
//     const destNode = destType.linkedNode;
//
//     if (destType.identifierText === '?' || destType.identifierText === 'auto') return true;
//
//     if (srcType.isPrimitiveType()) {
//         // Succeeds if it can be cast from one primitive type to another primitive type.
//         if (canCastFromPrimitiveType(srcType, destType)) return true;
//     } else {
//         // Succeeds if they both point to the same type.
//         if (srcType.identifierToken === destType.identifierToken) return true;
//
//         if (srcNode?.nodeName === NodeName.Enum && destType.isNumberType()) return true;
//
//         // Succeeds if any of the inherited types in the source match the destination.
//         if (canDownCast(srcType, destType)) return true;
//
//         // Succeeds if the source type has an implicit conversion operator that matches the destination type.
//         const opImplConvHolder =
//             tryResolveActiveScope(srcType.membersScope)?.symbolTable.get('opImplConv');
//         if (opImplConvHolder?.isFunctionHolder()) {
//             for (const opImplConv of opImplConvHolder.toList()) {
//                 if (canTypeConvert(opImplConv.returnType, dest)) return true;
//             }
//         }
//     }
//
//     // Fails if the destination type is not a class.
//     if (destType.isPrimitiveType() || destNode?.nodeName !== NodeName.Class) return false;
//
//     // Determine if it matches the constructor.
//     const destIdentifier = destNode.identifier.text;
//     return canConstructImplicitly(srcType, tryResolveActiveScope(dest.sourceScope), destIdentifier);
// }

function isFunctionHandlerMatch(srcType: SymbolFunction, destType: SymbolType | SymbolFunction) {
    if (destType instanceof SymbolFunction === false) return false;
    if (canTypeConvert(srcType.returnType, destType.returnType) === false) return false;
    if (srcType.parameterTypes.length !== destType.parameterTypes.length) return false;
    for (let i = 0; i < srcType.parameterTypes.length; i++) {
        if (canTypeConvert(srcType.parameterTypes[i], destType.parameterTypes[i]) === false) return false;
    }

    // FIXME: Calculate cost of conversion

    return true;
}

// function canCastFromPrimitiveType(
//     srcType: SymbolType, destType: SymbolType
// ) {
//     const srcNode = srcType.linkedNode;
//     const destNode = destType.linkedNode;
//
//     if (srcType.isTypeParameter) {
//         return destType.isTypeParameter && srcType.identifierToken.equals(destType.identifierToken);
//     }
//
//     if (srcType.identifierText === 'void') {
//         return false;
//     }
//
//     if (srcType.isNumberType()) {
//         return destType.isNumberType();
//     }
//
//     if (srcType.identifierText === 'bool') {
//         return destType.identifierText === 'bool';
//     }
//
//     // FIXME?
//     return true;
// }
//
// function canConstructImplicitly(
//     srcType: SymbolType,
//     destScope: SymbolScope | undefined,
//     destIdentifier: string
// ) {
//     if (destScope === undefined) return false;
//
//     // Search for the constructor of the given type from the scope to which the given type belongs.
//     const constructorScope = destScope.lookupScope(destIdentifier);
//     if (constructorScope === undefined || constructorScope.linkedNode?.nodeName !== NodeName.Class) return false;
//
//     // Search for the constructor of the given type from the scope of the type itself.
//     const constructor = constructorScope.lookupSymbol(destIdentifier);
//     if (constructor === undefined || constructor.isFunctionHolder() === false) return false;
//
//     if (srcType.linkedNode === undefined) return true; // FIXME?
//
//     return canConstructBy(constructor, 0, srcType.linkedNode);
// }
//
// function canConstructBy(constructorHolder: SymbolFunctionHolder, overloadIndex: number, srcType: TypeDefinitionNode): boolean {
//     const constructor = constructorHolder.overloadList[overloadIndex];
//
//     // Succeeds if the constructor has one argument and that argument matches the source type.
//     if (constructor.parameterTypes.length === 1) {
//         const paramType = constructor.parameterTypes[0];
//         if (paramType !== undefined
//             && paramType.typeOrFunc instanceof SymbolType
//             && paramType.typeOrFunc.linkedNode === srcType
//         ) {
//             return true;
//         }
//     }
//
//     // If there are overloads, check those as well.
//     if (constructorHolder.count > overloadIndex + 1) {
//         return canConstructBy(constructorHolder, overloadIndex + 1, srcType);
//     }
//
//     return false;
// }

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

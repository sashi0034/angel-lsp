import {
    isSourcePrimitiveType,
    PrimitiveType,
    DefinitionSource,
    SymbolFunction,
    SymbolObject,
    SymbolType,
} from "./symbols";
import {AccessModifier, NodeName, ParsedRange} from "../compiler_parser/nodes";
import {getNodeLocation} from "../compiler_parser/nodesUtils";
import {findScopeShallowly, findScopeWithParentByNodes, isScopeChildOrGrandchild, SymbolScope} from "./symbolScope";
import {diagnostic} from "../code/diagnostic";
import assert = require("assert");
import {findSymbolShallowly, resolveTemplateType, stringifyResolvedType} from "./symbolUtils";
import {getGlobalSettings} from "../code/settings";
import {ResolvedType} from "./resolvedType";

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
    nodeRange: ParsedRange,
): boolean {
    if (canTypeConvert(src, dest)) return true;

    diagnostic.addError(getNodeLocation(nodeRange), `'${stringifyResolvedType(src)}' cannot be converted to '${stringifyResolvedType(dest)}'.`);
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

    let resolvedSrc: ResolvedType | undefined = src;
    if (src.templateTranslate !== undefined)
        resolvedSrc = resolveTemplateType(src.templateTranslate, src);

    let resolvedDest: ResolvedType | undefined = dest;
    if (dest.templateTranslate !== undefined)
        resolvedDest = resolveTemplateType(dest.templateTranslate, dest);

    if (resolvedSrc === undefined || resolvedDest === undefined) return true;

    return isTypeMatchInternal(resolvedSrc, resolvedDest);
}

function isTypeMatchInternal(
    src: ResolvedType, dest: ResolvedType
): boolean {
    const srcType = src.symbolType;
    const destType = dest.symbolType;

    // Check the function handler type.
    if (srcType instanceof SymbolFunction) {

        // Are we trying to pass something into ?
        if (destType instanceof SymbolType)
            if (destType.definitionSource === PrimitiveType.Any) return true;

        // if (dest.isHandler === false) return false; // FIXME: Handler Checking?
        return isFunctionHandlerMatch(srcType, destType);
    } else if (destType instanceof SymbolFunction) {
        return false;
    }

    const srcNode = srcType.definitionSource;
    const destNode = destType.definitionSource;

    if (destNode === PrimitiveType.Any || destNode === PrimitiveType.Auto) return true;

    if (isSourcePrimitiveType(srcNode)) {
        // Succeeds if it can be cast from one primitive type to another primitive type.
        if (canCastFromPrimitiveType(srcType, destType)) return true;
    } else {
        // Succeeds if they both point to the same type.
        if (srcType.declaredPlace === destType.declaredPlace) return true;

        if (srcNode.nodeName === NodeName.Enum && destNode === PrimitiveType.Number) return true;

        // Succeeds if any of the inherited types in the source match the destination.
        if (canDownCast(srcType, destType)) return true;

        // Succeeds if the source type has an implicit conversion operator that matches the destination type.
        let opImplConv = srcType.membersScope?.symbolMap.get('opImplConv');
        if (opImplConv !== undefined && opImplConv instanceof SymbolFunction) {
            for (; ;) {
                if (canTypeConvert(opImplConv.returnType, dest)) return true;
                if (opImplConv.nextOverload === undefined) break;
                opImplConv = opImplConv.nextOverload;
            }
        }
    }

    // Fails if the destination type is not a class.
    if (isSourcePrimitiveType(destNode) || destNode.nodeName !== NodeName.Class) return false;

    // Determine if it matches the constructor.
    const destIdentifier = destNode.identifier.text;
    return canConstructImplicitly(srcType, dest.sourceScope, destIdentifier);
}

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

function canDownCast(
    srcType: SymbolType, destType: SymbolType
): boolean {
    const srcNode = srcType.definitionSource;
    if (isSourcePrimitiveType(srcNode)) return false;

    if (srcType.definitionSource === destType.definitionSource) return true;

    if (srcNode.nodeName === NodeName.Class || srcNode.nodeName === NodeName.Interface) {
        if (srcType.baseList === undefined) return false;
        for (const srcBase of srcType.baseList) {
            if (srcBase?.symbolType === undefined) continue;
            if (srcBase.symbolType instanceof SymbolType === false) continue;
            if (canDownCast(srcBase.symbolType, destType)) return true;
        }
    }

    return false;
}

// Judge if the class has a metadata that indicates it is a built-in string type.
function isSourceBuiltinString(source: DefinitionSource): boolean {
    if (isSourcePrimitiveType(source)) return false;

    if (source.nodeName != NodeName.Class) return false;

    const builtinStringMetadata = "BuiltinString";
    return source.metadata.length === 1 && source.metadata[0].text === builtinStringMetadata;
}

function canCastFromPrimitiveType(
    srcType: SymbolType, destType: SymbolType
) {
    const srcNode = srcType.definitionSource;
    const destNode = destType.definitionSource;

    switch (srcNode) {
    case PrimitiveType.Template:
        return destNode === PrimitiveType.Template && srcType.declaredPlace === destType.declaredPlace;
    case PrimitiveType.String: {
        const destName = destType.declaredPlace.text;
        if (isSourceBuiltinString(destNode)) return true;
        return getGlobalSettings().builtinStringTypes.includes(destName);
    }
    case PrimitiveType.Void:
        return false;
    case PrimitiveType.Number:
        return destType.definitionSource === PrimitiveType.Number;
    case PrimitiveType.Bool:
        return destType.definitionSource === PrimitiveType.Bool;
    case PrimitiveType.Any:
        return true;
    case PrimitiveType.Auto:
        return true;
    default:
        assert(false);
    }
}

function canConstructImplicitly(
    srcType: SymbolType,
    destScope: SymbolScope | undefined,
    destIdentifier: string
) {
    if (destScope === undefined) return false;

    // Search for the constructor of the given type from the scope to which the given type belongs.
    const constructorScope = findScopeShallowly(destScope, destIdentifier);
    if (constructorScope === undefined || constructorScope.ownerNode?.nodeName !== NodeName.Class) return false;

    // Search for the constructor of the given type from the scope of the type itself.
    const constructor = findSymbolShallowly(constructorScope, destIdentifier);
    if (constructor === undefined || constructor instanceof SymbolFunction === false) return false;

    return canConstructBy(constructor, srcType.definitionSource);
}

function canConstructBy(constructor: SymbolFunction, srcType: DefinitionSource): boolean {
    // Succeeds if the constructor has one argument and that argument matches the source type.
    if (constructor.parameterTypes.length === 1) {
        const paramType = constructor.parameterTypes[0];
        if (paramType !== undefined
            && paramType.symbolType instanceof SymbolType
            && paramType.symbolType.definitionSource === srcType
        ) {
            return true;
        }
    }

    // If there are overloads, check those as well.
    if (constructor.nextOverload !== undefined) {
        return canConstructBy(constructor.nextOverload, srcType);
    }

    return false;
}

// Check if the symbol can be accessed from the scope.
export function isAllowedToAccessMember(checkingScope: SymbolScope, declaredSymbol: SymbolObject): boolean {
    if (declaredSymbol instanceof SymbolType) return true;
    if (declaredSymbol.accessRestriction === undefined) return true;

    const declaredScope = declaredSymbol.declaredScope;

    if (declaredSymbol.accessRestriction === AccessModifier.Private) {
        return isScopeChildOrGrandchild(checkingScope, declaredScope);
    } else if (declaredSymbol.accessRestriction === AccessModifier.Protected) {
        if (declaredScope.ownerNode === undefined) return false;

        const checkingOuterScope = findScopeWithParentByNodes(checkingScope, [NodeName.Class, NodeName.Interface]);
        if (checkingOuterScope === undefined || checkingOuterScope.parentScope === undefined) return false;

        // Get the symbol of the class to which the referring part belongs.
        const checkingOuterClass = findSymbolShallowly(checkingOuterScope.parentScope, checkingOuterScope.key);
        if (checkingOuterClass instanceof SymbolType === false) return false;

        // Get the symbol of the class to which the declared part belongs.
        if (declaredScope.parentScope === undefined) return false;
        const declaredOuterClass = findSymbolShallowly(declaredScope.parentScope, declaredScope.key);
        if (declaredOuterClass instanceof SymbolType === false) return false;

        return (canDownCast(checkingOuterClass, declaredOuterClass));
    } else {
        assert(false);
    }
}

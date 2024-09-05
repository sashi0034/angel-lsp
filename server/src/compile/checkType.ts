import {
    DeducedType,
    isSourcePrimitiveType,
    PrimitiveType,
    SourceType,
    SymbolFunction,
    SymbolObject,
    SymbolType,
    SymbolKind,
    SymbolScope
} from "./symbols";
import {AccessModifier, NodeName, ParsedRange} from "./nodes";
import {getNodeLocation} from "./nodesUtils";
import {findScopeShallowly, findScopeWithParentByNodes, isScopeChildOrGrandchild} from "./symbolScopes";
import {diagnostic} from "../code/diagnostic";
import assert = require("assert");
import {findSymbolShallowly, resolveTemplateType, stringifyDeducedType} from "./symbolUtils";

export function checkTypeMatch(
    src: DeducedType | undefined,
    dest: DeducedType | undefined,
    nodeRange: ParsedRange,
): boolean {
    if (isTypeMatch(src, dest)) return true;

    diagnostic.addError(getNodeLocation(nodeRange), `'${stringifyDeducedType(src)}' cannot be converted to '${stringifyDeducedType(dest)}'.`);
    return false;
}

export function isTypeMatch(
    src: DeducedType | undefined, dest: DeducedType | undefined
): boolean {
    if (src === undefined || dest === undefined) return true;

    let resolvedSrc: DeducedType | undefined = src;
    if (src.templateTranslate !== undefined)
        resolvedSrc = resolveTemplateType(src.templateTranslate, src);

    let resolvedDest: DeducedType | undefined = dest;
    if (dest.templateTranslate !== undefined)
        resolvedDest = resolveTemplateType(dest.templateTranslate, dest);

    if (resolvedSrc === undefined || resolvedDest === undefined) return true;

    return isTypeMatchInternal(resolvedSrc, resolvedDest);
}

export function isTypeMatchInternal(
    src: DeducedType, dest: DeducedType
): boolean {
    const srcType = src.symbolType;
    const destType = dest.symbolType;

    // Check the function handler type. | 関数ハンドラ型のチェック
    if (srcType.symbolKind === SymbolKind.Function) {
        // if (dest.isHandler === false) return false; // FIXME: ハンドラチェック?
        return isFunctionHandlerMatch(srcType, destType);
    } else if (destType.symbolKind === SymbolKind.Function) {
        return false;
    }

    const srcNode = srcType.sourceType;
    const destNode = destType.sourceType;

    if (destNode === PrimitiveType.Any || destNode === PrimitiveType.Auto) return true;

    if (isSourcePrimitiveType(srcNode)) {
        // OK if it can be cast from one primitive type to another. | プリミティブからプリミティブへキャスト可能なら OK
        if (canCastFromPrimitiveType(srcType, destType)) return true;
    } else {
        // OK if they point to the same type. | 同じ型を指しているなら OK
        if (srcType.declaredPlace === destType.declaredPlace) return true;

        // OK if any of the inherited types match the destination. | 継承した型のいずれかが移動先に当てはまるなら OK
        if (canDownCast(srcType, destType)) return true;
    }

    // NG if the destination type is not a class. | 移動先の型がクラスでないなら NG
    if (isSourcePrimitiveType(destNode) || destNode.nodeName !== NodeName.Class) return false;

    // Determine if it matches the constructor. | コンストラクタに当てはまるかで判定
    const destIdentifier = destNode.identifier.text;
    return canConstructImplicitly(srcType, dest.sourceScope, destIdentifier);
}

function isFunctionHandlerMatch(srcType: SymbolFunction, destType: SymbolType | SymbolFunction) {
    if (destType.symbolKind !== SymbolKind.Function) return false;
    if (isTypeMatch(srcType.returnType, destType.returnType) === false) return false;
    if (srcType.parameterTypes.length !== destType.parameterTypes.length) return false;
    for (let i = 0; i < srcType.parameterTypes.length; i++) {
        if (isTypeMatch(srcType.parameterTypes[i], destType.parameterTypes[i]) === false) return false;
    }

    // FIXME: 関数ハンドラのオーバーロードなどの影響について要検証

    return true;
}

function canDownCast(
    srcType: SymbolType, destType: SymbolType
): boolean {
    const srcNode = srcType.sourceType;
    if (isSourcePrimitiveType(srcNode)) return false;

    if (srcType.sourceType === destType.sourceType) return true;

    if (srcNode.nodeName === NodeName.Class || srcNode.nodeName === NodeName.Interface) {
        if (srcType.baseList === undefined) return false;
        for (const srcBase of srcType.baseList) {
            if (srcBase?.symbolType === undefined) continue;
            if (srcBase.symbolType.symbolKind !== SymbolKind.Type) continue;
            if (canDownCast(srcBase.symbolType, destType)) return true;
        }
    }

    return false;
}

function canCastFromPrimitiveType(
    srcType: SymbolType, destType: SymbolType
) {
    const srcNode = srcType.sourceType;
    const destNode = destType.sourceType;

    switch (srcNode) {
    case PrimitiveType.Template:
        return destNode === PrimitiveType.Template && srcType.declaredPlace === destType.declaredPlace;
    case PrimitiveType.String: {
        const destName = destType.declaredPlace.text;

        const candidates = [
            "string", "string_t", "String",
        ];

        return candidates.includes(destName);
    }
    case PrimitiveType.Void:
        return false;
    case PrimitiveType.Number:
        return destType.sourceType === PrimitiveType.Number;
    case PrimitiveType.Bool:
        return destType.sourceType === PrimitiveType.Bool;
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

    // Search for the constructor of the type from the scope to which the type belongs.
    // 型が属するスコープから、その型自身のスコープを検索
    const constructorScope = findScopeShallowly(destScope, destIdentifier);
    if (constructorScope === undefined || constructorScope.ownerNode?.nodeName !== NodeName.Class) return false;

    // Search for the constructor from the scope of the type itself.
    // 型自身のスコープから、そのコンストラクタを検索
    const constructor = findSymbolShallowly(constructorScope, destIdentifier);
    if (constructor === undefined || constructor.symbolKind !== SymbolKind.Function) return false;

    return canConstructBy(constructor, srcType.sourceType);
}

function canConstructBy(constructor: SymbolFunction, srcType: SourceType): boolean {
    // OK if the constructor has one argument and that argument matches the source type.
    // コンストラクタの引数が1つで、その引数が移動元の型と一致するなら OK
    if (constructor.parameterTypes.length === 1) {
        const paramType = constructor.parameterTypes[0];
        if (paramType !== undefined
            && paramType.symbolType.symbolKind === SymbolKind.Type
            && paramType.symbolType.sourceType === srcType
        ) {
            return true;
        }
    }

    // If there are overloads, check those as well. | オーバーロードが存在するならそれについても確認
    if (constructor.nextOverload !== undefined) {
        return canConstructBy(constructor.nextOverload, srcType);
    }

    return false;
}

// Check if the symbol can be accessed from the scope. | シンボルがそのスコープからアクセス可能かを調べる
export function isAllowedToAccessMember(checkingScope: SymbolScope, declaredSymbol: SymbolObject): boolean {
    if (declaredSymbol.symbolKind === SymbolKind.Type) return true;
    if (declaredSymbol.accessRestriction === undefined) return true;

    const declaredScope = declaredSymbol.declaredScope;

    if (declaredSymbol.accessRestriction === AccessModifier.Private) {
        return isScopeChildOrGrandchild(checkingScope, declaredScope);
    } else if (declaredSymbol.accessRestriction === AccessModifier.Protected) {
        if (declaredScope.ownerNode === undefined) return false;

        const checkingOuterScope = findScopeWithParentByNodes(checkingScope, [NodeName.Class, NodeName.Interface]);
        if (checkingOuterScope === undefined || checkingOuterScope.parentScope === undefined) return false;

        // Get the symbol of the class to which the referring part belongs. | 使用された箇所が属するクラスのシンボルを取得
        const checkingOuterClass = findSymbolShallowly(checkingOuterScope.parentScope, checkingOuterScope.key);
        if (checkingOuterClass?.symbolKind !== SymbolKind.Type) return false;

        // Get the symbol of the class to which the declared part belongs. | 宣言された箇所が属するクラスのシンボルを取得
        if (declaredScope.parentScope === undefined) return false;
        const declaredOuterClass = findSymbolShallowly(declaredScope.parentScope, declaredScope.key);
        if (declaredOuterClass?.symbolKind !== SymbolKind.Type) return false;

        return (canDownCast(checkingOuterClass, declaredOuterClass));
    } else {
        assert(false);
    }
}

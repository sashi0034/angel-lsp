import {
    DeducedType,
    findSymbolShallowly,
    isSourcePrimitiveType,
    PrimitiveType,
    resolveTemplateType,
    SourceType,
    stringifyDeducedType,
    SymbolicFunction, SymbolicType,
    SymbolKind,
    SymbolScope
} from "./symbolic";
import {getNodeLocation, NodeName, NodesBase, ParsedRange} from "./nodes";
import {findScopeShallowly} from "./scope";
import {diagnostic} from "../code/diagnostic";
import assert = require("assert");

export function checkTypeMatch(
    src: DeducedType | undefined,
    dest: DeducedType | undefined,
    nodeRange: ParsedRange,
): boolean {
    if (src === undefined || dest === undefined) return false;

    if (isTypeMatch(src, dest)) return true;

    diagnostic.addError(getNodeLocation(nodeRange), `'${stringifyDeducedType(src)}' cannot be converted to '${stringifyDeducedType(dest)}' 💢`);
    return false;
}

export function isTypeMatch(
    src: DeducedType, dest: DeducedType
): boolean {
    let resolvedSrc: DeducedType | undefined = src;
    if (src.templateTranslate !== undefined && src.symbol.sourceType === PrimitiveType.Template)
        resolvedSrc = resolveTemplateType(src.templateTranslate, src);

    let resolvedDest: DeducedType | undefined = dest;
    if (dest.templateTranslate !== undefined && dest.symbol.sourceType === PrimitiveType.Template)
        resolvedDest = resolveTemplateType(dest.templateTranslate, dest);

    if (resolvedSrc === undefined || resolvedDest === undefined) return true;

    return isTypeMatchInternal(resolvedSrc, resolvedDest);
}

export function isTypeMatchInternal(
    src: DeducedType, dest: DeducedType
): boolean {
    const srcType = src.symbol;
    const destType = dest.symbol;
    const srcNode = srcType.sourceType;
    const destNode = destType.sourceType;

    if (destNode === PrimitiveType.Any || destNode === PrimitiveType.Auto) return true;

    if (isSourcePrimitiveType(srcNode)) {
        return canCastFromPrimitiveType(src, dest);
    }

    // 同じ型を指しているなら OK
    if (srcType.declaredPlace === destType.declaredPlace) return true;

    // 継承した型のいずれかが移動先に当てはまるなら OK
    if (canCastStatically(srcNode, destNode, srcType, destType)) return true;

    // 移動先の型がクラスでないなら NG
    if (isSourcePrimitiveType(destNode) || destNode.nodeName !== NodeName.Class) return false;

    // コンストラクタに当てはまるかで判定
    const destIdentifier = destNode.identifier.text;
    return canConstructImplicitly(src, dest.sourceScope, destIdentifier);
}

function canCastStatically(
    srcNode: NodesBase, destNode: SourceType, srcType: SymbolicType, destType: SymbolicType
): boolean {
    if (srcNode.nodeName === NodeName.Class || srcNode.nodeName === NodeName.Interface) {
        if (srcType.baseList === undefined) return false;
        for (const srcBase of srcType.baseList) {
            if (srcBase?.symbol === destType) return true;
        }
    }
    return false;
}

function canCastFromPrimitiveType(src: DeducedType, dest: DeducedType) {
    const srcType = src.symbol;
    const destType = dest.symbol;
    const srcNode = srcType.sourceType;
    const destNode = destType.sourceType;

    switch (srcNode) {
    case PrimitiveType.Template:
        return destNode === PrimitiveType.Template && srcType.declaredPlace === destType.declaredPlace;
    case PrimitiveType.String: {
        const destName = destType.declaredPlace.text;
        return destName === "string" || destName === "String";
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
    src: DeducedType,
    destScope: SymbolScope | undefined,
    destIdentifier: string
) {
    if (destScope === undefined) return false;

    // 型が属するスコープから、その型自身のスコープを検索
    const constructorScope = findScopeShallowly(destScope, destIdentifier);
    if (constructorScope === undefined || constructorScope.ownerNode?.nodeName !== NodeName.Class) return false;

    // 型自身のスコープから、そのコンストラクタを検索
    const constructor = findSymbolShallowly(constructorScope, destIdentifier);
    if (constructor === undefined || constructor.symbolKind !== SymbolKind.Function) return false;

    return canConstructBy(constructor, src.symbol.sourceType);
}

function canConstructBy(constructor: SymbolicFunction, srcType: SourceType): boolean {
    // コンストラクタの引数が1つで、その引数が移動元の型と一致するなら OK
    if (constructor.parameterTypes.length === 1) {
        const paramType = constructor.parameterTypes[0];
        if (paramType !== undefined && paramType.symbol.sourceType === srcType) {
            return true;
        }
    }

    // オーバーロードが存在するならそれについても確認
    if (constructor.nextOverload !== undefined) {
        return canConstructBy(constructor.nextOverload, srcType);
    }

    return false;
}

import {
    DeducedType,
    findSymbolShallowly,
    isSourcePrimitiveType,
    PrimitiveType, SourceType, SymbolicFunction,
    SymbolKind, SymbolScope
} from "./symbolic";
import {NodeName} from "./nodes";
import {findScopeShallowly} from "./scope";

export function isTypeMatch(
    src: DeducedType, dest: DeducedType
) {
    const srcType = src.symbol;
    const destType = dest.symbol;
    const srcNode = srcType.sourceType;

    if (srcNode === PrimitiveType.Template) {
        return srcType.declaredPlace === destType.declaredPlace;
    }

    if (srcNode === PrimitiveType.Void) {
        return false;
    }

    if (srcNode === PrimitiveType.Number) {
        return destType.sourceType === PrimitiveType.Number;
    }

    if (srcNode === PrimitiveType.Bool) {
        return destType.sourceType === PrimitiveType.Bool;
    }

    // TODO : 継承などに対応

    // 同じ型を指しているなら OK
    if (srcType.declaredPlace === destType.declaredPlace) return true;

    // 移動先の型がクラスでないなら NG
    if (isSourcePrimitiveType(destType.sourceType) || destType.sourceType.nodeName !== NodeName.Class) return false;

    // コンストラクタに当てはまるかで判定
    const destIdentifier = destType.sourceType.identifier.text;
    return canConstructImplicitly(src, dest.sourceScope, destIdentifier);
}

export function canConstructImplicitly(
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

export function canConstructBy(constructor: SymbolicFunction, srcType: SourceType): boolean {
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

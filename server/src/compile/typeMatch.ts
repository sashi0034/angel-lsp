import {DeducedType, findSymbolShallowly, isPrimitiveType, PrimitiveType, SymbolKind} from "./symbolic";
import {NodeName} from "./nodes";
import {findScopeShallowly} from "./scope";

export function isTypeMatch(src: DeducedType, dest: DeducedType) {
    const srcType = src.symbol;
    const destType = dest.symbol;
    const srcNode = srcType.sourceType;
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
    if (srcNode.nodeName === NodeName.Class) {
        if (isPrimitiveType(destType.sourceType) || destType.sourceType.nodeName !== NodeName.Class) {
            return false;
        }
        const destIdentifier = destType.sourceType.identifier.text;
        if (srcNode.identifier.text === destIdentifier) return true;

        if (dest.sourceScope === undefined) return false;

        // コンストラクタに当てはまるかで判定
        const constructorScope = findScopeShallowly(dest.sourceScope, destIdentifier);
        if (constructorScope === undefined || constructorScope.ownerNode?.nodeName !== NodeName.Class) return false;

        const constructor = findSymbolShallowly(constructorScope, destIdentifier);
        if (constructor === undefined || constructor.symbolKind !== SymbolKind.Function) return false;
        if (constructor.sourceNode.paramList.length === 1 && constructor.sourceNode.paramList[0].type.dataType.identifier.text === destIdentifier) {
            return true;
        }
    }

    return false;
}
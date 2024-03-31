import {
    DeducedType,
    findSymbolShallowly,
    isSourcePrimitiveType,
    PrimitiveType, resolveTemplateType, resolveTemplateTypes,
    SymbolKind,
    TemplateTranslation
} from "./symbolic";
import {getIdentifierInType, NodeName} from "./nodes";
import {findScopeShallowly} from "./scope";

export function isTypeMatch(
    src: DeducedType, dest: DeducedType
) {
    const srcType = src.symbol;
    const destType = dest.symbol;
    const srcNode = srcType.sourceType;

    if (srcNode === PrimitiveType.Template) {
        return false;
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
    if (srcNode.nodeName === NodeName.Class) {
        if (isSourcePrimitiveType(destType.sourceType) || destType.sourceType.nodeName !== NodeName.Class) {
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
        if (constructor.sourceNode.paramList.length === 1 && getIdentifierInType(constructor.sourceNode.paramList[0].type).text === srcNode.identifier.text) {
            return true;
        }
    }

    return false;
}

// function isTemplateType(type: DeducedType) {
//     return type.symbol.sourceType === PrimitiveType.Template;
// }
//
// function compareAfterTemplateTranslate(
//     src: DeducedType, dest: DeducedType, templateTranslator: TemplateTranslation | undefined
// ): boolean {
//     if (templateTranslator === undefined) return false;
//
//     let src2: DeducedType | undefined = src;
//     let dest2: DeducedType | undefined = dest;
//
//     if (isTemplateType(src)) src2 = resolveTemplateType(templateTranslator, src);
//     if (isTemplateType(dest)) dest2 = resolveTemplateType(templateTranslator, dest);
//
//     if (src2 === undefined || dest2 === undefined) return false;
//     return isTypeMatch(src2, dest2);
// }

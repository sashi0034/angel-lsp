import {ResolvedType} from "./resolvedType";
import {getActiveGlobalScope, resolveActiveScope} from "./symbolScope";
import {TokenRange} from "../compiler_tokenizer/tokenRange";

export function causeTypeConversionSideEffect(
    src: ResolvedType | undefined,
    dest: ResolvedType | undefined,
    nodeRange?: TokenRange
) {
    if (src === undefined || dest === undefined) {
        return false;
    }

    // Resolved the type of the ambiguous enum member
    if (src.typeOrFunc.isType() && src.typeOrFunc.multipleEnumCandidates !== undefined) {
        const enumScope = resolveActiveScope(dest.scopePath ?? []).lookupScope(dest.identifierText);
        const enumMember = enumScope?.lookupSymbol(src.typeOrFunc.identifierText);
        if (enumMember?.isVariable()) {
            getActiveGlobalScope().getContext().info.reference.push({
                fromToken: src.typeOrFunc.identifierToken,
                toSymbol: enumMember,
            });
        }
    }

    // TODO: Implement output warning for type conversion.
}

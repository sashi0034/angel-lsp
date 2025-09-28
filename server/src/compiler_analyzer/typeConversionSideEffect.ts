import {ResolvedType} from "./resolvedType";
import {getActiveGlobalScope, resolveActiveScope} from "./symbolScope";
import {TokenRange} from "../compiler_tokenizer/tokenRange";
import {ConversionEvaluation} from "./typeConversion";

export function causeTypeConversionSideEffect(
    evaluation: ConversionEvaluation,
    src: ResolvedType | undefined,
    dest: ResolvedType | undefined,
    nodeRange?: TokenRange
) {
    if (src === undefined || dest === undefined) {
        return false;
    }

    if (evaluation.resolvedOverload !== undefined && src.accessSourceToken !== undefined) {
        // e.g., adding a reference for `my_function` in `@my_funcdef(my_function)
        getActiveGlobalScope().pushReference(({
            toSymbol: evaluation.resolvedOverload, fromToken: src.accessSourceToken
        }));
    }

    // Resolved the type of the ambiguous enum member
    if (src.typeOrFunc.isType() && src.typeOrFunc.multipleEnumCandidates !== undefined) {
        const enumScope = resolveActiveScope(dest.scopePath ?? []).lookupScope(dest.identifierText);
        const enumMember = enumScope?.lookupSymbol(src.typeOrFunc.identifierText);
        if (enumMember?.isVariable()) {
            getActiveGlobalScope().pushReference({
                fromToken: src.typeOrFunc.identifierToken, toSymbol: enumMember,
            });
        }
    }

    // TODO: Implement output warning for type conversion.
}

import {ResolvedType} from './resolvedType';
import {getActiveGlobalScope, resolveActiveScope} from './symbolScope';
import {TokenRange} from '../compiler_tokenizer/tokenRange';
import {ConversionEvaluation} from './typeConversion';

export function causeTypeConversionSideEffect(
    evaluation: ConversionEvaluation,
    src: ResolvedType | undefined,
    dest: ResolvedType | undefined,
    nodeRange?: TokenRange
) {
    if (src === undefined || dest === undefined) {
        return false;
    }

    if (evaluation.lambdaTarget !== undefined) {
        // e.g., resolving the lambda target of a lambda expression when it's being converted to a delegate type.
        src.lambdaInfo?.resolve(evaluation.lambdaTarget, nodeRange);
    }

    if (evaluation.resolvedOverload !== undefined && src.accessSourceToken !== undefined) {
        // e.g., adding a reference for `my_function` in `@my_funcdef(my_function)
        getActiveGlobalScope().pushReference({
            toSymbol: evaluation.resolvedOverload,
            fromToken: src.accessSourceToken
        });
    }

    // Resolve the type of an ambiguous enum member.
    if (src.typeOrFunc.isType() && src.typeOrFunc.multipleEnumCandidates !== undefined) {
        const enumScope = resolveActiveScope(dest.scopePath ?? []).lookupScope(dest.identifierText);
        const enumMember = enumScope?.lookupSymbol(src.typeOrFunc.identifierText);
        if (enumMember?.isVariable()) {
            getActiveGlobalScope().pushReference({
                fromToken: src.typeOrFunc.identifierToken,
                toSymbol: enumMember
            });
        }
    }

    // TODO: Emit a warning for type conversions.
}

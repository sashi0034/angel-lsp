import {ResolvedType} from './resolvedType';
import {getActiveGlobalScope, resolveActiveScope} from './symbolScope';
import {TokenRange} from '../compiler_tokenizer/tokenRange';
import {ConversionEvaluation} from './typeConversion';
import {VariableSymbol} from './symbolObject';

export function causeTypeConversionSideEffect(
    evaluation: ConversionEvaluation,
    from: ResolvedType | undefined,
    to: ResolvedType | undefined,
    nodeRange?: TokenRange
) {
    if (from === undefined || to === undefined) {
        return false;
    }

    if (evaluation.lambdaTarget !== undefined) {
        // e.g., resolving the lambda target of a lambda expression when it's being converted to a delegate type.
        from.lambdaInfo?.resolve(evaluation.lambdaTarget, nodeRange);
    }

    if (evaluation.resolvedOverload !== undefined && from.attachedAccessSourceFunctionToken !== undefined) {
        // e.g., adding a reference for `my_function` in `@my_funcdef(my_function)
        getActiveGlobalScope().pushReference({
            toSymbol: evaluation.resolvedOverload,
            fromToken: from.attachedAccessSourceFunctionToken
        });
    }

    // Resolve the type of ambiguous enum member.
    if (from.typeOrFunc.isType() && from.typeOrFunc.multipleEnumCandidates !== undefined) {
        const enumScope = resolveActiveScope(to.scopePath ?? []).lookupScope(to.identifierText);
        const enumMember = enumScope?.lookupSymbol(from.typeOrFunc.identifierText);
        if (enumMember?.isVariable()) {
            getActiveGlobalScope().pushReference({
                fromToken: from.typeOrFunc.identifierToken,
                toSymbol: enumMember
            });
        }
    }

    // TODO: Emit a warning for type conversions.
}

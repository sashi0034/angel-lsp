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
    if (from === undefined) {
        return false;
    }

    if (from.attachedAccessSourceFunctionToken !== undefined) {
        // e.g., adding a reference for `my_function` in `@my_funcdef(my_function)`.
        // When the target type cannot be resolved (e.g., the parameter type is unknown),
        // fall back to the tentative first overload so go-to-definition still works.
        const referencedFunction =
            evaluation.resolvedOverload ?? (from.typeOrFunc.isFunction() ? from.typeOrFunc : undefined);
        if (referencedFunction !== undefined) {
            getActiveGlobalScope().pushReference({
                toSymbol: referencedFunction,
                fromToken: from.attachedAccessSourceFunctionToken
            });
        }
    }

    if (to === undefined) {
        return false;
    }

    if (evaluation.lambdaTarget !== undefined) {
        // e.g., resolving the lambda target of a lambda expression when it's being converted to a delegate type.
        from.lambdaInfo?.resolve(evaluation.lambdaTarget, nodeRange);
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

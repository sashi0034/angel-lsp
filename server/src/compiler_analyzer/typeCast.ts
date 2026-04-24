import {ResolvedType} from './resolvedType';
import {analyzerDiagnostic} from './analyzerDiagnostic';
import {TokenRange} from '../compiler_tokenizer/tokenRange';
import {ConversionMode, evaluateTypeConversion} from './typeConversion';
import {causeTypeConversionSideEffect} from './typeConversionSideEffect';
import {stringifyResolvedType} from './symbolStringifier';

/**
 * Ensure that a type cast is valid.
 * If invalid, an error is reported to the diagnostic.
 */
export function assertTypeCast(
    from: ResolvedType | undefined,
    to: ResolvedType | undefined,
    nodeRange: TokenRange,
    mode: ConversionMode = ConversionMode.Implicit
): boolean {
    if (checkTypeCast(from, to, nodeRange, mode)) {
        return true;
    }

    analyzerDiagnostic.error(
        nodeRange.getBoundingLocation(),
        `'${stringifyResolvedType(from)}' cannot be converted to '${stringifyResolvedType(to)}'.`
    );

    return false;
}

/**
 * Check if a type cast is valid.
 * If valid, any required side effect is executed immediately.
 */
export function checkTypeCast(
    from: ResolvedType | undefined,
    to: ResolvedType | undefined,
    nodeRange?: TokenRange,
    mode: ConversionMode = ConversionMode.Implicit
): boolean {
    if (from === undefined || to === undefined) {
        return true;
    }

    const evaluation = evaluateTypeConversion(from, to, mode);
    if (evaluation === undefined) {
        return false;
    }

    causeTypeConversionSideEffect(evaluation, from, to, nodeRange);

    return true;
}

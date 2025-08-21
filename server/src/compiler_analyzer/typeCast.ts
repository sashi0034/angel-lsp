import {stringifyResolvedType} from "./symbolUtils";
import {ResolvedType} from "./resolvedType";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {TokenRange} from "../compiler_tokenizer/tokenRange";
import {evaluateTypeConversion} from "./typeConversion";
import {causeTypeConversionSideEffect} from "./typeConversionSideEffect";

/**
 * Ensure that a type cast is valid.
 * If invalid, an error is reported to the diagnostic.
 */
export function assertTypeCast(
    src: ResolvedType | undefined,
    dest: ResolvedType | undefined,
    nodeRange: TokenRange,
): boolean {
    if (checkTypeCast(src, dest, nodeRange)) {
        return true;
    }

    analyzerDiagnostic.error(
        nodeRange.getBoundingLocation(),
        `'${stringifyResolvedType(src)}' cannot be converted to '${stringifyResolvedType(dest)}'.`
    );

    return false;
}

/**
 * Check if a type cast is valid.
 * If valid, any required side effect is executed immediately.
 */
export function checkTypeCast(
    src: ResolvedType | undefined,
    dest: ResolvedType | undefined,
    nodeRange?: TokenRange
): boolean {
    if (src === undefined || dest === undefined) {
        return true;
    }

    const evaluation = evaluateTypeConversion(src, dest);
    if (evaluation === undefined) {
        return false;
    }

    causeTypeConversionSideEffect(evaluation, src, dest, nodeRange);

    return true;
}

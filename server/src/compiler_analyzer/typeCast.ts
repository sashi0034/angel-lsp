import {stringifyResolvedType} from "./symbolUtils";
import {ResolvedType} from "./resolvedType";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {TokenRange} from "../compiler_tokenizer/tokenRange";
import {evaluateTypeConversion} from "./typeConversion";
import {causeTypeConversionSideEffect} from "./typeConversionSideEffect";

/**
 * Check if the source type can be converted to the destination type.
 * If it cannot be converted, an error message is added to the diagnostic.
 */
export function assertTypeCast(
    src: ResolvedType | undefined,
    dest: ResolvedType | undefined,
    nodeRange: TokenRange,
): boolean {
    if (checkTypeCast(src, dest, nodeRange)) return true;

    analyzerDiagnostic.error(
        nodeRange.getBoundingLocation(),
        `'${stringifyResolvedType(src)}' cannot be converted to '${stringifyResolvedType(dest)}'.`
    );

    return false;
}

/**
 * Check if the source type can be converted to the destination type.
 * If it can be converted, it will cause the side effect of the conversion.
 */
export function checkTypeCast(
    src: ResolvedType | undefined,
    dest: ResolvedType | undefined,
    nodeRange?: TokenRange
): boolean {
    if (src === undefined || dest === undefined) return true;

    const cost = evaluateTypeConversion(src, dest);
    if (cost === undefined) return false;

    causeTypeConversionSideEffect(src, dest, nodeRange);
    return true;
}


import {stringifyResolvedType} from "./symbolUtils";
import {ResolvedType} from "./resolvedType";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {TokenRange} from "../compiler_parser/tokenRange";
import {evaluateConversionCost} from "./typeConversion";

/**
 * Check if the source type can be converted to the destination type.
 * If it cannot be converted, an error message is added to the diagnostic.
 * @param src
 * @param dest
 * @param nodeRange
 */
export function checkTypeCast(
    src: ResolvedType | undefined,
    dest: ResolvedType | undefined,
    nodeRange: TokenRange,
): boolean {
    if (canTypeCast(src, dest)) return true;

    analyzerDiagnostic.add(
        nodeRange.getBoundingLocation(),
        `'${stringifyResolvedType(src)}' cannot be converted to '${stringifyResolvedType(dest)}'.`
    );

    return false;
}

/**
 * Check if the source type can be converted to the destination type.
 * @param src
 * @param dest
 */
export function canTypeCast(
    src: ResolvedType | undefined, dest: ResolvedType | undefined
): boolean {
    if (src === undefined || dest === undefined) return true;

    const cost = evaluateConversionCost(src, dest);
    return cost !== undefined;
}


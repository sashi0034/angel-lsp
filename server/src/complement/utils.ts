import {SymbolScope} from "../compiler_analyzer/symbolScope";
import {TextPosition} from "../compiler_tokenizer/textLocation";
import {ComplementKind, ComplementScopeRegion} from "../compiler_analyzer/complementHint";

export function takeNarrowestScopeRegion(lhs: ComplementScopeRegion, rhs: ComplementScopeRegion): ComplementScopeRegion {
    const lhsDiff = lhs.boundingLocation.getDifference();
    const rhsDiff = rhs.boundingLocation.getDifference();

    if (lhsDiff.line < rhsDiff.line) return lhs;
    if (lhsDiff.line > rhsDiff.line) return rhs;
    return lhsDiff.character < rhsDiff.character ? lhs : rhs;
}

/**
 * Find the scope that includes the specified position.
 */
export function findScopeContainingPosition(scope: SymbolScope, caret: TextPosition, path: string): SymbolScope {
    const globalScope = scope.getGlobalScope();

    let cursor: ComplementScopeRegion | undefined = undefined;
    for (const hint of globalScope.completionHints) {
        if (hint.complement !== ComplementKind.ScopeRegion) continue;

        const location = hint.boundingLocation;
        if (location.path !== path) continue;

        if (location.positionInRange(caret)) {
            cursor = cursor === undefined
                ? hint
                : takeNarrowestScopeRegion(cursor, hint);
        }
    }

    return cursor?.targetScope ?? scope;
}
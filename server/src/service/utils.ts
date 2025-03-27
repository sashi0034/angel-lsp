import {SymbolGlobalScope, SymbolScope} from "../compiler_analyzer/symbolScope";
import {TextLocation, TextPosition} from "../compiler_tokenizer/textLocation";
import {ScopeRegionInfo} from "../compiler_analyzer/info";

export function takeNarrowestScopeRegion(lhs: ScopeRegionInfo, rhs: ScopeRegionInfo): ScopeRegionInfo {
    const lhsDiff = lhs.boundingLocation.getDifference();
    const rhsDiff = rhs.boundingLocation.getDifference();

    if (lhsDiff.line < rhsDiff.line) return lhs;
    if (lhsDiff.line > rhsDiff.line) return rhs;
    return lhsDiff.character < rhsDiff.character ? lhs : rhs;
}

interface ScopeAndLocation {
    scope: SymbolScope;
    location?: TextLocation;
}

/**
 * Find the scope that includes the specified position.
 */
export function findScopeContainingPosition(globalScope: SymbolGlobalScope, caret: TextPosition): ScopeAndLocation {
    const path = globalScope.getContext().filepath;

    let found: ScopeRegionInfo | undefined = undefined;
    for (const hint of globalScope.info.scopeRegionList) {
        const location = hint.boundingLocation;
        if (location.path !== path) continue;

        if (location.positionInRange(caret)) {
            found = found === undefined
                ? hint
                : takeNarrowestScopeRegion(found, hint);
        }
    }

    return {
        scope: found?.targetScope ?? globalScope,
        location: found?.boundingLocation,
    };
}

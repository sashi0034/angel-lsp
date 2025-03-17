import {ComplementKind, ComplementScopeRegion} from "../compiler_analyzer/complementHint";
import {Position} from "vscode-languageserver";
import {SymbolScope} from "../compiler_analyzer/symbolScope";
import {TextLocation} from "../compiler_tokenizer/textLocation";

export function takeNarrowestHint(lhs: ComplementScopeRegion, rhs: ComplementScopeRegion): ComplementScopeRegion {
    const lhsDiff = lhs.complementLocation.getDifference();
    const rhsDiff = rhs.complementLocation.getDifference();

    if (lhsDiff.line < rhsDiff.line) return lhs;
    if (lhsDiff.line > rhsDiff.line) return rhs;
    return lhsDiff.character < rhsDiff.character ? lhs : rhs;
}

/**
 * Find the scope that includes the specified position.
 */
export function findScopeContainingPosition(scope: SymbolScope, caret: Position, path: string): SymbolScope {
    const globalScope = scope.getGlobalScope();

    let cursor: ComplementScopeRegion | undefined = undefined;
    for (const hint of globalScope.completionHints) {
        if (hint.complementKind !== ComplementKind.ScopeRegion) continue;

        const location = hint.complementLocation;
        if (location.path !== path) continue;

        if (location.positionInRange(caret)) {
            cursor = cursor === undefined
                ? hint
                : takeNarrowestHint(cursor, hint);
        }
    }

    return cursor?.targetScope ?? scope;
}
import {isPositionInRange} from "../compile/tokenUtils";
import {ComplementKind} from "../compile/symbolComplement";
import {SymbolScope} from "../compile/symbols";
import {Position} from "vscode-languageserver";

/**
 * Find the scope that includes the specified position.
 */
export function findScopeContainingPosition(scope: SymbolScope, caret: Position, path: string): SymbolScope {
    for (const hint of scope.completionHints) {
        if (hint.complementKind !== ComplementKind.Scope) continue;

        const location = hint.complementLocation;
        if (location.path !== path) continue;

        if (isPositionInRange(caret, location)) {
            const found = findScopeContainingPosition(hint.targetScope, caret, path);
            if (found !== undefined) return found;
        }
    }

    return scope;
}
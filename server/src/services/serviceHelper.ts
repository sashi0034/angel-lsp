import {ComplementKind} from "../compiler_analyzer/symbolComplement";
import {Position} from "vscode-languageserver";
import {SymbolScope} from "../compiler_analyzer/symbolScope";

/**
 * Find the scope that includes the specified position.
 */
export function findScopeContainingPosition(scope: SymbolScope, caret: Position, path: string): SymbolScope {
    for (const hint of scope.completionHints) {
        if (hint.complementKind !== ComplementKind.Scope) continue;

        const location = hint.complementLocation;
        if (location.path !== path) continue;

        if (location.positionInRange(caret)) {
            const found = findScopeContainingPosition(hint.targetScope, caret, path);
            if (found !== undefined) return found;
        }
    }

    return scope;
}
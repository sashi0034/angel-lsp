import {isPositionInRange} from "../compiler_tokenizer/tokenUtils";
import {ComplementKind} from "../compiler_analyzer/symbolComplement";
import {SymbolScope} from "../compiler_analyzer/symbols";
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
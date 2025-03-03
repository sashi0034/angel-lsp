import {SymbolObject} from "../compiler_analyzer/symbolObject";
import {Location, Position} from "vscode-languageserver";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {AnalyzerScope, SymbolScope} from "../compiler_analyzer/symbolScope";

/**
 * Convert tokenized tokens to Location used in VSCode.
 */
export function getFileLocationOfToken(token: TokenObject): Location {
    return {
        uri: token.location.path.toString(),
        range: {
            start: token.location.start,
            end: token.location.end
        }
    };
}

/**
 * Search for the definition of the symbol at the cursor position.
 */
export function serveDefinition(analyzedScope: AnalyzerScope, caret: Position): SymbolObject | undefined {
    return serveDefinitionInternal(analyzedScope.fullScope, caret, analyzedScope.path);
}

/**
 * Search for the definition of the symbol at the cursor position and return it as a token.
 */
export function serveDefinitionAsToken(analyzedScope: AnalyzerScope, caret: Position): TokenObject | undefined {
    return serveDefinition(analyzedScope, caret)?.defToken;
}

function serveDefinitionInternal(targetScope: SymbolScope, caret: Position, path: string): SymbolObject | undefined {
    // Search a symbol in the symbol map in this scope if it is on the cursor
    for (const [key, symbol] of targetScope.symbolTable) {
        const location = symbol.toList()[0].defToken.location;
        if (location.path === path && location.positionInRange(caret)) {
            return symbol.toList()[0];
        }
    }

    for (const reference of targetScope.referencedList) {
        // Search a symbol in references in this scope
        const referencedLocation = reference.referencedToken.location;
        if (referencedLocation.positionInRange(caret)) {
            // If the reference location is on the cursor, return the declaration
            return reference.declaredSymbol;
        }
    }

    // Now, search in child scopes because the symbol is not found in the current scope
    for (const [key, child] of targetScope.childScopeTable) {
        const jumping = serveDefinitionInternal(child, caret, path);
        if (jumping !== undefined) return jumping;
    }

    return undefined;
}

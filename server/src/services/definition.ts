import {SymbolObject, SymbolScope} from "../compiler_analyzer/symbols";
import {Location, Position} from "vscode-languageserver";
import {TokenizedToken} from "../compiler_tokenizer/tokens";
import {ParsedToken} from "../compiler_parser/parsedToken";
import {AnalyzedScope} from "../compiler_analyzer/symbolScopes";
import {isPositionInRange} from "../compiler_tokenizer/tokenUtils";

/**
 * Convert tokenized tokens to Location used in VSCode.
 */
export function getFileLocationOfToken(token: TokenizedToken): Location {
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
export function serveDefinition(analyzedScope: AnalyzedScope, caret: Position): SymbolObject | undefined {
    return serveDefinitionInternal(analyzedScope.fullScope, caret, analyzedScope.path);
}

/**
 * Search for the definition of the symbol at the cursor position and return it as a token.
 */
export function serveDefinitionAsToken(analyzedScope: AnalyzedScope, caret: Position): ParsedToken | undefined {
    return serveDefinition(analyzedScope, caret)?.declaredPlace;
}

function serveDefinitionInternal(targetScope: SymbolScope, caret: Position, path: string): SymbolObject | undefined {
    // Search a symbol in the symbol map in this scope if it is on the cursor
    for (const [key, symbol] of targetScope.symbolMap) {
        const location = symbol.declaredPlace.location;
        if (location.path === path && isPositionInRange(caret, location)) {
            return symbol;
        }
    }

    for (const reference of targetScope.referencedList) {
        // Search a symbol in references in this scope
        const referencedLocation = reference.referencedToken.location;
        if (isPositionInRange(caret, referencedLocation)) {
            // If the reference location is on the cursor, return the declaration
            return reference.declaredSymbol;
        }
    }

    // Now, search in child scopes because the symbol is not found in the current scope
    for (const [key, child] of targetScope.childScopes) {
        const jumping = serveDefinitionInternal(child, caret, path);
        if (jumping !== undefined) return jumping;
    }

    return undefined;
}

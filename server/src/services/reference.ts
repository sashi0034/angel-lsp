import {Position} from "vscode-languageserver";
import {provideDefinitionAsToken} from "./definition";
import {SymbolGlobalScope, SymbolScope} from "../compiler_analyzer/symbolScope";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {TextPosition} from "../compiler_tokenizer/textLocation";

export function provideReferences(globalScope: SymbolGlobalScope, globalScopeList: SymbolGlobalScope[], caret: TextPosition): TokenObject[] {
    const targetDefinition = provideDefinitionAsToken(globalScope, globalScopeList, caret);
    if (targetDefinition === undefined) return [];

    const result = globalScopeList.flatMap(scope => collectReferencesInScope(scope, targetDefinition));
    result.push(targetDefinition);
    return result;
}

function collectReferencesInScope(scope: SymbolGlobalScope, targetDefinition: TokenObject): TokenObject[] {
    const references = [];

    for (const reference of scope.referenceList) {
        // If the reference points to the target definition, add it to the result.
        if (reference.toSymbol.identifierToken.equals(targetDefinition)) {
            references.push(reference.fromToken);
        }
    }

    return references;
}

import {provideDefinitionAsToken} from "./definition";
import {isAnonymousIdentifier, SymbolGlobalScope, SymbolScope} from "../compiler_analyzer/symbolScope";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {TextPosition} from "../compiler_tokenizer/textLocation";
import {ComplementKind} from "../compiler_analyzer/complementHint";

export function provideReferences(globalScope: SymbolGlobalScope, allGlobalScopes: SymbolGlobalScope[], caret: TextPosition): TokenObject[] {
    const targetDefinition = provideDefinitionAsToken(globalScope, allGlobalScopes, caret);
    if (targetDefinition === undefined) return [];

    const result = allGlobalScopes.flatMap(scope => collectSymbolReferencesInScope(scope, targetDefinition));

    if (result.length === 0) {
        // If no symbol references are found, search for namespace references.
        result.push(...collectNamespaceReferenceInScope(globalScope.getGlobalScope(), targetDefinition));
    }

    result.push(targetDefinition);

    return result;
}

function collectSymbolReferencesInScope(globalScope: SymbolGlobalScope, toToken: TokenObject): TokenObject[] {
    const references = [];

    for (const reference of globalScope.referenceList) {
        // If the reference points to the target definition, add it to the result.
        if (reference.toSymbol.identifierToken.equals(toToken)) {
            references.push(reference.fromToken);
        }
    }

    return references;
}

function collectNamespaceReferenceInScope(scope: SymbolScope, toToken: TokenObject): TokenObject[] {
    const references: TokenObject[] = [];

    // FIXME: This is not considered a nested namespace, i.e., we treat 'B' and 'A::B' as the same namespace.

    if (scope.isGlobalScope()) {
        // Append namespace access references from the completion hints.
        for (const hint of scope.completionHints) {
            if (hint.complement !== ComplementKind.AutocompleteNamespaceAccess) continue;

            // It's a bit rough, but we'll reuse autocomplete hint here
            if (hint.namespaceToken.text === toToken.text) {
                references.push(hint.namespaceToken);
            }
        }
    }

    // Append namespace declaration in the scope.
    for (const namespaceToken of scope.namespaceNodes.map(node => node.linkedToken)) {
        if (namespaceToken.text === toToken.text) {
            references.push(namespaceToken);
        }
    }

    // Recursively search for namespace references in the child scopes
    for (const [key, child] of scope.childScopeTable) {
        if (child.isAnonymousScope()) continue;

        references.push(...collectNamespaceReferenceInScope(child, toToken));
    }

    return references;
}

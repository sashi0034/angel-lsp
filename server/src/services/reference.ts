import {provideDefinitionAsToken} from './definition';
import {isAnonymousIdentifier, SymbolGlobalScope, SymbolScope} from '../compiler_analyzer/symbolScope';
import {TokenObject} from '../compiler_tokenizer/tokenObject';
import {TextPosition} from '../compiler_tokenizer/textLocation';

export function provideReferences(
    globalScope: SymbolGlobalScope,
    allGlobalScopes: SymbolGlobalScope[],
    caret: TextPosition
): TokenObject[] {
    const targetDefinition = provideDefinitionAsToken(globalScope, allGlobalScopes, caret);
    if (targetDefinition === undefined) {
        return [];
    }

    const result = allGlobalScopes.flatMap(scope => collectSymbolReferencesInScope(scope, targetDefinition));

    if (result.length === 0) {
        // If no symbol references are found, fall back to namespace references.
        result.push(...collectNamespaceReferenceInScope(globalScope.getGlobalScope(), targetDefinition));
    }

    result.push(targetDefinition);

    return result;
}

function collectSymbolReferencesInScope(globalScope: SymbolGlobalScope, toToken: TokenObject): TokenObject[] {
    const references = [];

    for (const reference of globalScope.markers.reference) {
        // Add references that point to the target definition.
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
        // Add namespace access references from the autocomplete marker.
        for (const info of scope.markers.autocompleteNamespaceAccess) {
            // This is a little rough, but we can reuse the autocomplete marker here.
            if (info.namespaceToken.text === toToken.text) {
                references.push(info.namespaceToken);
            }
        }
    }

    // Add namespace declarations from this scope.
    for (const namespaceToken of scope.namespaceNodes.map(node => node.linkedToken)) {
        if (namespaceToken.text === toToken.text) {
            references.push(namespaceToken);
        }
    }

    // Recursively search child scopes for namespace references.
    for (const [key, child] of scope.childScopeTable) {
        if (child.isAnonymousScope()) {
            continue;
        }

        references.push(...collectNamespaceReferenceInScope(child, toToken));
    }

    return references;
}

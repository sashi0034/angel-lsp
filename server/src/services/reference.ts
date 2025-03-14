import {Position} from "vscode-languageserver";
import {provideDefinitionAsToken} from "./definition";
import {SymbolScope} from "../compiler_analyzer/symbolScope";
import {TokenObject} from "../compiler_tokenizer/tokenObject";

export function provideReferences(globalScope: SymbolScope, analyzedScopes: SymbolScope[], caret: Position): TokenObject[] {
    const targetDefinition = provideDefinitionAsToken(globalScope, caret);
    if (targetDefinition === undefined) return [];

    // FIXME: 参照収集の前に、依存関係のあるファイルをリフレッシュする必要がある?

    const result = analyzedScopes.flatMap(scope => collectReferencesInScope(scope, targetDefinition));
    result.push(targetDefinition);
    return result;
}

function collectReferencesInScope(scope: SymbolScope, targetDefinition: TokenObject): TokenObject[] {
    const references = [];

    for (const reference of scope.referencedList) {
        // Search for reference locations in the scope (since the token instance changes every time it is compiled, strict comparison is required)
        if (reference.declaredSymbol.identifierToken === targetDefinition
            || reference.declaredSymbol.identifierToken.equals(targetDefinition)
        ) {
            references.push(reference.referencedToken);
        }
    }

    // Search in child scopes | 子要素も探索
    for (const [key, child] of scope.childScopeTable) {
        references.push(...collectReferencesInScope(child, targetDefinition));
    }

    return references;
}

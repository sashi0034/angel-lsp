import {Position} from "vscode-languageserver";
import {provideDefinitionAsToken} from "./definition";
import {SymbolGlobalScope, SymbolScope} from "../compiler_analyzer/symbolScope";
import {TokenObject} from "../compiler_tokenizer/tokenObject";

export function provideReferences(globalScope: SymbolGlobalScope, globalScopeList: SymbolGlobalScope[], caret: Position): TokenObject[] {
    const targetDefinition = provideDefinitionAsToken(globalScope, globalScopeList, caret);
    if (targetDefinition === undefined) return [];

    // FIXME: 参照収集の前に、依存関係のあるファイルをリフレッシュする必要がある?

    const result = globalScopeList.flatMap(scope => collectReferencesInScope(scope, targetDefinition));
    result.push(targetDefinition);
    return result;
}

function collectReferencesInScope(scope: SymbolScope, targetDefinition: TokenObject): TokenObject[] {
    const references = [];

    for (const reference of scope.referenceList) {
        // Search for reference locations in the scope (since the token instance changes every time it is compiled, strict comparison is required)
        if (reference.toSymbol.identifierToken === targetDefinition
            || reference.toSymbol.identifierToken.equals(targetDefinition)
        ) {
            references.push(reference.fromToken);
        }
    }

    // Search in child scopes | 子要素も探索
    for (const [key, child] of scope.childScopeTable) {
        references.push(...collectReferencesInScope(child, targetDefinition));
    }

    return references;
}

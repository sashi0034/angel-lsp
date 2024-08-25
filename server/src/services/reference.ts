import {SymbolScope} from "../compile/symbols";
import {Position} from "vscode-languageserver";
import {ParsedToken} from "../compile/parsedToken";
import {serveDefinitionAsToken} from "./definition";
import {AnalyzedScope} from "../compile/symbolScopes";
import {isSameToken} from "../compile/tokenUtils";

export function serveReferences(targetScope: AnalyzedScope, analyzedScopes: SymbolScope[], caret: Position): ParsedToken[] {
    const targetDefinition = serveDefinitionAsToken(targetScope, caret);
    if (targetDefinition === undefined) return [];

    // FIXME: 参照収集の前に、依存関係のあるファイルをリフレッシュする必要がある?

    const result = analyzedScopes.flatMap(scope => collectReferencesInScope(scope, targetDefinition));
    result.push(targetDefinition);
    return result;
}

function collectReferencesInScope(scope: SymbolScope, targetDefinition: ParsedToken): ParsedToken[] {
    const references = [];

    for (const reference of scope.referencedList) {
        // Search for reference locations in the scope (since the token instance changes every time it is compiled, strict comparison is required)
        // スコープ内の参照箇所を検索 (コンパイルのたびにトークンのインスタンスが変わるので、厳密な比較を行う必要がある)
        if (reference.declaredSymbol.declaredPlace === targetDefinition || isSameToken(reference.declaredSymbol.declaredPlace, targetDefinition)) {
            references.push(reference.referencedToken);
        }
    }

    // Search in child scopes | 子要素も探索
    for (const [key, child] of scope.childScopes) {
        references.push(...collectReferencesInScope(child, targetDefinition));
    }

    return references;
}

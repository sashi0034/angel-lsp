import {SymbolScope} from "../compile/symbolic";
import {Location, Position} from "vscode-languageserver";
import {isPositionInRange, TokenizingToken} from "../compile/tokens";
import {ParsingToken} from "../compile/parsingToken";
import {pathToFileURL} from "node:url";
import {AnalyzedScope} from "../compile/scope";

// トークンから VSCode の Location に変換
export function getFileLocationOfToken(token: TokenizingToken): Location {
    return {
        uri: pathToFileURL(token.location.path).toString(),
        range: {
            start: token.location.start,
            end: token.location.end
        }
    };
}

export function serveDefinition(analyzedScope: AnalyzedScope, caret: Position): ParsingToken | null {
    return serveDefinitionInternal(analyzedScope.fullScope, caret, analyzedScope.path);
}

function serveDefinitionInternal(targetScope: SymbolScope, caret: Position, path: string): ParsingToken | null {
    // スコープ内のシンボルから探索
    for (const [key, symbol] of targetScope.symbolMap) {
        const location = symbol.declaredPlace.location;
        if (location.path === path && isPositionInRange(caret, location)) {
            return symbol.declaredPlace;
        }
    }

    for (const reference of targetScope.referencedList) {
        // スコープ内の参照箇所を検索
        const referencedLocation = reference.referencedToken.location;
        if (isPositionInRange(caret, referencedLocation)) {
            // 参照箇所がカーソル位置上なら定義箇所を返す
            return reference.declaredSymbol.declaredPlace;
        }
    }

    // 現在のスコープで見つからないときは子スコープを探索
    for (const [key, child] of targetScope.childScopes) {
        const jumping = serveDefinitionInternal(child, caret, path);
        if (jumping !== null) return jumping;
    }

    return null;
}

import {SymbolScope} from "../compile/symbolic";
import {Position} from "vscode-languageserver";
import {isPositionInRange} from "../compile/tokens";
import {ParsingToken} from "../compile/parsing";

export function jumpDefinition(analyzedScope: SymbolScope, caret: Position): ParsingToken | null {
    for (const reference of analyzedScope.referencedList) {
        // スコープ内の参照箇所を検索
        const referencedLocation = reference.referencedToken.location;
        if (isPositionInRange(caret, referencedLocation)) {
            // 参照箇所がカーソル位置上なら定義箇所を返す
            return reference.declaredSymbol.declaredPlace;
        }
    }

    // 現在のスコープで見つからないときは子スコープを探索
    for (const [key, child] of analyzedScope.childScopes) {
        const jumping = jumpDefinition(child, caret);
        if (jumping !== null) return jumping;
    }

    return null;
}

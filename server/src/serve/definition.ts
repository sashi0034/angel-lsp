import {SymbolScope} from "../compile/symbolics";
import {Position} from "vscode-languageserver";
import {TokenObject} from "../compile/token";

export function jumpDefinition(scope: SymbolScope, caret: Position): TokenObject | null {
    for (const symbol of scope.symbols) {
        // スコープ内のシンボルを検索
        for (const usage of symbol.usage) {
            // そのシンボルの使用箇所を検索
            const usedPos = usage.location.start;
            if (usedPos.line === caret.line
                && usedPos.character <= caret.character
                && caret.character <= usedPos.character + usage.text.length
            ) {
                // 使用箇所であれば宣言箇所を返す
                return symbol.declare;
            }
        }
    }

    for (const child of scope.childScopes) {
        const jumping = jumpDefinition(child, caret);
        if (jumping !== null) return jumping;
    }

    return null;
}

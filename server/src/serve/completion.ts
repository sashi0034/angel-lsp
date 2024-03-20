import {Position, URI} from "vscode-languageserver";
import {SymbolScope} from "../compile/symbolics";
import {CompletionItem, CompletionItemKind} from "vscode-languageserver/node";
import {getNodeLocation} from "../compile/nodes";
import {isPositionInLocation} from "../compile/token";

export function searchCompletionItems(diagnosedScope: SymbolScope, caret: Position): CompletionItem[] {
    const items: CompletionItem[] = [];

    const scopeList = findIncludedScopes(diagnosedScope, caret);
    for (const scope of scopeList) {
        for (const symbol of scope.symbolList) {
            const declareToken = symbol.declaredPlace;
            items.push({
                label: declareToken.text,
                kind: CompletionItemKind.Variable, // FIXME
            });
        }
    }

    return items;
}

export function findIncludedScopes(scope: SymbolScope, caret: Position): SymbolScope[] {
    const result: SymbolScope[] = [];

    for (const child of scope.childScopes) {
        if (child.ownerNode === undefined || 'scopeRange' in child.ownerNode === false) continue;

        const location = getNodeLocation(child.ownerNode.scopeRange);
        if (isPositionInLocation(caret, location)) {
            const found = findIncludedScopes(child, caret);
            if (found.length > 0) result.push(...found);
        }
    }

    return result;
}


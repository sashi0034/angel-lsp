import {Position, URI} from "vscode-languageserver";
import {SymbolicObject, SymbolScope} from "../compile/symbolics";
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
                kind: symbolToCompletionKind(symbol),
            });
        }
    }

    return items;
}

function symbolToCompletionKind(symbol: SymbolicObject) {
    switch (symbol.symbolKind) {
    case 'type':
        if (typeof symbol.sourceNode === 'string') return CompletionItemKind.Keyword;
        if (symbol.sourceNode.nodeName === 'ENUM') return CompletionItemKind.Enum;
        return CompletionItemKind.Class;
    case 'function':
        return CompletionItemKind.Function;
    case 'variable':
        return CompletionItemKind.Variable;
    default:
        return CompletionItemKind.Text;
    }
}

function findIncludedScopes(scope: SymbolScope, caret: Position): SymbolScope[] {
    const result: SymbolScope[] = [];

    for (const child of scope.childScopes) {
        if (child.ownerNode === undefined || 'scopeRange' in child.ownerNode === false) continue;

        const location = getNodeLocation(child.ownerNode.scopeRange);
        if (isPositionInLocation(caret, location)) {
            const found = findIncludedScopes(child, caret);
            result.push(...found);
        }
    }

    if (scope.ownerNode === undefined
        || ('scopeRange' in scope.ownerNode && isPositionInLocation(caret, getNodeLocation(scope.ownerNode.scopeRange)))
    ) {
        result.push(scope);
    }

    return result;
}


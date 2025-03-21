import {isAnonymousIdentifier, ScopeLinkedNode, SymbolGlobalScope, SymbolScope} from "../compiler_analyzer/symbolScope";
import {NodeName} from "../compiler_parser/nodes";
import * as lsp from 'vscode-languageserver';

export function provideDocumentSymbol(globalScope: SymbolGlobalScope) {
    return provideDocumentSymbolInternal(globalScope.getContext().filepath, globalScope);
}

// TODO: Also append symbols like variables.
function provideDocumentSymbolInternal(filepath: string, scope: SymbolScope) {
    const result: lsp.SymbolInformation[] = [];

    if (scope.linkedNode !== undefined) {
        // Append type definitions
        const kind = nodeToSymbolKind(scope.linkedNode);
        if (kind !== undefined && scope.linkedNode.nodeRange.path === filepath) {
            result.push({
                name: scope.key,
                kind: kind,
                location: scope.linkedNode.nodeRange.getBoundingLocation().toServerLocation()
            });
        }
    } else if (scope.isFunctionHolderScope()) {
        // Append function overloads

        // TODO: Distinct between function and methods
        for (const [key, child] of scope.childScopeTable) {
            if (child.linkedNode === undefined) continue;
            if (child.linkedNode.nodeRange.path !== filepath) continue;

            result.push({
                name: scope.key,
                kind: lsp.SymbolKind.Function,
                location: child.linkedNode.nodeRange.getBoundingLocation().toServerLocation()
            });
        }
    }

    // Append namespace definitions
    for (const namespaceNode of scope.namespaceNodes) {
        if (namespaceNode.linkedToken.location.path !== filepath) continue;

        if (namespaceNode.node.namespaceList.at(-1) !== namespaceNode.linkedToken) {
            // Skip nested namespaces like 'A' and 'B' in 'namespace A::B::C { ... }'
            continue;
        }

        result.push({
            name: namespaceNode.node.namespaceList.map(t => t.text).join('::'),
            kind: lsp.SymbolKind.Namespace,
            location: namespaceNode.node.nodeRange.getBoundingLocation().toServerLocation()
        });
    }

    // Iterate child scopes
    for (const [key, child] of scope.childScopeTable) {
        if (child.isAnonymousScope()) continue;

        result.push(...provideDocumentSymbolInternal(filepath, child));
    }

    return result;
}

function nodeToSymbolKind(node: ScopeLinkedNode) {
    switch (node.nodeName) {
    case NodeName.Enum:
        return lsp.SymbolKind.Enum;
    case NodeName.Class:
        return lsp.SymbolKind.Class;
    case NodeName.VirtualProp:
        return lsp.SymbolKind.Property;
    case NodeName.Interface:
        return lsp.SymbolKind.Interface;
    case NodeName.Func:
        return lsp.SymbolKind.Function;
    case NodeName.Lambda: // FIXME: Check
        return lsp.SymbolKind.Function;
    }

    return undefined;
}

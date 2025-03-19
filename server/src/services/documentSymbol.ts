import {isAnonymousIdentifier, ScopeLinkedNode, SymbolGlobalScope, SymbolScope} from "../compiler_analyzer/symbolScope";
import {NodeName} from "../compiler_parser/nodes";
import * as languageserver from 'vscode-languageserver';  // TODO: Rename to lsp?

export function provideDocumentSymbol(globalScope: SymbolGlobalScope) {
    return provideDocumentSymbolInternal(globalScope.getContext().filepath, globalScope);
}

function provideDocumentSymbolInternal(filepath: string, scope: SymbolScope) {
    const result: languageserver.SymbolInformation[] = [];

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
    } else if (scope.hasFunctionScopes()) {
        // Append function overloads
        for (const [key, child] of scope.childScopeTable) {
            if (child.linkedNode === undefined) continue;
            if (child.linkedNode.nodeRange.path !== filepath) continue;

            result.push({
                name: scope.key,
                kind: languageserver.SymbolKind.Function,
                location: child.linkedNode.nodeRange.getBoundingLocation().toServerLocation()
            });
        }
    }

    // Append namespace definitions
    for (const namespaceNode of scope.namespaceNodes) {
        if (namespaceNode.linkedToken.location.path !== filepath) continue;

        result.push({
            name: scope.key,
            kind: languageserver.SymbolKind.Namespace,
            location: namespaceNode.node.nodeRange.getBoundingLocation().toServerLocation()
        });
    }

    // Iterate child scopes
    for (const [key, child] of scope.childScopeTable) {
        if (isAnonymousIdentifier(key)) continue;

        result.push(...provideDocumentSymbolInternal(filepath, child));
    }

    return result;
}

function nodeToSymbolKind(node: ScopeLinkedNode) {
    switch (node.nodeName) {
    case NodeName.Enum:
        return languageserver.SymbolKind.Enum;
    case NodeName.Class:
        return languageserver.SymbolKind.Class;
    case NodeName.VirtualProp:
        return languageserver.SymbolKind.Property;
    case NodeName.Interface:
        return languageserver.SymbolKind.Interface;
    case NodeName.Func:
        return languageserver.SymbolKind.Function;
    case NodeName.Lambda: // FIXME: Check
        return languageserver.SymbolKind.Function;
    }

    return undefined;
}

import {
    isNodeEnumOrClassOrInterface,
    ScopePath,
    SymbolObject
} from "../compiler_analyzer/symbolObject";
import {Position} from "vscode-languageserver";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {isAnonymousIdentifier, SymbolGlobalScope, SymbolScope} from "../compiler_analyzer/symbolScope";
import {TextPosition} from "../compiler_tokenizer/textLocation";

/**
 * Search for the definition of the symbol at the cursor position.
 */
export function provideDefinition(globalScope: SymbolGlobalScope, caret: TextPosition): SymbolObject | undefined {
    return provideDefinitionInternal(globalScope, caret);
}

/**
 * Search for the definition of the symbol at the cursor position and return it as a token.
 * This also supports namespace definitions.
 */
export function provideDefinitionAsToken(
    globalScope: SymbolGlobalScope,
    allGlobalScopes: SymbolGlobalScope[],
    caret: TextPosition
): TokenObject | undefined {
    return provideDefinition(globalScope, caret)?.identifierToken
        // fallback to namespace definition
        ?? provideNamespaceDefinition(globalScope, allGlobalScopes, caret);
}

function provideDefinitionInternal(globalScope: SymbolGlobalScope, caret: TextPosition) {
    const filepath = globalScope.getContext().filepath;

    // Find the symbol that the caret is on in the reference list
    for (const reference of globalScope.info.reference) {
        const referencedLocation = reference.fromToken.location;
        if (referencedLocation.positionInRange(caret)) {
            // If the reference location is on the cursor, return the declaration
            return reference.toSymbol;
        }
    }

    // If the symbol is not found in the reference list, check to see if it is the definition itself.
    return provideIdenticalDefinitionInternal(filepath, globalScope, caret);
}

function provideIdenticalDefinitionInternal(filepath: string, scope: SymbolScope, caret: TextPosition): SymbolObject | undefined {
    // Search a symbol in the symbol map in this scope if it is on the caret
    for (const [key, symbolHolder] of scope.symbolTable) {
        for (const symbol of symbolHolder.toList()) {
            const location = symbol.identifierToken.location;
            if (location.path === filepath && location.positionInRange(caret)) {
                return symbol;
            }
        }
    }

    // At this point, search in child scopes because the symbol is not found in the current scope
    for (const [key, child] of scope.childScopeTable) {
        const jump = provideIdenticalDefinitionInternal(filepath, child, caret);
        if (jump !== undefined) return jump;
    }

    return undefined;
}

// -----------------------------------------------

// Find the definition of the scope token at the cursor position.
// This is a bit complicated because there may be multiple definitions of the namespace.
function provideNamespaceDefinition(globalScope: SymbolGlobalScope, allGlobalScopes: SymbolGlobalScope[], caret: Position) {
    const declarationToken = findNamespaceDeclarationToken(globalScope, caret);
    if (declarationToken !== undefined) {
        // It is a namespace declaration token like 'namespace A { ... }'
        return declarationToken;
    }

    // -----------------------------------------------
    // Since the namespace declaration token is not found, it is a namespace access token like 'A::B::C'

    // namespaceList[0] --> '::' --> tokenOnCaret --> '::' --> ... --> tokenAfterNamespaces
    const {accessScope, tokenOnCaret, tokenAfterNamespace} = findNamespaceTokenOnCaret(globalScope, caret);
    if (accessScope === undefined || tokenOnCaret === undefined) {
        return undefined;
    }

    // The definition of token after namespace
    const closetTokenDefinitionSymbol = tokenAfterNamespace === undefined
        ? undefined
        : provideDefinitionInternal(globalScope, tokenAfterNamespace.location.start);

    if (closetTokenDefinitionSymbol !== undefined) {
        // The definition of token after namespace exits, find the namespace token in its global scope.
        const destinationFilepath = closetTokenDefinitionSymbol.identifierToken.location.path;
        const destinationGlobalScope =
            allGlobalScopes.find(scope => scope.getContext().filepath === destinationFilepath);
        if (destinationGlobalScope !== undefined) {
            return findNamespaceTokenNearPosition(
                destinationGlobalScope,
                accessScope.scopePath,
                closetTokenDefinitionSymbol.identifierToken.location.start
            );
        }
    }

    // If the definition of token after namespace does not exist,
    // look for a matching namespace token in global scopes in all files.
    for (const scope of [globalScope, ...allGlobalScopes]) { // Search from the current global scope
        const namespaceToken =
            findNamespaceTokenNearPosition(scope, accessScope.scopePath, new TextPosition(0, 0));
        if (namespaceToken !== undefined) return namespaceToken;
    }

    return undefined;
}

// Find a namespace declaration token like 'namespace A { ... }'
function findNamespaceDeclarationToken(scope: SymbolScope, caret: Position): TokenObject | undefined {
    for (const namespaceToken of scope.namespaceNodes.map(node => node.linkedToken)) {
        if (namespaceToken.location.positionInRange(caret)) {
            return namespaceToken;
        }
    }

    for (const [key, child] of scope.childScopeTable) {
        if (scope.isAnonymousScope()) continue;

        const result = findNamespaceDeclarationToken(child, caret);
        if (result !== undefined) return result;
    }

    return undefined;
}

function findNamespaceTokenOnCaret(globalScope: SymbolGlobalScope, caret: Position) {
    // namespaceList[0] --> '::' --> namespaceList[1] --> '::' --> tokenAfterNamespace
    let accessScope: SymbolScope | undefined;
    let tokenOnCaret: TokenObject | undefined;
    let tokenAfterNamespace: TokenObject | undefined;

    // It's a bit rough, but we'll reuse autocomplete info here
    for (const info of globalScope.info.autocompleteNamespaceAccess) {
        if (info.namespaceToken.location.positionInRange(caret)) {
            accessScope = info.accessScope;
            tokenOnCaret = info.namespaceToken;
            tokenAfterNamespace = info.tokenAfterNamespaces;
            break;
        }
    }

    return {accessScope, tokenOnCaret, tokenAfterNamespace};
}

function findNamespaceTokenNearPosition(globalScope: SymbolGlobalScope, scopePath: ScopePath, position: TextPosition): TokenObject | undefined {
    const namespaceScope = globalScope.resolveScope(scopePath);
    if (namespaceScope === undefined) return undefined;

    let result: TokenObject | undefined;
    if (isNodeEnumOrClassOrInterface(namespaceScope.linkedNode)) {
        // When the access scope may be an enum, class or interface
        const linkedNode = namespaceScope.linkedNode;

        // The namespace and the file defining the node may be different, so verification is necessary.
        if (linkedNode.identifier.location.path === namespaceScope.getContext().filepath) {
            result = namespaceScope.linkedNode.identifier;
        }
    }

    for (let i = namespaceScope.namespaceNodes.length - 1; i >= 0; i--) {
        // Take the token of the namespace closest to the position
        const next = namespaceScope.namespaceNodes[i].linkedToken;
        result = result === undefined
            ? next
            : position.compareNearest(result.location.start, next.location.start) === -1 ? result : next;
    }

    return result;
}
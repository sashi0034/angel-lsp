import {
    isNodeEnumOrClassOrInterface,
    ScopePath,
    SymbolObject
} from "../compiler_analyzer/symbolObject";
import {Position} from "vscode-languageserver";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {SymbolScope} from "../compiler_analyzer/symbolScope";
import {ComplementKind} from "../compiler_analyzer/complementHint";
import {TextPosition} from "../compiler_tokenizer/textLocation";

/**
 * Search for the definition of the symbol at the cursor position.
 */
export function provideDefinition(globalScope: SymbolScope, caret: Position): SymbolObject | undefined {
    return provideDefinitionInternal(globalScope.getContext().filepath, globalScope, caret);
}

/**
 * Search for the definition of the symbol at the cursor position and return it as a token.
 * This also supports namespace definitions.
 */
export function provideDefinitionAsToken(globalScope: SymbolScope, globalScopeList: SymbolScope[], caret: Position): TokenObject | undefined {
    return provideDefinition(globalScope, caret)?.identifierToken
        // fallback to namespace definition
        ?? provideNamespaceDefinition(globalScope, globalScopeList, caret);
}

function provideDefinitionInternal(filepath: string, scope: SymbolScope, caret: Position): SymbolObject | undefined {
    // Search a symbol in the symbol map in this scope if it is on the cursor
    for (const [key, symbolHolder] of scope.symbolTable) {
        for (const symbol of symbolHolder.toList()) {
            const location = symbol.identifierToken.location;
            if (location.path === filepath && location.positionInRange(caret)) {
                return symbol;
            }
        }
    }

    for (const reference of scope.referencedList) {
        // Search a symbol in references in this scope
        const referencedLocation = reference.referencedToken.location;
        if (referencedLocation.positionInRange(caret)) {
            // If the reference location is on the cursor, return the declaration
            return reference.declaredSymbol;
        }
    }

    // At this point, search in child scopes because the symbol is not found in the current scope
    for (const [key, child] of scope.childScopeTable) {
        const jumping = provideDefinitionInternal(filepath, child, caret);
        if (jumping !== undefined) return jumping;
    }

    return undefined;
}

// -----------------------------------------------

// Find the definition of the scope token at the cursor position.
// This is a bit complicated because there may be multiple definitions of the namespace.
function provideNamespaceDefinition(globalScope: SymbolScope, globalScopeList: SymbolScope[], caret: Position) {
    // namespaceList[0] --> '::' --> tokenOnCaret --> '::' --> ... --> tokenAfterNamespaces
    const {accessScope, tokenOnCaret, tokenAfterNamespace} = findNamespaceTokenOnCaret(globalScope, caret);
    if (accessScope === undefined || tokenOnCaret === undefined) {
        return undefined;
    }

    // The definition of token after namespace
    const closetTokenDefinitionSymbol = tokenAfterNamespace === undefined
        ? undefined
        : findDefinitionByToken(globalScope, tokenAfterNamespace);

    if (closetTokenDefinitionSymbol !== undefined) {
        // The definition of token after namespace exits, find the namespace token in its global scope.
        const destinationFilepath = closetTokenDefinitionSymbol.identifierToken.location.path;
        const destinationGlobalScope =
            globalScopeList.find(scope => scope.getContext().filepath === destinationFilepath);
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
    for (const scope of [globalScope, ...globalScopeList]) { // Search from the current global scope
        const namespaceToken =
            findNamespaceTokenNearPosition(scope, accessScope.scopePath, new TextPosition(0, 0));
        if (namespaceToken !== undefined) return namespaceToken;
    }

    return undefined;
}

function findNamespaceTokenOnCaret(globalScope: SymbolScope, caret: Position) {
    // namespaceList[0] --> '::' --> namespaceList[1] --> '::' --> tokenAfterNamespace
    let accessScope: SymbolScope | undefined;
    let tokenOnCaret: TokenObject | undefined;
    let tokenAfterNamespace: TokenObject | undefined;
    for (const hint of globalScope.completionHints) {
        // It's a bit rough, but we'll reuse completionHints here
        if (hint.complementKind !== ComplementKind.NamespaceSymbol) {
            continue;
        }

        if (hint.namespaceToken.location.positionInRange(caret)) {
            accessScope = hint.accessScope;
            tokenOnCaret = hint.namespaceToken;
            tokenAfterNamespace = hint.tokenAfterNamespaces;
            break;
        }
    }

    return {accessScope, tokenOnCaret, tokenAfterNamespace};
}

function findDefinitionByToken(scope: SymbolScope, target: TokenObject): SymbolObject | undefined {
    // Search a symbol in the symbol map in this scope if it is on the cursor
    for (const [key, symbolHolder] of scope.symbolTable) {
        for (const symbol of symbolHolder.toList()) {
            if (symbol.identifierToken.equals(target)) {
                return symbol;
            }
        }
    }

    for (const reference of scope.referencedList) {
        // Search a symbol in references in this scope
        if (reference.referencedToken.equals(target)) {
            return reference.declaredSymbol;
        }
    }

    // At this point, search in child scopes because the symbol is not found in the current scope
    for (const [key, child] of scope.childScopeTable) {
        const jumping = findDefinitionByToken(child, target);
        if (jumping !== undefined) return jumping;
    }

    return undefined;
}

function findNamespaceTokenNearPosition(globalScope: SymbolScope, scopePath: ScopePath, position: TextPosition): TokenObject | undefined {
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

    for (let i = namespaceScope.namespaceTokens.length - 1; i >= 0; i--) {
        // Take the token of the namespace closest to the position
        const next = namespaceScope.namespaceTokens[i];
        result = result === undefined
            ? next
            : position.compare(result.location.start, next.location.start) === -1 ? result : next;
    }

    return result;
}
import {
    isNodeEnumOrClassOrInterface,
    ScopePath,
    SymbolObject
} from "../compiler_analyzer/symbolObject";
import {Position} from "vscode-languageserver";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {SymbolGlobalScope, SymbolScope} from "../compiler_analyzer/symbolScope";
import {ComplementKind} from "../compiler_analyzer/complementHint";
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
    globalScopeList: SymbolGlobalScope[],
    caret: TextPosition
): TokenObject | undefined {
    return provideDefinition(globalScope, caret)?.identifierToken
        // fallback to namespace definition
        ?? provideNamespaceDefinition(globalScope, globalScopeList, caret);
}

function provideDefinitionInternal(globalScope: SymbolGlobalScope, caret: TextPosition) {
    const filepath = globalScope.getContext().filepath;

    // Find the symbol that the caret is on in the reference list
    for (const reference of globalScope.referenceList) {
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
        const jumping = provideIdenticalDefinitionInternal(filepath, child, caret);
        if (jumping !== undefined) return jumping;
    }

    return undefined;
}

// -----------------------------------------------

// Find the definition of the scope token at the cursor position.
// This is a bit complicated because there may be multiple definitions of the namespace.
function provideNamespaceDefinition(globalScope: SymbolGlobalScope, globalScopeList: SymbolGlobalScope[], caret: Position) {
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

function findNamespaceTokenOnCaret(globalScope: SymbolGlobalScope, caret: Position) {
    // namespaceList[0] --> '::' --> namespaceList[1] --> '::' --> tokenAfterNamespace
    let accessScope: SymbolScope | undefined;
    let tokenOnCaret: TokenObject | undefined;
    let tokenAfterNamespace: TokenObject | undefined;
    for (const hint of globalScope.completionHints) {
        // It's a bit rough, but we'll reuse completionHints here
        if (hint.complement !== ComplementKind.AutocompleteNamespaceAccess) {
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

    for (let i = namespaceScope.namespaceTokens.length - 1; i >= 0; i--) {
        // Take the token of the namespace closest to the position
        const next = namespaceScope.namespaceTokens[i];
        result = result === undefined
            ? next
            : position.compare(result.location.start, next.location.start) === -1 ? result : next;
    }

    return result;
}
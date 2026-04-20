import {Position} from 'vscode-languageserver';
import {isSymbolInstanceMember, ScopePath, SymbolObjectHolder} from '../compiler_analyzer/symbolObject';
import {CompletionItem, CompletionItemKind} from 'vscode-languageserver/node';
import {Node_Script, NodeName} from '../compiler_parser/nodes';
import {
    collectScopeListWithParentAndUsingNamespace,
    SymbolGlobalScope,
    SymbolScope
} from '../compiler_analyzer/symbolScope';
import {
    getInstanceAccessMarkerLocation,
    getScopeAccessMarkerLocation,
    InstanceAccessMarker
} from '../compiler_analyzer/marker';
import {TextPosition} from '../compiler_tokenizer/textLocation';
import {TokenObject} from '../compiler_tokenizer/tokenObject';
import {canAccessInstanceMember} from '../compiler_analyzer/symbolUtils';
import {findScopeContainingPosition} from '../service/utils';
import {getGlobalSettings} from '../core/settings';
import {isCaretInDeclarationPart} from './completion/declarationPart';
import {provideSnippetCompletion} from './completion/snippet';

export interface CompletionItemWrapper {
    item: CompletionItem;
    symbol?: SymbolObjectHolder;
}

/**
 * Returns the completion candidates for the specified position.
 */
export function provideCompletion(
    preprocessedTokens: TokenObject[],
    ast: Node_Script,
    globalScope: SymbolGlobalScope,
    caret: TextPosition
): CompletionItemWrapper[] {
    if (isCaretInDeclarationPart(preprocessedTokens, ast, caret)) {
        return [];
    }

    const items = provideCompletion_internal(ast, globalScope, caret);

    // Assign sort keys to the completion items.
    for (const item of items) {
        attackSortKey(item.item);
    }

    return items;
}

function provideCompletion_internal(
    ast: Node_Script,
    globalScope: SymbolGlobalScope,
    caret: TextPosition
): CompletionItemWrapper[] {
    const items: CompletionItemWrapper[] = [];

    const caretScope = findScopeContainingPosition(globalScope, caret).scope;

    // If there is a higher-priority completion target in this scope, return its candidates first.
    // e.g., instance methods on an object.
    const prioritizedCompletion = checkMissingCompletionInScope(globalScope, caretScope, caret);
    if (prioritizedCompletion !== undefined) {
        return prioritizedCompletion;
    }

    // Return completion candidates from this scope and its parent scopes.
    // e.g., classes or functions defined in the current context.
    for (const scope of collectScopeListWithParentAndUsingNamespace(caretScope)) {
        items.push(...getCompletionSymbolsInScope(scope, true));
    }

    // Hoist enum members to the global scope if the setting is enabled.
    items.push(...hoistEnumParentScope(globalScope, []));

    // Return snippet completions if the setting is enabled and the context is appropriate.
    items.push(...provideSnippetCompletion(ast, caret).map(item => ({item})));

    return items;
}

function getCompletionSymbolsInScope(scope: SymbolScope, includeInstanceMember: boolean): CompletionItemWrapper[] {
    const items: CompletionItemWrapper[] = [];

    // Complete symbols declared in this scope.
    for (const [symbolName, symbol] of scope.symbolTable) {
        if (includeInstanceMember === false) {
            // Skip instance members.
            if (isSymbolInstanceMember(symbol)) {
                continue;
            }

            if (symbol.isVariable() && symbol.identifierToken.isVirtual() && symbol.identifierText === 'this') {
                // FIXME: Probably something is wrong
                continue;
            }
        }

        items.push(makeCompletionItem(symbolName, symbol));
    }

    // Complete namespaces.
    for (const [childName, childScope] of scope.childScopeTable) {
        if (childScope.isPureNamespaceScope() === false) {
            continue;
        }

        items.push({
            item: {
                label: childName,
                kind: CompletionItemKind.Module
            }
        });
    }

    return items;
}

function hoistEnumParentScope(globalScope: SymbolGlobalScope, filter: ScopePath) {
    if (getGlobalSettings().hoistEnumParentScope === false) {
        return [];
    }

    const items: CompletionItemWrapper[] = [];

    for (const enumScope of globalScope.getContext().enumScopeList) {
        if (filter.every((key, i) => key === enumScope.scopePath[i]) === false) {
            continue;
        }

        for (const [key, symbol] of enumScope.symbolTable) {
            items.push(makeCompletionItem(key, symbol));
        }
    }

    return items;
}

function getCompletionMembersInScope(
    globalScope: SymbolScope,
    caretScope: SymbolScope,
    symbolScope: SymbolScope
): CompletionItemWrapper[] {
    const items: CompletionItemWrapper[] = [];

    // Complete symbols declared in this scope.
    for (const [symbolName, symbol] of symbolScope.symbolTable) {
        if (isSymbolInstanceMember(symbol) === false) {
            continue;
        }

        if (canAccessInstanceMember(caretScope, symbol) === false) {
            continue;
        }

        items.push(makeCompletionItem(symbolName, symbol));
    }

    return items;
}

function checkMissingCompletionInScope(globalScope: SymbolGlobalScope, caretScope: SymbolScope, caret: Position) {
    for (const info of globalScope.markers.instanceAccess) {
        // Check whether this higher-priority completion target is at the cursor position.
        const location = getInstanceAccessMarkerLocation(info);
        if (location.positionInRange(caret)) {
            // Return the higher-priority completion target.
            const result = autocompleteInstanceMember(globalScope, caretScope, info);
            if (result !== undefined && result.length > 0) {
                return result;
            }
        }
    }

    for (const info of globalScope.markers.scopeAccess) {
        // Check whether this higher-priority completion target is at the cursor position.
        const location = getScopeAccessMarkerLocation(info);
        if (location.positionInRange(caret)) {
            // Return the higher-priority completion target.
            const result = getCompletionSymbolsInScope(info.targetScope, false);
            if (result !== undefined && result.length > 0) {
                if (info.targetScope.linkedNode?.nodeName !== NodeName.Enum) {
                    result.push(...hoistEnumParentScope(globalScope, info.targetScope.scopePath));
                }

                return result;
            }
        }
    }

    return undefined;
}

function autocompleteInstanceMember(
    globalScope: SymbolScope,
    caretScope: SymbolScope,
    completion: InstanceAccessMarker
) {
    // Find the scope that owns the type being completed.
    if (completion.targetType.membersScopePath === undefined) {
        return [];
    }

    const typeScope = globalScope
        .getGlobalScope()
        .resolveScope(completion.targetType.scopePath)
        ?.lookupScope(completion.targetType.identifierToken.text);
    if (typeScope === undefined) {
        return [];
    }

    // Return completion candidates from that scope.
    return getCompletionMembersInScope(globalScope, caretScope, typeScope);
}

function makeCompletionItem(symbolName: string, symbol: SymbolObjectHolder): CompletionItemWrapper {
    const item: CompletionItem = {label: symbolName};

    // FIXME: We should classify the completion items more precisely.

    if (symbol.isType()) {
        if (symbol.isPrimitiveType() || symbol.linkedNode === undefined) {
            item.kind = CompletionItemKind.Keyword;
        } else if (symbol.isEnumType()) {
            item.kind = CompletionItemKind.Enum;
        } else if (symbol.linkedNode.nodeName === NodeName.Interface) {
            item.kind = CompletionItemKind.Interface;
        } else {
            item.kind = CompletionItemKind.Class;
        }
    } else if (symbol.isFunctionHolder()) {
        item.kind = CompletionItemKind.Function;
    } else {
        // Variable
        item.kind = CompletionItemKind.Variable;
    }

    return {item, symbol};
}

// Sort symbols with leading underscores toward the end.
function attackSortKey(item: CompletionItem) {
    if (item.sortText !== undefined) {
        return;
    }

    const labelText: string = item.label;

    let underscoreCount = 0;
    while (underscoreCount < labelText.length && labelText[underscoreCount] === '_') {
        underscoreCount++;
    }

    item.sortText = String.fromCharCode(underscoreCount) + labelText;
}

// -----------------------------------------------

// TODO: Autocomplete for built-in keywords? 'true', 'opAdd', etc.

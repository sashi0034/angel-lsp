import {isSymbolInstanceMember, ScopePath, SymbolObjectHolder} from '../compiler_analyzer/symbolObject';
import {CompletionItem, CompletionItemKind} from 'vscode-languageserver/node';
import {Node_Script, NodeName} from '../compiler_parser/nodeObject';
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
import {provideFunctionSectionCompletion} from './completion/functionSection';
import {provideSnippetCompletion} from './completion/snippet';
import {provideDirectiveCompletion} from './completion/directive';
import {CaretContext} from './completion/caretContext';

export interface CompletionItemWrapper {
    item: CompletionItem;
    symbol?: SymbolObjectHolder;
}

/**
 * Returns the completion candidates for the specified position.
 */
export function provideCompletion(
    rawTokens: TokenObject[],
    preprocessedTokens: TokenObject[],
    definedSymbols: ReadonlySet<string>,
    ast: Node_Script,
    globalScope: SymbolGlobalScope,
    caret: TextPosition
): CompletionItemWrapper[] {
    const caretContext = new CaretContext(rawTokens, preprocessedTokens, ast, caret);

    if (isCaretInDeclarationPart(caretContext)) {
        return [];
    }

    const directiveCompletion = provideDirectiveCompletion(rawTokens, definedSymbols, caret);
    if (directiveCompletion !== undefined) {
        return directiveCompletion.map(item => ({item}));
    }

    const functionSectionCompletion = provideFunctionSectionCompletion(caretContext);
    if (functionSectionCompletion !== undefined) {
        return functionSectionCompletion;
    }

    const items = provideGeneralCompletion(caretContext, globalScope);

    // Assign sort keys to the completion items.
    for (const item of items) {
        attachSortKey(item.item);
    }

    return items;
}

function provideGeneralCompletion(caret: CaretContext, globalScope: SymbolGlobalScope): CompletionItemWrapper[] {
    const items: CompletionItemWrapper[] = [];
    const caretPosition = caret.caret;

    const caretScope = findScopeContainingPosition(globalScope, caretPosition).scope;

    // If the caret is after an access operator, complete members from that target only.
    // e.g., members after `object.` or symbols after `namespace::`.
    const accessCompletion = provideAccessCompletion(globalScope, caretScope, caret);
    if (accessCompletion !== undefined) {
        return accessCompletion;
    }

    // Return completion candidates from this scope and its parent scopes.
    // e.g., classes or functions defined in the current context.
    for (const scope of collectScopeListWithParentAndUsingNamespace(caretScope)) {
        items.push(...provideScopeCompletion(scope, true));
    }

    // Hoist enum members to the global scope if the setting is enabled.
    items.push(...provideHoistedEnumMemberCompletion(globalScope, []));

    // Return built-in keywords and primitive types.
    items.push(...provideBuiltinKeywordCompletion(items));

    // Return snippet completions if the setting is enabled and the context is appropriate.
    items.push(...provideSnippetCompletion(caret).map(item => ({item})));

    return items;
}

export const builtinCompletionKeywords = [
    'auto',
    'void',
    'int',
    'int8',
    'int16',
    'int32',
    'int64',
    'uint',
    'uint8',
    'uint16',
    'uint32',
    'uint64',
    'float',
    'double',
    'bool',
    'true',
    'false',
    'null',
    'const'
];

function provideBuiltinKeywordCompletion(existingItems: CompletionItemWrapper[]): CompletionItemWrapper[] {
    if (!getGlobalSettings().completion.builtinKeywords) {
        return [];
    }

    const existingLabels = new Set(existingItems.map(item => item.item.label));
    return builtinCompletionKeywords
        .filter(keyword => !existingLabels.has(keyword))
        .map(keyword => ({
            item: {
                label: keyword,
                kind: CompletionItemKind.Keyword
            }
        }));
}

function provideScopeCompletion(scope: SymbolScope, includeInstanceMember: boolean): CompletionItemWrapper[] {
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

        items.push(createCompletionItem(symbolName, symbol));
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

function provideHoistedEnumMemberCompletion(globalScope: SymbolGlobalScope, filter: ScopePath) {
    if (getGlobalSettings().hoistEnumParentScope === false) {
        return [];
    }

    const items: CompletionItemWrapper[] = [];

    for (const enumScope of globalScope.getContext().enumScopeList) {
        if (filter.every((key, i) => key === enumScope.scopePath[i]) === false) {
            continue;
        }

        for (const [key, symbol] of enumScope.symbolTable) {
            items.push(createCompletionItem(key, symbol));
        }
    }

    return items;
}

function provideAccessCompletion(globalScope: SymbolGlobalScope, caretScope: SymbolScope, caret: CaretContext) {
    const caretPosition = caret.caret;

    if (isCaretAtAccessOperator(caret, '.')) {
        // e.g., `my_object.member.$C$`
        for (const info of globalScope.markers.instanceAccess) {
            const location = getInstanceAccessMarkerLocation(info);
            if (location.positionInRange(caretPosition)) {
                return getInstanceMemberCompletionItems(globalScope, caretScope, info);
            }
        }

        return [];
    }

    if (isCaretAtAccessOperator(caret, '::')) {
        // e.g., `my_scope::name::$C$`
        for (const info of globalScope.markers.scopeAccess) {
            const location = getScopeAccessMarkerLocation(info);
            if (location.positionInRange(caretPosition)) {
                const result = provideScopeCompletion(info.targetScope, false);
                if (info.targetScope.linkedNode?.nodeName !== NodeName.Enum) {
                    result.push(...provideHoistedEnumMemberCompletion(globalScope, info.targetScope.scopePath));
                }

                return result;
            }
        }

        return [];
    }

    return undefined;
}

function isCaretAtAccessOperator(caret: CaretContext, operator: '.' | '::'): boolean {
    const nearest = caret.getNearestToken();

    return nearest.containingToken?.text === operator || nearest.precedingToken?.text === operator;
}

function getInstanceMemberCompletionItems(
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
    return getInstanceMemberCompletionItems_internal(caretScope, typeScope);
}

function getInstanceMemberCompletionItems_internal(
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

        items.push(createCompletionItem(symbolName, symbol));
    }

    return items;
}

function createCompletionItem(symbolName: string, symbol: SymbolObjectHolder): CompletionItemWrapper {
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
function attachSortKey(item: CompletionItem) {
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

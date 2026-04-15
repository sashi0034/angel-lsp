import {TokenObject} from '../compiler_tokenizer/tokenObject';
import {FunctionSymbolHolder, SymbolObject, TypeSymbol} from './symbolObject';
import {SymbolScope} from './symbolScope';
import {TextLocation} from '../compiler_tokenizer/textLocation';
import {ResolvedType, TemplateMapping} from './resolvedType';
import {Node_ArgList} from '../compiler_parser/nodes';

/**
 * Information about a symbol that references a symbol declared elsewhere.
 */
export interface ReferenceInfo {
    readonly toSymbol: SymbolObject;
    readonly fromToken: TokenObject;
}

/**
 * Location information within the file where the target scope exists.
 * e.g., the code block inside `{}` in `void fn() { ... }`.
 */
export interface ScopeRegionInfo {
    readonly boundingLocation: TextLocation;
    readonly targetScope: SymbolScope;
}

/**
 * Represents an autocomplete target for instance members.
 * e.g., suggesting methods or properties of an instance of a class.
 */
export interface AutocompleteInstanceMemberInfo {
    readonly autocompleteLocation: TextLocation;
    readonly targetType: TypeSymbol;
}

/**
 * Represents an autocomplete target for namespace symbols.
 * This is generated for each namespace token, i.e., `Outer::Inner::$C$` will generate two infos.
 * e.g., suggesting possible completions for `Outer::Inner::$C$`, where `$C$` is the caret.
 */
export interface AutocompleteNamespaceAccessInfo {
    readonly autocompleteLocation: TextLocation;
    readonly accessScope: SymbolScope;
    readonly namespaceToken: TokenObject; // The namespace qualifier token.
    readonly tokenAfterNamespaces: TokenObject | undefined; // The token after the namespace qualifiers. This is outside the Node_Scope.
}

/**
 * Function call information that can be used when suggesting possible values.
 * e.g., providing argument suggestions when typing inside a function call `fn($C$)`, where `$C$` is the caret.
 */
export interface FunctionCallInfo {
    readonly callerIdentifier: TokenObject;
    readonly callerArgumentsNode: Node_ArgList;
    readonly calleeFuncHolder: FunctionSymbolHolder;
    readonly calleeTemplateMapping: TemplateMapping | undefined;
}

/**
 * Represents the type resolution information for the auto keyword.
 * e.g., providing the resolved type for the auto keyword.
 */
export interface AutoTypeResolutionInfo {
    readonly autoToken: TokenObject;
    readonly resolvedType: ResolvedType;
}

import {TokenObject} from '../compiler_tokenizer/tokenObject';
import {FunctionSymbolHolder, SymbolObject, TypeSymbol} from './symbolObject';
import {SymbolScope} from './symbolScope';
import {TextLocation} from '../compiler_tokenizer/textLocation';
import {ResolvedType, TemplateMapping} from './resolvedType';
import {Node_ArgList} from '../compiler_parser/nodes';

/**
 * Marker for a symbol that references a symbol declared elsewhere.
 */
export interface ReferenceMarker {
    readonly toSymbol: SymbolObject;
    readonly fromToken: TokenObject;
}

/**
 * Location marker within the file where the target scope exists.
 * e.g., the code block inside `{}` in `void fn() { ... }`.
 */
export interface ScopeRegionMarker {
    readonly boundingLocation: TextLocation;
    readonly targetScope: SymbolScope;
}

/**
 * Represents an autocomplete target for instance members.
 * e.g., suggesting methods or properties of an instance of a class.
 */
export interface AutocompleteInstanceMemberMarker {
    readonly autocompleteLocation: TextLocation;
    readonly targetType: TypeSymbol;
}

/**
 * Represents an autocomplete target for namespace symbols.
 * This is generated for each namespace token, i.e., `Outer::Inner::$C$` will generate two markers.
 * e.g., suggesting possible completions for `Outer::Inner::$C$`, where `$C$` is the caret.
 */
export interface AutocompleteNamespaceAccessMarker {
    readonly autocompleteLocation: TextLocation;
    readonly accessScope: SymbolScope;
    readonly namespaceToken: TokenObject; // The namespace qualifier token.
    readonly tokenAfterNamespaces: TokenObject | undefined; // The token after the namespace qualifiers. This is outside the Node_Scope.
}

/**
 * Function call marker that can be used when suggesting possible values.
 * e.g., providing argument suggestions when typing inside a function call `fn($C$)`, where `$C$` is the caret.
 */
export interface FunctionCallMarker {
    readonly callerIdentifier: TokenObject;
    readonly callerArgumentsNode: Node_ArgList;
    readonly calleeFuncHolder: FunctionSymbolHolder;
    readonly calleeTemplateMapping: TemplateMapping | undefined;
}

/**
 * Represents the type resolution information for the auto keyword.
 * e.g., providing the resolved type for the auto keyword.
 */
export interface AutoTypeResolutionMarker {
    readonly autoToken: TokenObject;
    readonly resolvedType: ResolvedType;
}

import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {SymbolType, SymbolFunction} from "./symbolObject";
import {getActiveGlobalScope, SymbolScope} from "./symbolScope";
import {TextLocation} from "../compiler_tokenizer/textLocation";
import {TokenRange} from "../compiler_tokenizer/tokenRange";
import {TemplateTranslator} from "./resolvedType";
import {NodeArgList} from "../compiler_parser/nodes";

/**
 * Complement hint information that is not typically used in the analyzer but is utilized in the service layer.
 */
export enum ComplementKind {
    /**
     * Location information within the file where the target scope exists, like inside `{ }` in a function scope.
     * */
    ScopeRegion = 'ScopeRegion',

    /**
     * Autocomplete for instance members, like `player.m_parent.$C$`
     * */
    AutocompleteInstanceMember = 'AutocompleteInstanceMember',

    /**
     * Autocomplete for namespace symbols, like `Outer::Inner::$C$`.
     * */
    AutocompleteNamespaceAccess = 'AutocompleteNamespaceAccess',

    /**
     * Function call information that can be used when suggesting possible values when autocomplete an argument
     * */
    FunctionCall = 'FunctionCall',
}

/**
 * Base interface for all autocomplete target types.
 */
interface ComplementBase {
    /**
     * The specific kind of autocomplete target.
     * */
    complementKind: ComplementKind;
}

/**
 * Location information within the file where the target scope exists.
 * e.g., the code block inside `{}` in `void fn() { ... }`.
 */
export interface ComplementScopeRegion extends ComplementBase {
    complementKind: ComplementKind.ScopeRegion;
    boundingLocation: TextLocation;
    targetScope: SymbolScope;
}

/**
 * Represents an autocomplete target for instance members.
 * e.g., suggesting methods or properties of an instance of a class.
 */
export interface ComplementInstanceMember extends ComplementBase {
    complementKind: ComplementKind.AutocompleteInstanceMember;
    autocompleteLocation: TextLocation;
    targetType: SymbolType;
}

/**
 * Represents an autocomplete target for namespace symbols.
 * This is generated for each namespace token, i.e., `Outer::Inner::$C$` will generate two hints.
 * e.g., suggesting possible completions for `Outer::Inner::$C$`, where `$C$` is the caret.
 */
export interface ComplementNamespaceAccess extends ComplementBase {
    complementKind: ComplementKind.AutocompleteNamespaceAccess;
    autocompleteLocation: TextLocation;
    accessScope: SymbolScope;
    namespaceToken: TokenObject; // The namespace qualifier token.
    tokenAfterNamespaces: TokenObject | undefined; // The token after the namespace qualifiers. This is outside the NodeScope.
}

/**
 * Function call information that can be used when suggesting possible values.
 * e.g., providing argument suggestions when typing inside a function call `fn($C$)`, where `$C$` is the caret.
 */
export interface ComplementFunctionCall extends ComplementBase {
    complementKind: ComplementKind.FunctionCall;
    callerIdentifier: TokenObject;
    callerArgumentsNode: NodeArgList;
    callerTemplateTranslator: TemplateTranslator | undefined;
    expectedCallee: SymbolFunction; // FIXME: Should be SymbolFunctionHolder?
}

export type ComplementHint =
    ComplementScopeRegion
    | ComplementInstanceMember
    | ComplementNamespaceAccess
    | ComplementFunctionCall;

type AutocompleteHint = ComplementInstanceMember | ComplementNamespaceAccess;

export function isAutocompleteHint(hint: ComplementHint): hint is AutocompleteHint {
    return hint.complementKind === ComplementKind.AutocompleteInstanceMember
        || hint.complementKind === ComplementKind.AutocompleteNamespaceAccess;
}

// -----------------------------------------------

export function complementScopeRegion(targetScope: SymbolScope, tokenRange: TokenRange) {
    getActiveGlobalScope().pushCompletionHint({
        complementKind: ComplementKind.ScopeRegion,
        boundingLocation: tokenRange.getBoundingLocation(),
        targetScope: targetScope
    });
}

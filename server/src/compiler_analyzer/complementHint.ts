import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {SymbolType, SymbolFunction} from "./symbolObject";
import {SymbolScope} from "./symbolScope";
import {TextLocation} from "../compiler_tokenizer/textLocation";
import {TokenRange} from "../compiler_tokenizer/tokenRange";
import {TemplateTranslator} from "./resolvedType";

/**
 * Enumeration defining the different kinds of autocomplete targets.
 */
export enum ComplementKind {
    /** Autocomplete within a scope, such as inside `{ }` in a function body. */
    Scope = 'Scope', // TODO: Rename to ScopeRegion

    /** Autocomplete for instance members, like `player.m_parent.$C$` */
    InstanceMember = 'InstanceMember',

    /** Autocomplete for namespace symbols, like `Outer::Inner::$C$`. */
    NamespaceSymbol = 'NamespaceSymbol',

    /** Autocomplete for function arguments, suggesting possible values when calling a function. */
    CallerArguments = 'CallerArguments',
}

/**
 * Base interface for all autocomplete target types.
 */
export interface ComplementBase {
    /** The specific kind of autocomplete target. */
    complementKind: ComplementKind;

    /** The location in the text where the autocomplete is being triggered. */
    complementLocation: TextLocation;
}

/**
 * Represents an autocomplete target within a scope.
 * e.g., the code block inside `{}` in `void fn() { ... }`.
 */
export interface ComplementScope extends ComplementBase {
    complementKind: ComplementKind.Scope;
    targetScope: SymbolScope;
}

/**
 * Represents an autocomplete target for instance members.
 * e.g., suggesting methods or properties of an instance of a class.
 */
export interface ComplementInstanceMember extends ComplementBase {
    complementKind: ComplementKind.InstanceMember;
    targetType: SymbolType;
}

/**
 * Represents an autocomplete target for namespace symbols.
 * This is generated for each namespace token, i.e., `Outer::Inner::$C$` will generate two hints.
 * e.g., suggesting possible completions for `Outer::Inner::$C$`, where `$C$` is the caret.
 */
export interface ComplementNamespaceSymbol extends ComplementBase {
    complementKind: ComplementKind.NamespaceSymbol;
    accessScope: SymbolScope;
    slicedNamespaceList: TokenObject[]; // Tokens sliced from the beginning of the namespace to the target
    tokenAfterNamespace: TokenObject | undefined; // The token after the namespace list. This is outside the NodeScope.
}

/**
 * Represents an autocomplete target for function arguments.
 * e.g., providing argument suggestions when typing inside a function call `fn($C$)`, where `$C$` is the caret.
 */
export interface ComplementCallerArgument extends ComplementBase {
    complementKind: ComplementKind.CallerArguments;
    expectedCallee: SymbolFunction;
    passingRanges: TokenRange[];
    templateTranslator: TemplateTranslator | undefined;
}

export type ComplementHint =
    ComplementScope
    | ComplementInstanceMember
    | ComplementNamespaceSymbol
    | ComplementCallerArgument;

// -----------------------------------------------

export function complementHintForScope(targetScope: SymbolScope, tokenRange: TokenRange) {
    targetScope.pushCompletionHint({
        complementKind: ComplementKind.Scope,
        complementLocation: tokenRange.getBoundingLocation(),
        targetScope: targetScope
    });
}
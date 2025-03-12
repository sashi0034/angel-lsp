import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {SymbolType, SymbolFunction} from "./symbolObject";
import {SymbolScope} from "./symbolScope";
import {TextLocation} from "../compiler_tokenizer/textLocation";
import {TokenRange} from "../compiler_parser/tokenRange";
import {TemplateTranslator} from "./resolvedType";

/**
 * Enumeration defining the different kinds of autocomplete targets.
 */
export enum ComplementKind {
    /** Autocomplete within a scope, such as inside `{}` in a function body. */
    Scope = 'Scope',

    /** Autocomplete for instance members, such as properties or methods of a class instance. */
    InstanceMember = 'InstanceMember',

    /** Autocomplete for namespace symbols, such as `Outer::Inner::Symbol`. */
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
 * e.g,, suggesting possible completions for `Outer::Inner::...`.
 */
export interface ComplementNamespaceSymbol extends ComplementBase {
    complementKind: ComplementKind.NamespaceSymbol;
    namespaceList: TokenObject[];
}

/**
 * Represents an autocomplete target for function arguments.
 * e.g., providing argument suggestions when typing inside a function call `fn(|)`, where `|` is the caret.
 */
export interface ComplementCallerArgument extends ComplementBase {
    complementKind: ComplementKind.CallerArguments;
    expectedCallee: SymbolFunction;
    passingRanges: TokenRange[];
    templateTranslate: TemplateTranslator | undefined;
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
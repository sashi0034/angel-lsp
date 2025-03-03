import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {SymbolType, SymbolFunction} from "./symbolObject";
import {TemplateTranslation} from "./symbolUtils";
import {SymbolScope} from "./symbolScope";
import {TextLocation} from "../compiler_tokenizer/textLocation";
import {TokenRange} from "../compiler_parser/tokenRange";

/**
 * Types of autocomplete targets
 */
export enum ComplementKind {
    Scope = 'Scope',
    InstanceMember = 'InstanceMember',
    NamespaceSymbol = 'NamespaceSymbol',
    CallerArguments = 'CallerArguments',
}

export interface ComplementBase {
    complementKind: ComplementKind;
    complementLocation: TextLocation;
}

/**
 * Represents the completion target of a scope.
 * e.g. The scope between `{` and `}` in `void fn() {...}`
 */
export interface ComplementScope extends ComplementBase {
    complementKind: ComplementKind.Scope;
    targetScope: SymbolScope;
}

/**
 * Represents the completion target of a type.
 * e.g. Methods and properties of an instance of a class.
 */
export interface ComplementInstanceMember extends ComplementBase {
    complementKind: ComplementKind.InstanceMember;
    targetType: SymbolType;
}

/**
 * Represents the completion target of a namespace.
 * e.g. `Outer:: ...` and `Inner:: ...` within the context of `Outer::Inner::`
 */
export interface CompletionNamespaceSymbol extends ComplementBase {
    complementKind: ComplementKind.NamespaceSymbol;
    namespaceList: TokenObject[];
}

/**
 * Represents the completion target of a function argument.
 * e.g. `fn(|)` where `|` is the caret position.
 */
export interface CompletionCallerArgument extends ComplementBase {
    complementKind: ComplementKind.CallerArguments;
    expectedCallee: SymbolFunction;
    passingRanges: TokenRange[];
    templateTranslate: TemplateTranslation | undefined;
}

export type ComplementHints =
    ComplementScope
    | ComplementInstanceMember
    | CompletionNamespaceSymbol
    | CompletionCallerArgument;

export function pushHintOfCompletionScopeToParent(
    parentScope: SymbolScope | undefined, targetScope: SymbolScope, nodeRange: TokenRange
) {
    parentScope?.completionHints.push({
        complementKind: ComplementKind.Scope,
        complementLocation: nodeRange.getBoundingLocation(),
        targetScope: targetScope
    });
}
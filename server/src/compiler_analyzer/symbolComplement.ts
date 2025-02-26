import {TokenRange} from "../compiler_parser/nodes";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {SymbolType, SymbolFunction} from "./symbolObject";
import {TemplateTranslation} from "./symbolUtils";
import {SymbolScope} from "./symbolScope";
import {TextLocation} from "../compiler_tokenizer/textLocation";

/**
 * Types of autocomplete targets
 */
export enum ComplementKind {
    Scope = 'Scope',
    Type = 'Type',
    Namespace = 'Namespace',
    Arguments = 'Arguments',
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
export interface ComplementType extends ComplementBase {
    complementKind: ComplementKind.Type;
    targetType: SymbolType;
}

/**
 * Represents the completion target of a namespace.
 * e.g. `Outer:: ...` and `Inner:: ...` within the context of `Outer::Inner::`
 */
export interface CompletionNamespace extends ComplementBase {
    complementKind: ComplementKind.Namespace;
    namespaceList: TokenObject[];
}

/**
 * Represents the completion target of a function argument.
 * e.g. `fn(|)` where `|` is the caret position.
 */
export interface CompletionArgument extends ComplementBase {
    complementKind: ComplementKind.Arguments;
    expectedCallee: SymbolFunction;
    passingRanges: TokenRange[];
    templateTranslate: TemplateTranslation | undefined;
}

export type ComplementHints =
    ComplementScope
    | ComplementType
    | CompletionNamespace
    | CompletionArgument;

export function pushHintOfCompletionScopeToParent(
    parentScope: SymbolScope | undefined, targetScope: SymbolScope, nodeRange: TokenRange
) {
    parentScope?.completionHints.push({
        complementKind: ComplementKind.Scope,
        complementLocation: nodeRange.getBoundingLocation(),
        targetScope: targetScope
    });
}
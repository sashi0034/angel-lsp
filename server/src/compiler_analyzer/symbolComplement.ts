import {ParsedRange} from "../compiler_parser/nodes";
import {getNodeLocation} from "../compiler_parser/nodesUtils";
import {LocationInfo} from "../compiler_tokenizer/tokens";
import {ParsedToken} from "../compiler_parser/parsedToken";
import {SymbolType, SymbolScope, SymbolFunction} from "./symbols";
import {TemplateTranslation} from "./symbolUtils";

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
    complementLocation: LocationInfo;
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
    namespaceList: ParsedToken[];
}

/**
 * Represents the completion target of a function argument.
 * e.g. `fn(|)` where `|` is the caret position.
 */
export interface CompletionArgument extends ComplementBase {
    complementKind: ComplementKind.Arguments;
    expectedCallee: SymbolFunction;
    passingRanges: ParsedRange[];
    templateTranslate: TemplateTranslation | undefined;
}

export type ComplementHints =
    ComplementScope
    | ComplementType
    | CompletionNamespace
    | CompletionArgument;

export function pushHintOfCompletionScopeToParent(
    parentScope: SymbolScope | undefined, targetScope: SymbolScope, nodeRange: ParsedRange
) {
    parentScope?.completionHints.push({
        complementKind: ComplementKind.Scope,
        complementLocation: getNodeLocation(nodeRange),
        targetScope: targetScope
    });
}
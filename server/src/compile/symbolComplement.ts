import {ParsedRange} from "./nodes";
import {getNodeLocation} from "./nodesUtils";
import {LocationInfo} from "./tokens";
import {ParsedToken} from "./parsedToken";
import {SymbolicType, SymbolScope} from "./symbols";

/**
 * Types of autocomplete targets
 */
export enum ComplementKind {
    Scope = 'Scope',
    Type = 'Type',
    Namespace = 'Namespace',
}

export interface ComplementBase {
    complementKind: ComplementKind;
    complementLocation: LocationInfo;
}

export interface ComplementScope extends ComplementBase {
    complementKind: ComplementKind.Scope;
    targetScope: SymbolScope;
}

export function pushHintOfCompletionScopeToParent(
    parentScope: SymbolScope | undefined, targetScope: SymbolScope, nodeRange: ParsedRange
) {
    parentScope?.completionHints.push({
        complementKind: ComplementKind.Scope,
        complementLocation: getNodeLocation(nodeRange),
        targetScope: targetScope
    });
}

export interface ComplementType extends ComplementBase {
    complementKind: ComplementKind.Type;
    targetType: SymbolicType;
}

export interface CompletionNamespace extends ComplementBase {
    complementKind: ComplementKind.Namespace;
    namespaceList: ParsedToken[];
}

export type ComplementHints = ComplementScope | ComplementType | CompletionNamespace;

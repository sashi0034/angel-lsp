import {EntityAttribute, NodeScope, NodeType} from "./nodes";

export enum ParsedCacheKind {
    EntityAttribute = 'EntityAttribute',
    Scope = 'Scope',
    TypeTemplates = 'TypeTemplates',
}

export type ParsedCacheTargets<T extends ParsedCacheKind> = TargetEntityAttribute<T>;

type TargetEntityAttribute<T extends ParsedCacheKind> =
    T extends ParsedCacheKind.EntityAttribute ? EntityAttribute : TargetScope<T>;

type TargetScope<T extends ParsedCacheKind> =
    T extends ParsedCacheKind.Scope ? NodeScope : TargetTypeTemplates<T>;

type TargetTypeTemplates<T extends ParsedCacheKind> =
    T extends ParsedCacheKind.TypeTemplates ? NodeType[] : never;

export interface ParsedCachedData<T extends ParsedCacheKind> {
    kind: T;
    rangeEnd: number;
    data: ParsedCacheTargets<T> | undefined;
}

export interface ParsedCacheServices<T extends ParsedCacheKind> {
    restore: (() => ParsedCacheTargets<T> | undefined) | undefined;
    store: (cache: ParsedCacheTargets<T> | undefined) => void;
}

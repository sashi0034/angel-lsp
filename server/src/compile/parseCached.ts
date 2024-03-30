import {EntityAttribute, NodeScope} from "./nodes";

export enum ParseCacheKind {
    EntityAttribute = 'EntityAttribute',
    Scope = 'Scope',
}

export type ParseCacheTargets<T extends ParseCacheKind> = TargetEntityAttribute<T>;

type TargetEntityAttribute<T extends ParseCacheKind> =
    T extends ParseCacheKind.EntityAttribute ? EntityAttribute : TargetScope<T>;

type TargetScope<T extends ParseCacheKind> =
    T extends ParseCacheKind.Scope ? NodeScope : never;

export interface ParseCachedData<T extends ParseCacheKind> {
    kind: T;
    rangeEnd: number;
    data: ParseCacheTargets<T> | undefined;
}

export interface ParseCacher<T extends ParseCacheKind> {
    restore: (() => ParseCacheTargets<T> | undefined) | undefined;
    store: (cache: ParseCacheTargets<T> | undefined) => void;
}

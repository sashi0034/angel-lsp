import {EntityAttribute, NodeScope, NodeType} from "./nodes";

export enum ParserCacheKind {
    EntityAttribute = 'EntityAttribute',
    Scope = 'Scope',
    TypeTemplates = 'TypeTemplates',
}

export type ParserCacheTargets<T extends ParserCacheKind> = TargetEntityAttribute<T>;

type TargetEntityAttribute<T extends ParserCacheKind> =
    T extends ParserCacheKind.EntityAttribute ? EntityAttribute : TargetScope<T>;

type TargetScope<T extends ParserCacheKind> =
    T extends ParserCacheKind.Scope ? NodeScope : TargetTypeTemplates<T>;

type TargetTypeTemplates<T extends ParserCacheKind> =
    T extends ParserCacheKind.TypeTemplates ? NodeType[] : never;

export interface ParserCachedData<T extends ParserCacheKind> {
    kind: T;
    rangeEnd: number;
    data: ParserCacheTargets<T> | undefined;
}

export interface ParserCacheServices<T extends ParserCacheKind> {
    restore: (() => ParserCacheTargets<T> | undefined) | undefined;
    store: (cache: ParserCacheTargets<T> | undefined) => void;
}

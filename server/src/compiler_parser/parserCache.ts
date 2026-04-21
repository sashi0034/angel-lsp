import {EntityAttributeToken, Node_Scope, Node_Type} from './nodeObject';

export enum ParserCacheKind {
    EntityAttribute = 'EntityAttribute',
    Scope = 'Scope',
    TypeList = 'TypeList'
}

export type ParserCacheTargets<T extends ParserCacheKind> = TargetEntityAttribute<T>;

type TargetEntityAttribute<T extends ParserCacheKind> = T extends ParserCacheKind.EntityAttribute
    ? EntityAttributeToken[]
    : TargetScope<T>;

type TargetScope<T extends ParserCacheKind> = T extends ParserCacheKind.Scope ? Node_Scope : TargetTypeList<T>;

type TargetTypeList<T extends ParserCacheKind> = T extends ParserCacheKind.TypeList ? Node_Type[] : never;

export interface ParserCachedData<T extends ParserCacheKind> {
    kind: T;
    rangeEnd: number;
    data: ParserCacheTargets<T> | undefined;
}

export interface ParserCacheServices<T extends ParserCacheKind> {
    restore: (() => ParserCacheTargets<T> | undefined) | undefined;
    store: (cache: ParserCacheTargets<T> | undefined) => void;
}

import {LocationInfo, TokenKind} from "./token";
import {NodeClass, NodeEnum, NodeFunc, NodeIf, NodeName, NodeWhile} from "./nodes";
import {Range} from "vscode-languageserver";
import {dummyToken, ParsingToken} from "./parsing";
import {diagnostic} from "../code/diagnostic";

export enum SymbolKind {
    Type = 'Type',
    Function = 'Function',
    Variable = 'Variable',
}

export enum PrimitiveType {
    Bool = 'Bool',
    Number = 'Number',
    Void = 'Void',
}

export type SourceType = NodeEnum | NodeClass | PrimitiveType;

export function isSourcePrimitiveType(type: SourceType): type is PrimitiveType {
    return typeof type === 'string';
}

export function isSourceNodeClass(type: SourceType): type is NodeClass {
    if (isSourcePrimitiveType(type)) return false;
    return type.nodeName === NodeName.Class;
}

export interface SymbolicBase {
    symbolKind: SymbolKind;
    declaredPlace: ParsingToken;
}

export interface SymbolicType extends SymbolicBase {
    symbolKind: SymbolKind.Type;
    sourceType: SourceType;
}

export interface SymbolicFunction extends SymbolicBase {
    symbolKind: SymbolKind.Function;
    sourceNode: NodeFunc;
    returnType: DeducedType | undefined;
    parameterTypes: (DeducedType | undefined)[];
    nextOverload: SymbolicFunction | undefined;
}

export interface SymbolicVariable extends SymbolicBase {
    symbolKind: SymbolKind.Variable;
    type: SymbolicType | undefined;
}

export type SymbolicObject = SymbolicType | SymbolicFunction | SymbolicVariable;

// (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
export type SymbolOwnerNode = NodeEnum | NodeClass | NodeFunc | NodeIf;

export interface ReferencedSymbolInfo {
    declaredSymbol: SymbolicBase;
    referencedToken: ParsingToken;
}

export type ScopeMap = Map<string, SymbolScope>;

export type SymbolMap = Map<string, SymbolicObject>;

// 親ノードと親スコープ
export interface ScopeBirthInfo {
    ownerNode: SymbolOwnerNode | undefined;
    parentScope: SymbolScope | undefined;
}

// 定義されたシンボル情報と小スコープ
export interface ScopeContainInfo {
    childScopes: ScopeMap;
    symbolMap: SymbolMap;
}

// 参照情報や補完情報
export interface ScopeServiceInfo {
    referencedList: ReferencedSymbolInfo[];
    completionHints: ComplementHints[];
}

export type SymbolScope = ScopeBirthInfo & ScopeContainInfo & ScopeServiceInfo;

export interface SymbolAndScope {
    symbol: SymbolicObject;
    scope: SymbolScope;
}

export function insertSymbolicObject(map: SymbolMap, symbol: SymbolicObject): boolean {
    const identifier = symbol.declaredPlace.text;
    const hit = map.get(identifier);
    if (hit === undefined) {
        map.set(identifier, symbol);
        return true;
    }
    const canOverload = symbol.symbolKind === SymbolKind.Function && hit.symbolKind === SymbolKind.Function;
    if (canOverload === false) {
        diagnostic.addError(symbol.declaredPlace.location, `Symbol '${identifier}' is already defined ❌`);
        return false;
    }

    // 関数はオーバーロードとして追加が可能
    let cursor = hit;
    for (; ;) {
        if (cursor.nextOverload === undefined) {
            cursor.nextOverload = symbol;
            return true;
        }
        cursor = cursor.nextOverload;
    }
}

export interface DeducedType {
    symbol: SymbolicType;
    sourceScope: SymbolScope | undefined;
}

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

export interface ComplementType extends ComplementBase {
    complementKind: ComplementKind.Type;
    targetType: SymbolicType;
}

export interface CompletionNamespace extends ComplementBase {
    complementKind: ComplementKind.Namespace;
    namespaceList: ParsingToken[];
}

export type ComplementHints = ComplementScope | ComplementType | CompletionNamespace;

function createBuiltinType(name: PrimitiveType): SymbolicType {
    return {
        symbolKind: SymbolKind.Type,
        declaredPlace: dummyToken,
        sourceType: name,
    } as const;
}

export const builtinNumberType: SymbolicType = createBuiltinType(PrimitiveType.Number);

export const builtinBoolType: SymbolicType = createBuiltinType(PrimitiveType.Bool);

export const builtinVoidType: SymbolicType = createBuiltinType(PrimitiveType.Void);

export function tryGetBuiltInType(token: ParsingToken): SymbolicType | undefined {
    if (token.kind !== TokenKind.Reserved) return undefined;

    const identifier = token.text;
    if ((identifier === 'bool')) return builtinBoolType;
    else if ((identifier === 'void')) return builtinVoidType;
    else if (numberTypeSet.has(identifier)) return builtinNumberType;

    return undefined;
}

const numberTypeSet = new Set(['int8', 'int16', 'int', 'int32', 'int64', 'uint8', 'uint16', 'uint', 'uint32', 'uint64', 'float', 'double']);

export function findSymbolShallowly(scope: SymbolScope, identifier: string): SymbolicObject | undefined {
    return scope.symbolMap.get(identifier);
}

export function findSymbolWithParent(scope: SymbolScope, identifier: string): SymbolAndScope | undefined {
    const symbol = scope.symbolMap.get(identifier);
    if (symbol !== undefined) return {symbol: symbol, scope: scope};
    if (scope.parentScope === undefined) return undefined;
    return findSymbolWithParent(scope.parentScope, identifier);
}


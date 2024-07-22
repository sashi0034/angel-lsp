import {LocationInfo, TokenKind} from "./tokens";
import {
    AccessModifier,
    getNodeLocation, isFunctionHeadReturns,
    NodeClass,
    NodeEnum,
    NodeFunc, NodeFuncDef,
    NodeIf,
    NodeInterface, NodeIntfMethod, NodeLambda,
    NodeName,
    NodeVirtualProp,
    ParsedRange
} from "./nodes";
import {createVirtualToken, ParsingToken} from "./parsingToken";
import {diagnostic} from "../code/diagnostic";
import {numberTypeSet} from "./tokenReserves";
import assert = require("assert");
import {createSymbolScope, isAnonymousIdentifier} from "./scope";

export enum SymbolKind {
    Type = 'Type',
    Function = 'Function',
    Variable = 'Variable',
}

export enum PrimitiveType {
    Template = 'Template',
    String = 'String',
    Bool = 'Bool',
    Number = 'Number',
    Void = 'Void',
    Any = 'Any',
    Auto = 'Auto',
}

export type SourceType = NodeEnum | NodeClass | NodeInterface | PrimitiveType;

export function isSourcePrimitiveType(type: SourceType | undefined): type is PrimitiveType {
    return typeof type === 'string';
}

export function isSourceNodeClassOrInterface(type: SourceType): type is NodeClass {
    if (isSourcePrimitiveType(type)) return false;
    return type.nodeName === NodeName.Class || type.nodeName === NodeName.Interface;
}

export interface SymbolicBase {
    symbolKind: SymbolKind;
    declaredPlace: ParsingToken;
    declaredScope: SymbolScope;
}

export interface SymbolicType extends SymbolicBase {
    symbolKind: SymbolKind.Type;
    sourceType: SourceType;
    templateTypes?: ParsingToken[];
    baseList?: (DeducedType | undefined)[];
    isHandler?: boolean,
    membersScope: SymbolScope | undefined;
}

export interface SymbolicFunction extends SymbolicBase {
    symbolKind: SymbolKind.Function;
    sourceNode: NodeFunc | NodeFuncDef | NodeIntfMethod;
    returnType: DeducedType | undefined;
    parameterTypes: (DeducedType | undefined)[];
    nextOverload: SymbolicFunction | undefined;
    isInstanceMember: boolean;
    accessRestriction: AccessModifier | undefined;
}

export interface SymbolicVariable extends SymbolicBase {
    symbolKind: SymbolKind.Variable;
    type: DeducedType | undefined;
    isInstanceMember: boolean;
    accessRestriction: AccessModifier | undefined;
}

export function isSymbolInstanceMember(symbol: SymbolicObject): symbol is SymbolicFunction | SymbolicVariable {
    return (symbol.symbolKind === SymbolKind.Function || symbol.symbolKind === SymbolKind.Variable)
        && symbol.isInstanceMember;
}

export type SymbolicObject = SymbolicType | SymbolicFunction | SymbolicVariable;

// (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
export type SymbolOwnerNode =
    NodeEnum
    | NodeClass
    | NodeVirtualProp
    | NodeInterface
    | NodeFunc
    | NodeIf
    | NodeLambda;

export interface ReferencedSymbolInfo {
    declaredSymbol: SymbolicObject;
    referencedToken: ParsingToken;
}

export type ScopeMap = Map<string, SymbolScope>;

export type SymbolMap = Map<string, SymbolicObject>;

// Parent node and parent scope | 親ノードと親スコープ
export interface ScopeBirthInfo {
    ownerNode: SymbolOwnerNode | undefined;
    parentScope: SymbolScope | undefined;
    key: string;
}

// Defined symbol information and small scope | 定義されたシンボル情報と小スコープ
export interface ScopeContainInfo {
    childScopes: ScopeMap;
    symbolMap: SymbolMap;
}

// Reference information and completion information | 参照情報や補完情報
export interface ScopeServiceInfo {
    referencedList: ReferencedSymbolInfo[];
    completionHints: ComplementHints[];
}

export interface SymbolScope extends ScopeBirthInfo, ScopeContainInfo, ScopeServiceInfo {
}

export interface SymbolAndScope {
    symbol: SymbolicObject;
    scope: SymbolScope;
}

export function insertSymbolicObject(map: SymbolMap, symbol: SymbolicObject): boolean {
    const result = tryInsertSymbolicObject(map, symbol);
    if (result !== undefined) {
        diagnostic.addError(symbol.declaredPlace.location, `Symbol '${symbol.declaredPlace.text}' is already defined 💢`);
    }
    return result === undefined;
}

// Insert a symbol into the map. If the insertion is successful, return undefined. If it fails, return the existing symbol corresponding to the key.
// 挿入が成功したなら undefined を返す。失敗したらそのキーに対応する既存のシンボルを返す
export function tryInsertSymbolicObject(map: SymbolMap, symbol: SymbolicObject): SymbolicObject | undefined {
    const identifier = symbol.declaredPlace.text;
    const hit = map.get(identifier);
    if (hit === undefined) {
        map.set(identifier, symbol);
        return undefined;
    }

    const canOverload = symbol.symbolKind === SymbolKind.Function && hit.symbolKind === SymbolKind.Function;
    if (canOverload === false) return hit;

    // Functions can be added as overloads | 関数はオーバーロードとして追加が可能
    let cursor = hit;
    for (; ;) {
        if (cursor.nextOverload === undefined) {
            cursor.nextOverload = symbol;
            return undefined;
        }
        cursor = cursor.nextOverload;
    }
}

export type TemplateTranslation = Map<ParsingToken, DeducedType | undefined>;

export function resolveTemplateType(
    templateTranslate: TemplateTranslation, type: DeducedType | undefined
): DeducedType | undefined {
    if (type === undefined) return undefined;

    if (type.symbolType.symbolKind === SymbolKind.Function) return undefined; // FIXME: 関数ハンドラのテンプレート解決も必要?

    if (type.symbolType.sourceType !== PrimitiveType.Template) return type;

    if (templateTranslate.has(type.symbolType.declaredPlace)) {
        return templateTranslate.get(type.symbolType.declaredPlace);
    }
    return type;
}

export function resolveTemplateTypes(
    templateTranslate: (TemplateTranslation | undefined)[], type: DeducedType | undefined
) {
    return templateTranslate
        .reduce((arg, t) => t !== undefined ? resolveTemplateType(t, arg) : arg, type);
}

export interface DeducedType {
    symbolType: SymbolicType | SymbolicFunction;
    sourceScope: SymbolScope | undefined;
    isHandler?: boolean;
    templateTranslate?: TemplateTranslation;
}

export function isDeducedAutoType(type: DeducedType | undefined): boolean {
    return type !== undefined && type.symbolType.symbolKind === SymbolKind.Type && type.symbolType.sourceType === PrimitiveType.Auto;
}

export function stringifyScopeSuffix(scope: SymbolScope | undefined): string {
    let suffix = '';
    let scopeIterator: SymbolScope | undefined = scope;
    while (scopeIterator !== undefined) {
        // FIXME: 関数のスコープ名が入ってしまう問題がある
        if (isAnonymousIdentifier(scopeIterator.key) === false) {
            suffix = suffix.length === 0 ? scopeIterator.key : scopeIterator.key + '::' + suffix;
        }
        scopeIterator = scopeIterator.parentScope;
    }

    return suffix.length === 0 ? '' : suffix + '::';
}

export function stringifyDeducedType(type: DeducedType | undefined,): string {
    if (type === undefined) return '(undefined)';

    let suffix = '';
    if (type.isHandler === true) suffix = `${suffix}@`;

    if (type.symbolType.symbolKind === SymbolKind.Function) {
        const func: SymbolicFunction = type.symbolType;
        const returnType = func.returnType;
        const params = func.parameterTypes.map(t => stringifyDeducedType(t)).join(', ');
        return `${stringifyDeducedType(returnType)}(${params})` + suffix;
    }

    // if (hasScopeSuffix) suffix = stringifyScopeSuffix(type.sourceScope) + suffix;

    if (type.templateTranslate !== undefined) {
        suffix = `<${Array.from(type.templateTranslate.values()).map(t => stringifyDeducedType(t)).join(', ')}>${suffix}`;
    }

    return type.symbolType.declaredPlace.text + suffix;
}

export function stringifyDeducedTypes(types: (DeducedType | undefined)[]): string {
    return types.map(t => stringifyDeducedType(t)).join(', ');
}

/*
 * Build a string representation of a symbolic object.
 */
export function stringifySymbolicObject(symbol: SymbolicObject): string {
    const fullName = symbol.declaredPlace.text; // `${stringifyScopeSuffix(symbol.declaredScope)}${symbol.declaredPlace.text}`;
    if (symbol.symbolKind === SymbolKind.Type) {
        return fullName;
    } else if (symbol.symbolKind === SymbolKind.Function) {
        const head = symbol.returnType === undefined ? '' : stringifyDeducedType(symbol.returnType) + ' ';
        return `${head}${fullName}(${stringifyDeducedTypes(symbol.parameterTypes)})`;
    } else if (symbol.symbolKind === SymbolKind.Variable) {
        return `${fullName}: ${stringifyDeducedType(symbol.type)}`;
    }

    assert(false);
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

export function hintsCompletionScope(parentScope: SymbolScope | undefined, targetScope: SymbolScope, nodeRange: ParsedRange) {
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
    namespaceList: ParsingToken[];
}

export type ComplementHints = ComplementScope | ComplementType | CompletionNamespace;

function createBuiltinType(virtualToken: ParsingToken, name: PrimitiveType): SymbolicType {
    return {
        symbolKind: SymbolKind.Type,
        declaredPlace: virtualToken,
        declaredScope: createSymbolScope(undefined, undefined, ''),
        sourceType: name,
        membersScope: undefined,
    } as const;
}

const builtinNumberTypeMap: Map<string, SymbolicType> = (() => {
    const map = new Map<string, SymbolicType>();
    for (const name of numberTypeSet) {
        map.set(name, createBuiltinType(createVirtualToken(TokenKind.Reserved, name), PrimitiveType.Number));
    }
    return map;
})();

export const builtinStringType: SymbolicType = createBuiltinType(createVirtualToken(TokenKind.String, 'string'), PrimitiveType.String);

export const builtinIntType = builtinNumberTypeMap.get('int')!;

export const builtinFloatType = builtinNumberTypeMap.get('float')!;

export const builtinDoubleType = builtinNumberTypeMap.get('double')!;

function assignBuiltinNumberType(key: string): SymbolicType {
    const type = builtinNumberTypeMap.get(key);
    if (type !== undefined) return type;
    assert(false);
}

export const builtinBoolType: SymbolicType = createBuiltinType(createVirtualToken(TokenKind.Reserved, 'bool'), PrimitiveType.Bool);

export const builtinVoidType: SymbolicType = createBuiltinType(createVirtualToken(TokenKind.Reserved, 'void'), PrimitiveType.Void);

export const builtinAnyType: SymbolicType = createBuiltinType(createVirtualToken(TokenKind.Reserved, '?'), PrimitiveType.Any);

export const builtinAutoType: SymbolicType = createBuiltinType(createVirtualToken(TokenKind.Reserved, 'auto'), PrimitiveType.Auto);

export function tryGetBuiltInType(token: ParsingToken): SymbolicType | undefined {
    if (token.kind !== TokenKind.Reserved) return undefined;

    const identifier = token.text;
    if ((identifier === 'bool')) return builtinBoolType;
    else if ((identifier === 'void')) return builtinVoidType;
    else if (identifier === '?') return builtinAnyType;
    else if (identifier === 'auto') return builtinAutoType;
    else if (token.kind === TokenKind.Reserved && token.property.isNumber) return assignBuiltinNumberType(identifier);

    return undefined;
}

export const builtinThisToken = createVirtualToken(TokenKind.Identifier, 'this');

export const builtinSetterValueToken = createVirtualToken(TokenKind.Identifier, 'value');

export function findSymbolShallowly(scope: SymbolScope, identifier: string): SymbolicObject | undefined {
    return scope.symbolMap.get(identifier);
}

export function getSymbolAndScopeIfExist(symbol: SymbolicObject | undefined, scope: SymbolScope): SymbolAndScope | undefined {
    if (symbol === undefined) return undefined;
    return {symbol: symbol, scope: scope};
}

export function findSymbolWithParent(scope: SymbolScope, identifier: string): SymbolAndScope | undefined {
    const symbol = scope.symbolMap.get(identifier);
    if (symbol !== undefined) return {symbol: symbol, scope: scope};
    if (scope.parentScope === undefined) return undefined;
    return findSymbolWithParent(scope.parentScope, identifier);
}

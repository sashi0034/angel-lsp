import {
    AccessModifier,
    NodeClass,
    NodeEnum,
    NodeFunc,
    NodeFuncDef,
    NodeIf,
    NodeInterface,
    NodeIntfMethod,
    NodeLambda,
    NodeName,
    NodeVirtualProp
} from "./nodes";
import {ParsedToken} from "./parsedToken";
import {ComplementHints} from "./symbolComplement";
import {TemplateTranslation} from "./symbolUtils";

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

/**
 * The node that serves as the origin of a symbol's declaration.
 * Types without a declaration node, such as built-in types, are represented using PrimitiveType.
 */
export type SourceType = NodeEnum | NodeClass | NodeInterface | PrimitiveType;

/**
 * Checks whether the given `SourceType` is a `PrimitiveType`.
 * In other words, returns `true` if the given `SourceType` does not have a declaration node.
 */
export function isSourcePrimitiveType(type: SourceType | undefined): type is PrimitiveType {
    return typeof type === 'string';
}

export function isSourceNodeClassOrInterface(type: SourceType): type is NodeClass {
    if (isSourcePrimitiveType(type)) return false;
    return type.nodeName === NodeName.Class || type.nodeName === NodeName.Interface;
}

/**
 * The base interface for all symbols.
 */
export interface SymbolBase {
    symbolKind: SymbolKind;
    declaredPlace: ParsedToken;
    declaredScope: SymbolScope;
}

export interface SymbolType extends SymbolBase {
    symbolKind: SymbolKind.Type;
    sourceType: SourceType;
    templateTypes?: ParsedToken[];
    baseList?: (DeducedType | undefined)[];
    isHandler?: boolean,
    membersScope: SymbolScope | undefined;
}

export interface SymbolFunction extends SymbolBase {
    symbolKind: SymbolKind.Function;
    sourceNode: NodeFunc | NodeFuncDef | NodeIntfMethod;
    returnType: DeducedType | undefined;
    parameterTypes: (DeducedType | undefined)[];
    nextOverload: SymbolFunction | undefined;
    isInstanceMember: boolean;
    accessRestriction: AccessModifier | undefined;
}

export interface SymbolVariable extends SymbolBase {
    symbolKind: SymbolKind.Variable;
    type: DeducedType | undefined;
    isInstanceMember: boolean;
    accessRestriction: AccessModifier | undefined;
}

export function isSymbolInstanceMember(symbol: SymbolicObject): symbol is SymbolFunction | SymbolVariable {
    const canBeMember = symbol.symbolKind === SymbolKind.Function || symbol.symbolKind === SymbolKind.Variable;
    if (canBeMember === false) return false;
    return canBeMember && symbol.isInstanceMember;
}

export type SymbolicObject = SymbolType | SymbolFunction | SymbolVariable;

// (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)

/**
 * Nodes that can have a scope containing symbols.
 */
export type SymbolOwnerNode =
    NodeEnum
    | NodeClass
    | NodeVirtualProp
    | NodeInterface
    | NodeFunc
    | NodeIf
    | NodeLambda;

/**
 * Information about a symbol that references a symbol declared elsewhere.
 */
export interface ReferencedSymbolInfo {
    declaredSymbol: SymbolicObject;
    referencedToken: ParsedToken;
}

export type ScopeMap = Map<string, SymbolScope>;

export type SymbolMap = Map<string, SymbolicObject>;

/**
 * Information about the birth of a scope.
 */
export interface ScopeBirthInfo {
    ownerNode: SymbolOwnerNode | undefined;
    parentScope: SymbolScope | undefined;
    key: string;
}

/**
 * Information about the child scopes and symbols contained in a scope.
 */
export interface ScopeContainInfo {
    childScopes: ScopeMap;
    symbolMap: SymbolMap;
}

/**
 * Information about the services provided by a scope.
 */
export interface ScopeServiceInfo {
    referencedList: ReferencedSymbolInfo[];
    completionHints: ComplementHints[];
}

/**
 * Interface representing a symbol scope.
 */
export interface SymbolScope extends ScopeBirthInfo, ScopeContainInfo, ScopeServiceInfo {
}

export interface SymbolAndScope {
    symbol: SymbolicObject;
    scope: SymbolScope;
}

/**
 * The type of symbol that has been resolved by deduction.
 */
export interface DeducedType {
    symbolType: SymbolType | SymbolFunction;
    sourceScope: SymbolScope | undefined;
    isHandler?: boolean;
    templateTranslate?: TemplateTranslation;
}

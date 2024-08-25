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
    declaredPlace: ParsedToken;
    declaredScope: SymbolScope;
}

export interface SymbolicType extends SymbolicBase {
    symbolKind: SymbolKind.Type;
    sourceType: SourceType;
    templateTypes?: ParsedToken[];
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
    const canBeMember = symbol.symbolKind === SymbolKind.Function || symbol.symbolKind === SymbolKind.Variable;
    if (canBeMember === false) return false;
    return canBeMember && symbol.isInstanceMember;
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
    referencedToken: ParsedToken;
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

export interface DeducedType {
    symbolType: SymbolicType | SymbolicFunction;
    sourceScope: SymbolScope | undefined;
    isHandler?: boolean;
    templateTranslate?: TemplateTranslation;
}

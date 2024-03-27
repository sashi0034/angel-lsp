import {LocationInfo, TokenKind} from "./token";
import {
    NodeClass,
    NodeEnum,
    NodeFunc,
    NodeFuncDef,
    NodeNamespace,
    NodeParamList,
    ParsedRange,
    NodeType,
    NodeName
} from "./nodes";
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

export interface SymbolicBase {
    symbolKind: SymbolKind;
    declaredPlace: ParsingToken;
}

export interface SymbolicType extends SymbolicBase {
    symbolKind: SymbolKind.Type;
    sourceNode: NodeEnum | NodeClass | PrimitiveType;
}

export interface SymbolicFunction extends SymbolicBase {
    symbolKind: SymbolKind.Function;
    sourceNode: NodeFunc;
    overloadedAlt: SymbolicFunction | undefined;
}

export interface SymbolicVariable extends SymbolicBase {
    symbolKind: SymbolKind.Variable;
    type: SymbolicType | undefined;
}

export type SymbolicObject = SymbolicType | SymbolicFunction | SymbolicVariable;

type SymbolOwnerNode = NodeEnum | NodeClass | NodeFunc;

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
        if (cursor.overloadedAlt === undefined) {
            cursor.overloadedAlt = symbol;
            return true;
        }
        cursor = cursor.overloadedAlt;
    }
}

export function createSymbolScope(ownerNode: SymbolOwnerNode | undefined, parentScope: SymbolScope | undefined): SymbolScope {
    return {
        ownerNode: ownerNode,
        parentScope: parentScope,
        childScopes: new Map(),
        symbolMap: new Map(),
        referencedList: [],
        completionHints: [],
    };
}

export function createSymbolScopeAndInsert(
    ownerNode: SymbolOwnerNode | undefined,
    parentScope: SymbolScope | undefined,
    identifier: string,
): SymbolScope {
    const scope = createSymbolScope(ownerNode, parentScope);
    parentScope?.childScopes.set(identifier, scope);
    return scope;
}

export class AnalyzedScope {
    public readonly path: string;
    public readonly fullScope: SymbolScope; // 他モジュールのシンボルも含む

    private pureBuffer: SymbolScope | undefined; // 自身のモジュールのみ含む

    public constructor(path: string, full: SymbolScope) {
        this.path = path;
        this.fullScope = full;
    }

    public get pureScope(): SymbolScope {
        if (this.pureBuffer === undefined) {
            this.pureBuffer = createSymbolScope(this.fullScope.ownerNode, this.fullScope.parentScope);
            copyOriginalSymbolsInScope(this.path, this.fullScope, this.pureBuffer);
        }
        return this.pureBuffer;
    }
}

function copyOriginalSymbolsInScope(srcPath: string | undefined, srcScope: SymbolScope, destScope: SymbolScope) {
    if (srcPath === undefined) {
        // 対象元から対象先のスコープへ全シンボルをコピー
        for (const [key, symbol] of srcScope.symbolMap) {
            destScope.symbolMap.set(key, symbol);
        }
    } else {
        // 宣言ファイルが同じシンボルを収集
        for (const [key, symbol] of srcScope.symbolMap) {
            if (symbol.declaredPlace.location.path === srcPath) {
                destScope.symbolMap.set(key, symbol);
            }
        }
    }

    // 子スコープも再帰的にコピー
    for (const [key, child] of srcScope.childScopes) {
        const destChild = findScopeShallowlyOrCreate(child.ownerNode, destScope, key);
        copyOriginalSymbolsInScope(srcPath, child, destChild);
    }
}

export function copySymbolsInScope(srcScope: SymbolScope, destScope: SymbolScope) {
    // 対象元から対象先のスコープへ全シンボルをコピー
    copyOriginalSymbolsInScope(undefined, srcScope, destScope);
}

export interface DeducedType {
    symbol: SymbolicType;
}

export interface ComplementBase {
    complementKind: NodeName.Type | NodeName.Namespace;
    complementRange: Range;
}

export interface ComplementType extends ComplementBase {
    complementKind: NodeName.Type;
    targetType: SymbolicType;
}

export interface CompletionNamespace extends ComplementBase {
    complementKind: NodeName.Namespace;
    namespaceList: ParsingToken[];
}

export type ComplementHints = ComplementType | CompletionNamespace;

function createBuiltinType(name: PrimitiveType): SymbolicType {
    return {
        symbolKind: SymbolKind.Type,
        declaredPlace: dummyToken,
        sourceNode: name,
    } as const;
}

export const builtinNumberType: SymbolicType = createBuiltinType(PrimitiveType.Number);

export const builtinBoolType: SymbolicType = createBuiltinType(PrimitiveType.Bool);

export const builtinVoidType: SymbolicType = createBuiltinType(PrimitiveType.Void);

export function findSymbolicTypeWithParent(scope: SymbolScope, token: ParsingToken): SymbolicType | undefined {
    const tokenText = token.text;
    if (token.kind === TokenKind.Reserved) {
        if ((tokenText === 'bool')) return builtinBoolType;
        else if ((tokenText === 'void')) return builtinVoidType;
        else if (numberTypeSet.has(tokenText)) return builtinNumberType;
    }
    return findSymbolWithParent(scope, tokenText, SymbolKind.Type) as SymbolicType;
}

const numberTypeSet = new Set(['int8', 'int16', 'int', 'int32', 'int64', 'uint8', 'uint16', 'uint', 'uint32', 'uint64', 'float', 'double']);

export function findSymbolicFunctionWithParent(scope: SymbolScope, identifier: string): SymbolicFunction | undefined {
    return findSymbolWithParent(scope, identifier, SymbolKind.Function) as SymbolicFunction;
}

export function findSymbolicVariableWithParent(scope: SymbolScope, identifier: string): SymbolicVariable | undefined {
    return findSymbolWithParent(scope, identifier, SymbolKind.Variable) as SymbolicVariable;
}

function findSymbolWithParent(scope: SymbolScope, identifier: string, kind: SymbolKind): SymbolicObject | undefined {
    const symbol = scope.symbolMap.get(identifier);
    if (symbol !== undefined && symbol.symbolKind === kind) return symbol;
    if (scope.parentScope === undefined) return undefined;
    return findSymbolWithParent(scope.parentScope, identifier, kind);
}

export function findScopeWithParent(scope: SymbolScope, identifier: string): SymbolScope | undefined {
    const child = scope.childScopes.get(identifier);
    if (child !== undefined) return child;
    if (scope.parentScope === undefined) return undefined;
    return findScopeWithParent(scope.parentScope, identifier);
}

export function findScopeShallowly(scope: SymbolScope, identifier: string): SymbolScope | undefined {
    return scope.childScopes.get(identifier);
}

export function findScopeShallowlyOrCreate(
    ownerNode: SymbolOwnerNode | undefined,
    scope: SymbolScope,
    identifier: string
): SymbolScope {
    const found = scope.childScopes.get(identifier);
    if (found === undefined) return createSymbolScopeAndInsert(ownerNode, scope, identifier);
    if (ownerNode === undefined) return found;
    if (found.ownerNode === undefined) found.ownerNode = ownerNode;
    else if (found.ownerNode !== ownerNode) {
        diagnostic.addError(ownerNode.identifier.location, `Symbol ${identifier}' is already defined ❌`);
    }
    return found;
}

export function findGlobalScope(scope: SymbolScope): SymbolScope {
    if (scope.parentScope === undefined) return scope;
    return findGlobalScope(scope.parentScope);
}

export function collectParentScopes(scope: SymbolScope): SymbolScope[] {
    const result: SymbolScope[] = [];
    let current = scope;
    while (current.parentScope !== undefined) {
        result.push(current.parentScope);
        current = current.parentScope;
    }
    return result;
}

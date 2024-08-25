import {
    DeducedType,
    PrimitiveType,
    SymbolAndScope,
    SymbolicFunction,
    SymbolicObject,
    SymbolKind,
    SymbolMap,
    SymbolScope
} from "./symbolic";
import {diagnostic} from "../code/diagnostic";
import {ParsedToken} from "./parsedToken";
import {isAnonymousIdentifier} from "./scope";
import assert = require("node:assert");

/**
 * Returns the path to a file where the scope is defined.
 * It returns undefined if the scope is namespace or etc.
 */
export function getPathOfScope(scope: SymbolScope): string | undefined {
    if (scope.ownerNode === undefined) return undefined;
    return scope.ownerNode.nodeRange.start.location.path;
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

export function insertSymbolicObject(map: SymbolMap, symbol: SymbolicObject): boolean {
    const result = tryInsertSymbolicObject(map, symbol);
    if (result !== undefined) {
        diagnostic.addError(symbol.declaredPlace.location, `Symbol '${symbol.declaredPlace.text}' is already defined 💢`);
    }
    return result === undefined;
}

export type TemplateTranslation = Map<ParsedToken, DeducedType | undefined>;

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

/**
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
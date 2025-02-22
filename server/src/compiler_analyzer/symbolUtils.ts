import {
    SymbolFunction,
    SymbolObject,
    SymbolType,
    SymbolVariable
} from "./symbolObject";
import {diagnostic} from "../code/diagnostic";
import {ParserToken} from "../compiler_parser/parserToken";
import {isAnonymousIdentifier, SymbolAndScope, SymbolMap, SymbolScope} from "./symbolScope";
import assert = require("node:assert");
import {ResolvedType} from "./resolvedType";
import {analyzerDiagnostic} from "./analyzerDiagnostic";

/**
 * Returns the path to a file where the scope is defined.
 * It returns undefined if the scope is namespace or etc.
 */
export function getPathOfScope(scope: SymbolScope): string | undefined {
    if (scope.linkedNode === undefined) return undefined;
    return scope.linkedNode.nodeRange.start.location.path;
}

/**
 * Insert a symbol into the symbol map.
 * If the insertion succeeds, return undefined.
 * If it fails, return the existing symbol corresponding to the key.
 * @param map The map to insert the symbol
 * @param symbol The symbol for insertion
 */
export function tryInsertSymbolObject(map: SymbolMap, symbol: SymbolObject): SymbolObject | undefined {
    const identifier = symbol.declaredPlace.text;
    const hit = map.get(identifier);
    if (hit === undefined) {
        map.set(identifier, symbol);
        return undefined;
    }

    const canOverload = symbol instanceof SymbolFunction && hit instanceof SymbolFunction;
    if (canOverload === false) return hit;

    // Functions can be added as overloads
    let cursor: SymbolFunction = hit;
    for (; ;) {
        if (cursor.nextOverload === undefined) {
            cursor.setNextOverload(symbol);
            return undefined;
        }
        cursor = cursor.nextOverload;
    }
}

export function insertSymbolObject(map: SymbolMap, symbol: SymbolObject): boolean {
    const result = tryInsertSymbolObject(map, symbol);
    if (result !== undefined) {
        analyzerDiagnostic.add(
            symbol.declaredPlace.location,
            `Symbol '${symbol.declaredPlace.text}' is already defined.`);
    }
    return result === undefined;
}

export type TemplateTranslation = Map<ParserToken, ResolvedType | undefined>;

export function resolveTemplateType(
    templateTranslate: TemplateTranslation | undefined, type: ResolvedType | undefined
): ResolvedType | undefined {
    if (templateTranslate === undefined) return type;

    if (type === undefined) return undefined;

    if (type.symbolType instanceof SymbolFunction) return undefined; // FIXME: 関数ハンドラのテンプレート解決も必要?

    if (type.symbolType.isTypeParameter !== true) return type;

    if (templateTranslate.has(type.symbolType.declaredPlace)) {
        return templateTranslate.get(type.symbolType.declaredPlace);
    }

    return type;
}

export function resolveTemplateTypes(
    templateTranslate: (TemplateTranslation | undefined)[], type: ResolvedType | undefined
): ResolvedType | undefined {
    return templateTranslate
        .reduce((arg, t) => t !== undefined ? resolveTemplateType(t, arg) : arg, type);
}

export function isResolvedAutoType(type: ResolvedType | undefined): boolean {
    return type !== undefined && type.symbolType instanceof SymbolType && type.symbolType.identifierText === 'auto';
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

export function stringifyResolvedType(type: ResolvedType | undefined,): string {
    if (type === undefined) return '(undefined)';

    let suffix = '';
    if (type.isHandler === true) suffix = `${suffix}@`;

    if (type.symbolType instanceof SymbolFunction) {
        const func: SymbolFunction = type.symbolType;
        const returnType = func.returnType;
        const params = func.parameterTypes.map(t => stringifyResolvedType(t)).join(', ');
        return `${stringifyResolvedType(returnType)}(${params})` + suffix;
    }

    // if (hasScopeSuffix) suffix = stringifyScopeSuffix(type.sourceScope) + suffix;

    if (type.templateTranslate !== undefined) {
        suffix = `<${Array.from(type.templateTranslate.values()).map(t => stringifyResolvedType(t)).join(', ')}>${suffix}`;
    }

    return type.symbolType.declaredPlace.text + suffix;
}

export function stringifyResolvedTypes(types: (ResolvedType | undefined)[]): string {
    return types.map(t => stringifyResolvedType(t)).join(', ');
}

/**
 * Build a string representation of a symbol object.
 */
export function stringifySymbolObject(symbol: SymbolObject): string {
    const fullName = symbol.declaredPlace.text; // `${stringifyScopeSuffix(symbol.declaredScope)}${symbol.declaredPlace.text}`;
    if (symbol instanceof SymbolType) {
        return fullName;
    } else if (symbol instanceof SymbolFunction) {
        const head = symbol.returnType === undefined ? '' : stringifyResolvedType(symbol.returnType) + ' ';
        return `${head}${fullName}(${stringifyResolvedTypes(symbol.parameterTypes)})`;
    } else if (symbol instanceof SymbolVariable) {
        return `${stringifyResolvedType(symbol.type)} ${fullName}`;
    }

    assert(false);
}

export function findSymbolShallowly(scope: SymbolScope, identifier: string): SymbolObject | undefined {
    return scope.symbolMap.get(identifier);
}

export function getSymbolAndScopeIfExist(symbol: SymbolObject | undefined, scope: SymbolScope): SymbolAndScope | undefined {
    if (symbol === undefined) return undefined;
    return {symbol: symbol, scope: scope};
}

export function findSymbolWithParent(scope: SymbolScope, identifier: string): SymbolAndScope | undefined {
    const symbol = scope.symbolMap.get(identifier);
    if (symbol !== undefined) return {symbol: symbol, scope: scope};
    if (scope.parentScope === undefined) return undefined;
    return findSymbolWithParent(scope.parentScope, identifier);
}
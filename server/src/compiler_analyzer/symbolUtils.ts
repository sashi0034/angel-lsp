import {
    SymbolFunction,
    SymbolObject, SymbolObjectHolder,
    SymbolType,
    SymbolVariable
} from "./symbolObject";
import {diagnostic} from "../code/diagnostic";
import {isAnonymousIdentifier, SymbolAndScope, SymbolTable, SymbolScope} from "./symbolScope";
import assert = require("node:assert");
import {ResolvedType} from "./resolvedType";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {TokenObject} from "../compiler_tokenizer/tokenObject";

/**
 * Returns the path to a file where the scope is defined.
 * It returns undefined if the scope is namespace or etc.
 */
export function getPathOfScope(scope: SymbolScope): string | undefined {
    if (scope.linkedNode === undefined) return undefined;
    return scope.linkedNode.nodeRange.start.location.path;
}

export type TemplateTranslation = Map<TokenObject, ResolvedType | undefined>;

export function resolveTemplateType(
    templateTranslate: TemplateTranslation | undefined, type: ResolvedType | undefined
): ResolvedType | undefined {
    if (templateTranslate === undefined) return type;

    if (type === undefined) return undefined;

    if (type.symbolType.isFunction()) return undefined; // FIXME: 関数ハンドラのテンプレート解決も必要?

    if (type.symbolType.isTypeParameter !== true) return type;

    if (templateTranslate.has(type.symbolType.defToken)) {
        return templateTranslate.get(type.symbolType.defToken);
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

    if (type.symbolType.isFunction()) {
        const func: SymbolFunction = type.symbolType;
        const returnType = func.returnType;
        const params = func.parameterTypes.map(t => stringifyResolvedType(t)).join(', ');
        return `${stringifyResolvedType(returnType)}(${params})` + suffix;
    }

    // if (hasScopeSuffix) suffix = stringifyScopeSuffix(type.sourceScope) + suffix;

    if (type.templateTranslate !== undefined) {
        suffix = `<${Array.from(type.templateTranslate.values()).map(t => stringifyResolvedType(t)).join(', ')}>${suffix}`;
    }

    return type.symbolType.identifierText + suffix;
}

export function stringifyResolvedTypes(types: (ResolvedType | undefined)[]): string {
    return types.map(t => stringifyResolvedType(t)).join(', ');
}

/**
 * Build a string representation of a symbol object.
 */
export function stringifySymbolObject(symbol: SymbolObject): string {
    const fullName = symbol.defToken.text; // `${stringifyScopeSuffix(symbol.defScope)}${symbol.defToken.text}`;
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

// obsolete
export function findSymbolShallowly(scope: SymbolScope, identifier: string): SymbolObjectHolder | undefined {
    return scope.symbolTable.get(identifier);
}

// obsolete
export function getSymbolAndScopeIfExist(symbol: SymbolObjectHolder | undefined, scope: SymbolScope): SymbolAndScope | undefined {
    if (symbol === undefined) return undefined;
    return {symbol: symbol, scope: scope};
}

// obsolete
export function findSymbolWithParent(scope: SymbolScope, identifier: string): SymbolAndScope | undefined {
    const symbol = scope.symbolTable.get(identifier);
    if (symbol !== undefined) return {symbol: symbol, scope: scope};
    if (scope.parentScope === undefined) return undefined;
    return findSymbolWithParent(scope.parentScope, identifier);
}
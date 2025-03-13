import {SymbolFunction, SymbolObject, SymbolObjectHolder, SymbolType, SymbolVariable} from "./symbolObject";
import {
    isAnonymousIdentifier,
    isScopeChildOrGrandchild,
    resolveActiveScope,
    SymbolAndScope,
    SymbolScope
} from "./symbolScope";
import {ResolvedType} from "./resolvedType";
import {AccessModifier, NodeName} from "../compiler_parser/nodes";
import {canDownCast} from "./typeConversion";
import assert = require("node:assert");

export function isResolvedAutoType(type: ResolvedType | undefined): boolean {
    return type !== undefined && type.typeOrFunc instanceof SymbolType && type.typeOrFunc.identifierText === 'auto';
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

    if (type.typeOrFunc.isFunction()) {
        const func: SymbolFunction = type.typeOrFunc;
        const returnType = func.returnType;
        const params = func.parameterTypes.map(t => stringifyResolvedType(t)).join(', ');
        return `${stringifyResolvedType(returnType)}(${params})` + suffix;
    }

    // if (hasScopeSuffix) suffix = stringifyScopeSuffix(type.sourceScope) + suffix;

    if (type.templateTranslator !== undefined) {
        // FIXME: Maybe this should be consider the order of the template arguments.
        suffix = `<${Array.from(type.templateTranslator.values()).map(t => stringifyResolvedType(t)).join(', ')}>${suffix}`;
    }

    return type.typeOrFunc.identifierText + suffix;
}

export function stringifyResolvedTypes(types: (ResolvedType | undefined)[]): string {
    return types.map(t => stringifyResolvedType(t)).join(', ');
}

/**
 * Build a string representation of a symbol object.
 */
export function stringifySymbolObject(symbol: SymbolObject): string {
    const fullName = symbol.identifierToken.text; // `${stringifyScopeSuffix(symbol.scopePath)}${symbol.identifierToken.text}`;
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

/**
 * Check if the accessing scope is allowed to access the instance member.
 * @param accessingScope
 * @param instanceMember
 */
export function isAllowedToAccessInstanceMember(accessingScope: SymbolScope, instanceMember: SymbolObjectHolder): boolean {
    const instanceMemberSymbol = instanceMember.toList()[0]; // FIXME: What if there are multiple functions?

    if (instanceMemberSymbol instanceof SymbolType) return true;

    if (instanceMemberSymbol.accessRestriction === undefined) return true;

    const instanceMemberScope = resolveActiveScope(instanceMemberSymbol.scopePath);

    if (instanceMemberSymbol.accessRestriction === AccessModifier.Private) {
        return isScopeChildOrGrandchild(accessingScope, instanceMemberScope);
    } else if (instanceMemberSymbol.accessRestriction === AccessModifier.Protected) {
        if (instanceMemberScope.linkedNode === undefined) return false;

        const nearestClassScope = accessingScope.takeParentByNode([NodeName.Class, NodeName.Interface]);
        if (nearestClassScope === undefined || nearestClassScope.parentScope === undefined) return false;

        // Get the symbol of the class to which the accessing scope belongs.
        const nearestClassSymbol = nearestClassScope.parentScope.lookupSymbol(nearestClassScope.key);
        if (nearestClassSymbol === undefined || nearestClassSymbol.isType() === false) return false;

        // Get the symbol of the class to which the instance member belongs.
        if (instanceMemberScope.parentScope === undefined) return false;
        const instanceClassSymbol = instanceMemberScope.parentScope.lookupSymbol(instanceMemberScope.key);
        if (instanceClassSymbol === undefined || instanceClassSymbol.isType() === false) return false;

        return (canDownCast(nearestClassSymbol, instanceClassSymbol));
    } else {
        assert(false);
    }
}
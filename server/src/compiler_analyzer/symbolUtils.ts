import {
    SymbolFunction,
    SymbolFunctionHolder,
    SymbolObject,
    SymbolObjectHolder,
    SymbolType,
    SymbolVariable
} from "./symbolObject";
import {
    isAnonymousIdentifier,
    isScopeChildOrGrandchild,
    resolveActiveScope,
    SymbolAndScope, SymbolGlobalScope,
    SymbolScope
} from "./symbolScope";
import {ResolvedType} from "./resolvedType";
import {AccessModifier, NodeName} from "../compiler_parser/nodes";
import {canDownCast} from "./typeConversion";
import assert = require("node:assert");

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

export function stringifyResolvedType(type: ResolvedType | undefined): string {
    if (type === undefined) return '(undefined)';

    let suffix = '';
    if (type.isHandler === true) suffix = `${suffix}@`;

    if (type.typeOrFunc.isFunction()) {
        const func: SymbolFunction = type.typeOrFunc;
        const returnType = func.returnType;
        const paramsText = func.parameterTypes.map(t => stringifyResolvedType(t)).join(', ');
        return `${stringifyResolvedType(returnType)}(${paramsText})` + suffix;
    }

    const templateTypes = type.typeOrFunc.templateTypes;
    if (templateTypes !== undefined) {
        const templateTypesText = templateTypes
            .map(t => stringifyResolvedType(type.templateTranslator?.get(t)) ?? t.text)
            .join(', ');
        suffix = `<${templateTypesText}>${suffix}`;
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
    if (symbol.isType()) {
        return fullName;
    } else if (symbol.isFunction()) {
        const head = symbol.returnType === undefined ? '' : stringifyResolvedType(symbol.returnType) + ' ';
        return `${head}${fullName}(${stringifyResolvedTypes(symbol.parameterTypes)})`;
    } else if (symbol.isVariable()) {
        return `${stringifyResolvedType(symbol.type)} ${fullName}`;
    }

    assert(false);
}

// TODO: This should be a member variable
export function getFullIdentifierOfSymbol(symbol: SymbolObject): string {
    return [...symbol.scopePath, symbol.identifierToken.text].join('.');
}

export function printSymbolScope(scope: SymbolScope, indent: string = ''): string {
    let result = '';

    if (scope.isGlobalScope()) {
        result += `${indent}${scope.getContext().filepath}\n`;
    }

    const elements: string[] = [];

    const head = '├── ';
    const last = '└── ';

    for (const [key, symbolHolder] of scope.symbolTable) {
        for (const symbol of symbolHolder.toList()) {
            elements.push(`${indent}${head}${key} (${symbol.identifierToken.location.simpleFormat()})`);
        }
    }

    for (const [key, childScope] of scope.childScopeTable) {
        const locations: string[] = [];
        if (childScope.linkedNode !== undefined) {
            locations.push(childScope.linkedNode.nodeRange.getBoundingLocation().simpleFormat());
        }

        for (const node of childScope.namespaceNodes) {
            locations.push(node.linkedToken.location.simpleFormat());
        }

        let childPrint = printSymbolScope(childScope, indent + '│   ');
        if (childPrint.length > 0) childPrint = '\n' + childPrint;
        elements.push(`${indent}${head}${key}::(${locations.join(', ')})` + childPrint);
    }

    elements.sort();

    if (elements.length > 0) {
        // Replace '├── ' with '└── ' for the last element.
        elements[elements.length - 1] = elements[elements.length - 1].replace(head, last);
    }

    result += elements.join('\n');

    return result;
}

// -----------------------------------------------

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
 * @param accessScope
 * @param instanceMember
 */
export function canAccessInstanceMember(accessScope: SymbolScope, instanceMember: SymbolObjectHolder): boolean {
    const instanceMemberSymbol = instanceMember.toList()[0]; // FIXME: What if there are multiple functions?

    if (instanceMemberSymbol.isType()) return true;

    if (instanceMemberSymbol.accessRestriction === undefined) return true;

    const scopeOfInstanceMember = resolveActiveScope(instanceMemberSymbol.scopePath);

    const typeOfInstanceMember = scopeOfInstanceMember.parentScope?.lookupSymbol(scopeOfInstanceMember.key);

    let accessRestriction: AccessModifier | undefined = instanceMemberSymbol.accessRestriction;
    if (typeOfInstanceMember?.isType() && typeOfInstanceMember.isMixin) {
        if (accessRestriction === AccessModifier.Private) {
            // A mixin's private member is treated as protected.
            // FIXME?
            accessRestriction = AccessModifier.Protected;
        }
    }

    if (accessRestriction === AccessModifier.Private) {
        return isScopeChildOrGrandchild(accessScope, scopeOfInstanceMember);
    } else if (accessRestriction === AccessModifier.Protected) {
        if (scopeOfInstanceMember.linkedNode === undefined) return false;

        const nearestClassScope = accessScope.takeParentByNode([NodeName.Class, NodeName.Interface]);
        if (nearestClassScope === undefined || nearestClassScope.parentScope === undefined) return false;

        // Get the symbol of the class to which the accessing scope belongs.
        const nearestClassSymbol = nearestClassScope.parentScope.lookupSymbol(nearestClassScope.key);
        if (nearestClassSymbol === undefined || nearestClassSymbol.isType() === false) return false;

        // Get the symbol of the class to which the instance member belongs.
        if (scopeOfInstanceMember.parentScope === undefined) return false;
        const instanceClassSymbol = scopeOfInstanceMember.parentScope.lookupSymbol(scopeOfInstanceMember.key);
        if (instanceClassSymbol === undefined || instanceClassSymbol.isType() === false) return false;

        return (canDownCast(nearestClassSymbol, instanceClassSymbol));
    } else {
        assert(false);
    }
}
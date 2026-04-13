import {
    FunctionSymbol,
    FunctionSymbolHolder,
    SymbolObject,
    SymbolObjectHolder,
    TypeSymbol,
    VariableSymbol
} from './symbolObject';
import {
    isAnonymousIdentifier,
    isScopeChildOrGrandchild,
    resolveActiveScope,
    SymbolAndScope,
    SymbolGlobalScope,
    SymbolScope
} from './symbolScope';
import {ResolvedType} from './resolvedType';
import {
    AccessModifier,
    hasFuncReturnValue,
    InOutModifier,
    NodeName,
    Node_Type,
    ReferenceModifier
} from '../compiler_parser/nodes';
import {stringifyNodeType} from '../compiler_parser/nodesUtils';
import {canDownCast} from './typeConversion';
import assert = require('node:assert');

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
    if (type === undefined) {
        return '(undefined)';
    }

    let suffix = '';
    if (type.isHandle === true) {
        suffix = `${suffix}@`;
    }

    if (type.typeOrFunc.isFunction()) {
        const func: FunctionSymbol = type.typeOrFunc;
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

function stringifyResolvedTypeWithNode(type: ResolvedType | undefined, node: Node_Type | undefined): string {
    if (node === undefined) {
        return stringifyResolvedType(type);
    }

    if (type === undefined) {
        return stringifyNodeType(node);
    }

    let text = stringifyResolvedType(type);
    if (node.refModifier === ReferenceModifier.RefConst && text.endsWith('@')) {
        text = text.substring(0, text.length - 1) + '@const';
    }

    if (node.isConst) {
        text = 'const ' + text;
    }

    return text;
}

function stringifyInOutModifier(modifier: InOutModifier | undefined): string {
    if (modifier === InOutModifier.In) {
        return '&in';
    } else if (modifier === InOutModifier.Out) {
        return '&out';
    } else if (modifier === InOutModifier.InOut) {
        return '&inout';
    }

    return '';
}

function stringifyFunctionParameters(symbol: FunctionSymbol): string {
    const paramList = symbol.linkedNode.paramList;
    return symbol.parameterTypes
        .map((type, index) => {
            const param = paramList[index];
            const typeText = stringifyResolvedTypeWithNode(type, param?.type);
            const modifierText = stringifyInOutModifier(param?.modifier);
            const identifierText = param?.identifier === undefined ? '' : ` ${param.identifier.text}`;
            const variadicText = param?.isVariadic ? ' ...' : '';
            return `${typeText}${modifierText}${identifierText}${variadicText}`;
        })
        .join(', ');
}

function stringifyFunctionReturnType(symbol: FunctionSymbol): string {
    const linkedNode = symbol.linkedNode;
    if (linkedNode.nodeName === NodeName.FuncDef) {
        return stringifyResolvedTypeWithNode(symbol.returnType, linkedNode.returnType) + (linkedNode.isRef ? '&' : '');
    } else if (linkedNode.nodeName === NodeName.InterfaceMethod) {
        return stringifyResolvedTypeWithNode(symbol.returnType, linkedNode.returnType) + (linkedNode.isRef ? '&' : '');
    } else if (hasFuncReturnValue(linkedNode.head)) {
        return (
            stringifyResolvedTypeWithNode(symbol.returnType, linkedNode.head.returnType) +
            (linkedNode.head.isRef ? '&' : '')
        );
    }

    return symbol.returnType === undefined ? '' : stringifyResolvedType(symbol.returnType);
}

function stringifyFunctionConstSuffix(symbol: FunctionSymbol): string {
    const linkedNode = symbol.linkedNode;
    if (linkedNode.nodeName === NodeName.FuncDef) {
        return '';
    }

    return linkedNode.isConst ? ' const' : '';
}

/**
 * Build a string representation of a symbol object.
 */
export function stringifySymbolObject(symbol: SymbolObject): string {
    const fullName = symbol.identifierToken.text; // `${stringifyScopeSuffix(symbol.scopePath)}${symbol.identifierToken.text}`;
    if (symbol.isType()) {
        return fullName;
    } else if (symbol.isFunction()) {
        const head = symbol.returnType === undefined ? '' : stringifyFunctionReturnType(symbol) + ' ';
        return `${head}${fullName}(${stringifyFunctionParameters(symbol)})${stringifyFunctionConstSuffix(symbol)}`;
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
        if (childPrint.length > 0) {
            childPrint = '\n' + childPrint;
        }

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
export function getSymbolAndScopeIfExist(
    symbol: SymbolObjectHolder | undefined,
    scope: SymbolScope
): SymbolAndScope | undefined {
    if (symbol === undefined) {
        return undefined;
    }

    return {symbol: symbol, scope: scope};
}

// obsolete
export function findSymbolWithParent(scope: SymbolScope, identifier: string): SymbolAndScope | undefined {
    const symbol = scope.symbolTable.get(identifier);
    if (symbol !== undefined) {
        return {symbol: symbol, scope: scope};
    }

    if (scope.parentScope === undefined) {
        return undefined;
    }

    return findSymbolWithParent(scope.parentScope, identifier);
}

/**
 * Check if the accessing scope is allowed to access the instance member.
 * @param accessScope
 * @param instanceMember
 */
export function canAccessInstanceMember(accessScope: SymbolScope, instanceMember: SymbolObjectHolder): boolean {
    const instanceMemberSymbol = instanceMember.toList()[0]; // FIXME: What if there are multiple functions?

    if (instanceMemberSymbol.isType()) {
        return true;
    }

    if (instanceMemberSymbol.accessRestriction === undefined) {
        return true;
    }

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
        if (scopeOfInstanceMember.linkedNode === undefined) {
            return false;
        }

        const nearestClassScope = accessScope.takeParentByNode([NodeName.Class, NodeName.Interface]);
        if (nearestClassScope === undefined || nearestClassScope.parentScope === undefined) {
            return false;
        }

        // Get the class symbol that owns the accessing scope.
        const nearestClassSymbol = nearestClassScope.parentScope.lookupSymbol(nearestClassScope.key);
        if (nearestClassSymbol === undefined || nearestClassSymbol.isType() === false) {
            return false;
        }

        // Get the class symbol that owns the instance member.
        if (scopeOfInstanceMember.parentScope === undefined) {
            return false;
        }

        const instanceClassSymbol = scopeOfInstanceMember.parentScope.lookupSymbol(scopeOfInstanceMember.key);
        if (instanceClassSymbol === undefined || instanceClassSymbol.isType() === false) {
            return false;
        }

        return canDownCast(nearestClassSymbol, instanceClassSymbol);
    } else {
        assert(false);
    }
}

import {FunctionSymbol, SymbolObject, TypeSymbol} from './symbolObject';
import {ResolvedType} from './resolvedType';
import {InOutModifierToken, NodeName, Node_Type, Node_Func, Node_ParamList, Node_Scope} from '../compiler_parser/nodes';
import {stringifyTypeNode} from '../compiler_parser/nodeUtils';
import assert = require('node:assert');

export function stringifyResolvedType(type: ResolvedType | undefined): string {
    if (type === undefined) {
        return '(unresolved)';
    }

    if (type.lambdaInfo !== undefined) {
        return '(lambda)';
    }

    let suffix = '';
    if (type.isHandle === true) {
        suffix = `${suffix}@`;
    }

    if (type.typeOrFunc.isFunction()) {
        const func: FunctionSymbol = type.typeOrFunc;
        if (func.linkedNode.nodeName === NodeName.FuncDef) {
            return func.identifierText + suffix;
        }

        const returnType = func.returnType;
        const paramsText = func.parameterTypes.map(t => stringifyResolvedType(t)).join(', ');
        return `${stringifyResolvedType(returnType)}(${paramsText})` + suffix;
    }

    const templateParameters = type.typeOrFunc.templateParameters;
    if (templateParameters !== undefined) {
        const templateArgumentsText = type
            .getTemplateArguments()
            .map(
                (templateArgument, i) =>
                    stringifyResolvedType(templateArgument) ?? templateParameters[i].identifierToken.text
            )
            .join(', ');
        suffix = `<${templateArgumentsText}>${suffix}`;
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
        return stringifyTypeNode(node);
    }

    let text = stringifyResolvedType(type);
    if (node.handle?.constToken !== undefined && text.endsWith('@')) {
        text = text.substring(0, text.length - 1) + '@const';
    }

    if (node.constToken !== undefined) {
        text = 'const ' + text;
    }

    return text;
}

function stringifyInOutModifier(modifier: InOutModifierToken | undefined): string {
    return modifier === undefined ? '' : `&${modifier.text}`;
}

function stringifyFunctionParameters(symbol: FunctionSymbol): string {
    const paramList = symbol.linkedNode.paramList;
    return symbol.parameterTypes
        .map((type, index) => {
            const param = paramList[index];
            const typeText = stringifyResolvedTypeWithNode(type, param?.type);
            const modifierText = stringifyInOutModifier(param?.inOutToken);
            const identifierText = param?.identifier === undefined ? '' : ` ${param.identifier.text}`;
            const variadicText = param?.isVariadic ? ' ...' : '';
            return `${typeText}${modifierText}${identifierText}${variadicText}`;
        })
        .join(', ');
}

function stringifyFunctionReturnType(symbol: FunctionSymbol): string {
    const linkedNode = symbol.linkedNode;
    if (linkedNode.nodeName === NodeName.FuncDef) {
        return (
            stringifyResolvedTypeWithNode(symbol.returnType, linkedNode.returnType) +
            (linkedNode.refToken !== undefined ? '&' : '')
        );
    } else if (linkedNode.nodeName === NodeName.InterfaceMethod) {
        return (
            stringifyResolvedTypeWithNode(symbol.returnType, linkedNode.returnType) +
            (linkedNode.refToken !== undefined ? '&' : '')
        );
    } else if (linkedNode.head.tag === 'function') {
        return (
            stringifyResolvedTypeWithNode(symbol.returnType, linkedNode.head.returnType) +
            (linkedNode.head.refToken !== undefined ? '&' : '')
        );
    }

    return symbol.returnType === undefined ? '' : stringifyResolvedType(symbol.returnType);
}

function stringifyFunctionConstSuffix(symbol: FunctionSymbol): string {
    const linkedNode = symbol.linkedNode;
    if (linkedNode.nodeName === NodeName.FuncDef) {
        return '';
    }

    return linkedNode.postfixConstToken !== undefined ? ' const' : '';
}

function stringifyTemplateParameters(symbol: TypeSymbol | FunctionSymbol): string {
    if (symbol.templateParameters === undefined) {
        return '';
    }

    return `<${symbol.templateParameters.map(t => t.identifierToken.text).join(', ')}>`;
}

/**
 * Build a string representation of a symbol object.
 */
export function stringifySymbolObject(symbol: SymbolObject): string {
    const fullName = symbol.identifierToken.text; // `${stringifyScopeSuffix(symbol.scopePath)}${symbol.identifierToken.text}`;
    if (symbol.isType()) {
        return fullName + stringifyTemplateParameters(symbol);
    } else if (symbol.isFunction()) {
        const head = symbol.returnType === undefined ? '' : stringifyFunctionReturnType(symbol) + ' ';
        return `${head}${fullName}${stringifyTemplateParameters(symbol)}(${stringifyFunctionParameters(symbol)})${stringifyFunctionConstSuffix(
            symbol
        )}`;
    } else if (symbol.isVariable()) {
        return `${stringifyResolvedType(symbol.type)} ${fullName}`;
    }

    assert(false);
}

import {FunctionSymbol, SymbolObject, TypeSymbol} from './symbolObject';
import {EvaluatedValue, ResolvedType} from './resolvedType';
import {InOutModifierToken, NodeName, Node_Type} from '../compiler_parser/nodeObject';
import {stringifyTypeNode} from '../compiler_parser/nodeUtils';
import {HandleModifier} from './nodeHelper';
import assert = require('node:assert');

export function stringifyResolvedType(type: ResolvedType | undefined): string {
    if (type === undefined) {
        return '(unresolved)';
    }

    if (type.lambdaInfo !== undefined) {
        return '(lambda)';
    }

    if (type.typeOrFunc.isFunction()) {
        const func: FunctionSymbol = type.typeOrFunc;
        if (func.linkedNode.nodeName === NodeName.FuncDef) {
            return applyResolvedTypeModifiers(func.identifierText, type);
        }

        const returnType = func.returnType;
        const paramsText = func.parameterTypes.map(t => stringifyResolvedType(t)).join(', ');
        return applyResolvedTypeModifiers(`${stringifyResolvedType(returnType)}(${paramsText})`, type);
    }

    const templateParameters = type.typeOrFunc.templateParameters;
    let suffix = '';
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

    return applyResolvedTypeModifiers(type.typeOrFunc.identifierText + suffix, type);
}

function applyResolvedTypeModifiers(baseText: string, type: ResolvedType): string {
    let text = type.isConst ? `const ${baseText}` : baseText;

    if (type.handle === HandleModifier.ConstHandle) {
        text += '@const';
    } else if (type.handle === HandleModifier.Handle) {
        text += '@';
    }

    return text;
}

export function stringifyResolvedTypes(types: (ResolvedType | undefined)[]): string {
    return types.map(t => stringifyResolvedType(t)).join(', ');
}

function stringifyEvaluatedValue(value: EvaluatedValue, type: ResolvedType | undefined): string {
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }

    if (typeof value === 'string') {
        return JSON.stringify(value);
    }

    if (type?.isFloatingPoint()) {
        return Number.isInteger(value) ? `${value}.0` : value.toString();
    }

    return value.toString();
}

function stringifyResolvedTypeWithNode(type: ResolvedType | undefined, node: Node_Type | undefined): string {
    return type === undefined && node !== undefined ? stringifyTypeNode(node) : stringifyResolvedType(type);
}

function stringifyInOutModifier(modifier: InOutModifierToken | undefined): string {
    return modifier === undefined ? '' : `&${modifier.text}`;
}

function stringifyFunctionParameters(symbol: FunctionSymbol): string {
    const params = symbol.linkedNode.paramList.params;
    return symbol.parameterTypes
        .map((type, index) => {
            const param = params[index];
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
        const valueText =
            symbol.evaluatedValue === undefined
                ? ''
                : ` = ${stringifyEvaluatedValue(symbol.evaluatedValue, symbol.type)}`;
        return `${stringifyResolvedType(symbol.type)} ${fullName}${valueText}`;
    }

    assert(false);
}

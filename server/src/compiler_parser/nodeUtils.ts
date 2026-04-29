import {TokenObject} from '../compiler_tokenizer/tokenObject';
import {Node_Type} from './nodeObject';

export function stringifyTypeNode(type: Node_Type, separator: string = ', '): string {
    let str = type.constToken !== undefined ? 'const ' : '';
    str += type.dataType.identifier.text;
    if (type.typeArguments.length > 0) {
        str += '<' + type.typeArguments.map(t => stringifyTypeNode(t, separator)).join(separator) + '>';
    }

    for (const postfix of type.postfixList) {
        if (postfix.isArray) {
            str += '[]';
        } else if (postfix.handle !== undefined) {
            str += postfix.handle.constToken !== undefined ? '@const' : '@';
        }
    }

    return str;
}

export function getIdentifierInTypeNode(type: Node_Type): TokenObject {
    return type.dataType.identifier;
}

export function buildTemplateSignature(types: Node_Type[]): string {
    const typeNames = types.map(type => {
        const identifier = type.dataType.identifier.text;
        return type.typeArguments.length > 0 ? identifier + buildTemplateSignature(type.typeArguments) : identifier;
    });
    return '<' + typeNames.join(',') + '>';
}

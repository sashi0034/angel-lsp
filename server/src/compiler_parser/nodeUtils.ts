import {TokenObject} from '../compiler_tokenizer/tokenObject';
import {Node_Type} from './nodeObject';

export function stringifyTypeNode(type: Node_Type, separator: string = ', '): string {
    let str = type.constToken !== undefined ? 'const ' : '';
    str += type.dataType.identifier.text;
    if (type.typeTemplates.length > 0) {
        str += '<' + type.typeTemplates.map(t => stringifyTypeNode(t, separator)).join(separator) + '>';
    }

    if (type.isArray) {
        str += '[]';
    }

    if (type.handle !== undefined) {
        str += type.handle.constToken !== undefined ? '@const' : '@';
    }

    return str;
}

export function getIdentifierInTypeNode(type: Node_Type): TokenObject {
    return type.dataType.identifier;
}

export function buildTemplateSignature(types: Node_Type[]): string {
    const typeNames = types.map(type => {
        const identifier = type.dataType.identifier.text;
        return type.typeTemplates.length > 0 ? identifier + buildTemplateSignature(type.typeTemplates) : identifier;
    });
    return '<' + typeNames.join(',') + '>';
}

import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {EntityAttribute, NodeType, ReferenceModifier} from "./nodes";

export function isEntityModifierForClass(modifier: EntityAttribute) {
    return modifier.isAbstract || modifier.isFinal;
}

export function stringifyNodeType(type: NodeType): string {
    let str = type.isConst ? 'const ' : '';
    str += type.dataType.identifier.text;
    if (type.typeTemplates.length > 0) {
        str += '<' + type.typeTemplates.map(stringifyNodeType).join(', ') + '>';
    }

    if (type.isArray) {
        str += '[]';
    }

    if (type.refModifier !== undefined) {
        str += (type.refModifier === ReferenceModifier.AtConst ? '@const' : '@');
    }

    return str;
}

export function getIdentifierInNodeType(type: NodeType): TokenObject {
    return type.dataType.identifier;
}

export function buildTemplateSignature(types: NodeType[]): string {
    const typeNames = types.map(type => {
        const identifier = type.dataType.identifier.text;
        return type.typeTemplates.length > 0
            ? identifier + buildTemplateSignature(type.typeTemplates)
            : identifier;
    });
    return '<' + typeNames.join(',') + '>';
}
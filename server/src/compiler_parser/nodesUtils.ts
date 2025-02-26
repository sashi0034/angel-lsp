import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {EntityAttribute, FunctionAttribute, NodeType, TokenRange, ReferenceModifier} from "./nodes";
import {Mutable} from "../utils/utilities";
import {TextLocation} from "../compiler_tokenizer/textLocation";

export function getNextTokenIfExist(token: TokenObject): TokenObject {
    if (token.next !== undefined) return token.next;
    return token;
}

export function isRangeInOneLine(range: TokenRange): boolean {
    return range.start.location.start.line === range.end.location.end.line;
}

export function getLocationBetween(start: TokenObject, end: TokenObject): TextLocation {
    return new TextLocation(start.location.path, start.location.start, end.location.end);
}

export function getNodeLocation(range: TokenRange): TextLocation {
    return getLocationBetween(range.start, range.end);
}

export function setEntityAttribute(attribute: Mutable<EntityAttribute>, token: 'shared' | 'external' | 'abstract' | 'final') {
    if (token === 'shared') attribute.isShared = true;
    else if (token === 'external') attribute.isExternal = true;
    else if (token === 'abstract') attribute.isAbstract = true;
    else if (token === 'final') attribute.isFinal = true;
}

export function isEntityModifierForClass(modifier: EntityAttribute) {
    return modifier.isAbstract || modifier.isFinal;
}

export function setFunctionAttribute(attribute: Mutable<FunctionAttribute>, token: 'override' | 'final' | 'explicit' | 'property') {
    if (token === 'override') attribute.isOverride = true;
    else if (token === 'final') attribute.isFinal = true;
    else if (token === 'explicit') attribute.isExplicit = true;
    else if (token === 'property') attribute.isProperty = true;
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

export function getIdentifierInType(type: NodeType): TokenObject {
    return type.dataType.identifier;
}
import {ParsedToken} from "./parsedToken";
import {LocationInfo} from "./tokens";
import {EntityAttribute, FunctionAttribute, NodeType, ParsedRange, ReferenceModifier} from "./nodes";
import {Mutable} from "../utils/utilities";

export function getNextTokenIfExist(token: ParsedToken): ParsedToken {
    if (token.next !== undefined) return token.next;
    return token;
}

export function isRangeInOneLine(range: ParsedRange): boolean {
    return range.start.location.start.line === range.end.location.end.line;
}

export function getLocationBetween(start: ParsedToken, end: ParsedToken): LocationInfo {
    return {
        path: start.location.path,
        start: start.location.start,
        end: end.location.end
    };
}

export function getNodeLocation(range: ParsedRange): LocationInfo {
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

export function getIdentifierInType(type: NodeType): ParsedToken {
    return type.dataType.identifier;
}
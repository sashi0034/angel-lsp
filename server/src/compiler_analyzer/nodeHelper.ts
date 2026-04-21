import {AccessModifierToken, Node_Func, Node_InterfaceMethod} from '../compiler_parser/nodes';

export enum AccessRestriction {
    Private = 'private',
    Protected = 'protected'
}

export function getAccessRestriction(accessModifier: AccessModifierToken | undefined): AccessRestriction | undefined {
    if (accessModifier === undefined) {
        return undefined;
    }

    if (accessModifier.text === 'private') {
        return AccessRestriction.Private;
    }

    if (accessModifier.text === 'protected') {
        return AccessRestriction.Protected;
    }

    return undefined;
}

export function hasFunctionAttribute(node: Node_Func | Node_InterfaceMethod, text: string): boolean {
    return node.funcAttrTokens?.some(token => token.text === text) === true;
}

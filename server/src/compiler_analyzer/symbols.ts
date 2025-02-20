import {
    AccessModifier,
    NodeClass,
    NodeEnum,
    NodeFunc,
    NodeFuncDef,
    NodeIf,
    NodeInterface,
    NodeIntfMethod,
    NodeLambda,
    NodeName,
    NodeVirtualProp
} from "../compiler_parser/nodes";
import {ParserToken} from "../compiler_parser/parserToken";
import {ComplementHints} from "./symbolComplement";
import {TemplateTranslation} from "./symbolUtils";
import assert = require("node:assert");
import {Mutable} from "../utils/utilities";
import {ResolvedType} from "./resolvedType";
import {SymbolScope} from "./symbolScope";

export enum PrimitiveType {
    Template = 'Template',
    String = 'String',
    Bool = 'Bool',
    Number = 'Number',
    Void = 'Void',
    Any = 'Any',
    Auto = 'Auto',
}

/**
 * The node that serves as the origin of a symbol's declaration.
 * Types without a declaration node, such as built-in types, are represented using PrimitiveType.
 */
export type DefinitionSource = NodeEnum | NodeClass | NodeInterface | PrimitiveType;

/**
 * Checks whether the given `DefinitionSource` is a `PrimitiveType`.
 * In other words, returns `true` if the given `DefinitionSource` does not have a declaration node.
 */
export function isSourcePrimitiveType(type: DefinitionSource | undefined): type is PrimitiveType {
    return typeof type === 'string';
}

export function isSourceNodeClassOrInterface(type: DefinitionSource): type is NodeClass {
    if (isSourcePrimitiveType(type)) return false;
    return type.nodeName === NodeName.Class || type.nodeName === NodeName.Interface;
}

export function getSourceNodeName(type: DefinitionSource | undefined): NodeName | undefined {
    if (type === undefined || isSourcePrimitiveType(type)) return undefined;
    return type.nodeName;
}

/**
 * The base interface for all symbols.
 */
export interface SymbolBase {
    readonly declaredPlace: ParserToken;
    readonly declaredScope: SymbolScope;
}

export class SymbolType implements SymbolBase {
    constructor(
        public readonly declaredPlace: ParserToken,
        public readonly declaredScope: SymbolScope,
        public readonly definitionSource: DefinitionSource,
        public readonly membersScope: SymbolScope | undefined,
        public readonly templateTypes?: ParserToken[], // e.g. <T, U>
        public readonly baseList?: (ResolvedType | undefined)[],
        public readonly isHandler?: boolean,
    ) {
    }

    public static create(args: {
        declaredPlace: ParserToken
        declaredScope: SymbolScope
        definitionSource: DefinitionSource
        membersScope: SymbolScope | undefined
    }) {
        return new SymbolType(args.declaredPlace, args.declaredScope, args.definitionSource, args.membersScope);
    }

    public mutate(): Mutable<this> {
        return this;
    }
}

export class SymbolFunction implements SymbolBase {
    private nextOverloadFunction: SymbolFunction | undefined = undefined;

    constructor(
        public readonly declaredPlace: ParserToken,
        public readonly declaredScope: SymbolScope,
        public readonly sourceNode: NodeFunc | NodeFuncDef | NodeIntfMethod,
        public readonly returnType: ResolvedType | undefined,
        public readonly parameterTypes: (ResolvedType | undefined)[],
        public readonly isInstanceMember: boolean,
        public readonly accessRestriction: AccessModifier | undefined,
    ) {
    }

    public static create(args: {
        declaredPlace: ParserToken
        declaredScope: SymbolScope
        sourceNode: NodeFunc | NodeFuncDef | NodeIntfMethod
        returnType: ResolvedType | undefined
        parameterTypes: (ResolvedType | undefined)[]
        isInstanceMember: boolean
        accessRestriction: AccessModifier | undefined
    }) {
        return new SymbolFunction(
            args.declaredPlace,
            args.declaredScope,
            args.sourceNode,
            args.returnType,
            args.parameterTypes,
            args.isInstanceMember,
            args.accessRestriction);
    }

    public clone(): this {
        return {...this};
    }

    public mutate(): Mutable<this> {
        return this;
    }

    public setNextOverload(nextOverload: SymbolFunction) {
        assert(this.nextOverloadFunction === undefined);
        this.nextOverloadFunction = nextOverload;
    }

    public get nextOverload(): SymbolFunction | undefined {
        return this.nextOverloadFunction;
    }
}

export class SymbolVariable implements SymbolBase {
    constructor(
        public readonly declaredPlace: ParserToken,
        public readonly declaredScope: SymbolScope,
        public readonly type: ResolvedType | undefined,
        public readonly isInstanceMember: boolean,
        public readonly accessRestriction: AccessModifier | undefined,
    ) {
    }

    public static create(args: {
        declaredPlace: ParserToken
        declaredScope: SymbolScope
        type: ResolvedType | undefined
        isInstanceMember: boolean
        accessRestriction: AccessModifier | undefined
    }) {
        return new SymbolVariable(
            args.declaredPlace,
            args.declaredScope,
            args.type,
            args.isInstanceMember,
            args.accessRestriction);
    }
}

export function isSymbolInstanceMember(symbol: SymbolObject): symbol is SymbolFunction | SymbolVariable {
    const canBeMember = (symbol instanceof SymbolFunction) || (symbol instanceof SymbolVariable);
    if (canBeMember === false) return false;
    return symbol.isInstanceMember;
}

export type SymbolObject = SymbolType | SymbolFunction | SymbolVariable;

// (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)

/**
 * Nodes that can have a scope containing symbols.
 */
export type SymbolOwnerNode =
    NodeEnum
    | NodeClass
    | NodeVirtualProp
    | NodeInterface
    | NodeFunc
    | NodeIf
    | NodeLambda;

/**
 * Information about a symbol that references a symbol declared elsewhere.
 */
export interface ReferencedSymbolInfo {
    readonly declaredSymbol: SymbolObject;
    readonly referencedToken: ParserToken;
}



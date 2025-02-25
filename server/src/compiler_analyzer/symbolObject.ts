import {
    AccessModifier,
    NodeClass,
    NodeEnum,
    NodeFunc,
    NodeFuncDef,
    NodeInterface,
    NodeIntfMethod,
    NodeName
} from "../compiler_parser/nodes";
import {Mutable} from "../utils/utilities";
import {ResolvedType} from "./resolvedType";
import {SymbolScope} from "./symbolScope";
import {TokenKind, TokenObject} from "../compiler_tokenizer/tokens";
import assert = require("node:assert");

/**
 * The node that serves as the origin of a type declaration.
 */
export type TypeSourceNode = NodeEnum | NodeClass | NodeInterface;

export function isSourceNodeClassOrInterface(type: TypeSourceNode | undefined): type is NodeClass {
    if (type === undefined) return false;
    return type.nodeName === NodeName.Class || type.nodeName === NodeName.Interface;
}

export function getSourceNodeName(type: TypeSourceNode | undefined): NodeName | undefined {
    if (type === undefined) return undefined;
    return type.nodeName;
}

/**
 * The base interface for all symbols.
 */
export interface SymbolBase {
    readonly declaredPlace: TokenObject;
    readonly declaredScope: SymbolScope;
}

export class SymbolType implements SymbolBase {
    constructor(
        public readonly declaredPlace: TokenObject,
        public readonly declaredScope: SymbolScope,
        public readonly sourceNode: TypeSourceNode | undefined,
        public readonly membersScope: SymbolScope | undefined,
        // Whether this is a template type parameter (i.e., true when this is 'T' in 'class array<T>')
        public readonly isTypeParameter?: boolean,
        // Template type parameters (i.e., 'class A<T, U>' has two template types 'T' and 'U')
        public readonly templateTypes?: TokenObject[],
        public readonly baseList?: (ResolvedType | undefined)[],
        public readonly isHandler?: boolean,
    ) {
    }

    public static create(args: {
        declaredPlace: TokenObject
        declaredScope: SymbolScope
        sourceNode: TypeSourceNode | undefined
        membersScope: SymbolScope | undefined
        isTypeParameter?: boolean
        templateTypes?: TokenObject[]
        baseList?: (ResolvedType | undefined)[]
        isHandler?: boolean
    }) {
        return new SymbolType(
            args.declaredPlace,
            args.declaredScope,
            args.sourceNode,
            args.membersScope,
            args.isTypeParameter,
            args.templateTypes,
            args.baseList,
            args.isHandler);
    }

    public mutate(): Mutable<this> {
        return this;
    }

    public get identifierText(): string {
        return this.declaredPlace.text;
    }

    /**
     * Determine if the type is a system type. (e.g. int, float, void)
     */
    public isSystemType(): boolean {
        return this.sourceNode === undefined;
    }

    public isNumberType(): boolean {
        return this.declaredPlace.isReservedToken() && this.declaredPlace.property.isNumber;
    }
}

export class SymbolFunction implements SymbolBase {
    private _nextOverload: SymbolFunction | undefined = undefined;

    constructor(
        public readonly declaredPlace: TokenObject,
        public readonly declaredScope: SymbolScope,
        public readonly sourceNode: NodeFunc | NodeFuncDef | NodeIntfMethod,
        public readonly returnType: ResolvedType | undefined,
        public readonly parameterTypes: (ResolvedType | undefined)[],
        public readonly isInstanceMember: boolean,
        public readonly accessRestriction: AccessModifier | undefined,
    ) {
    }

    public static create(args: {
        declaredPlace: TokenObject
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
        assert(this._nextOverload === undefined);
        this._nextOverload = nextOverload;
    }

    public get nextOverload(): SymbolFunction | undefined {
        return this._nextOverload;
    }
}

export class SymbolVariable implements SymbolBase {
    constructor(
        public readonly declaredPlace: TokenObject,
        public readonly declaredScope: SymbolScope,
        public readonly type: ResolvedType | undefined,
        public readonly isInstanceMember: boolean,
        public readonly accessRestriction: AccessModifier | undefined,
    ) {
    }

    public static create(args: {
        declaredPlace: TokenObject
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
 * Information about a symbol that references a symbol declared elsewhere.
 */
export interface ReferencedSymbolInfo {
    readonly declaredSymbol: SymbolObject;
    readonly referencedToken: TokenObject;
}



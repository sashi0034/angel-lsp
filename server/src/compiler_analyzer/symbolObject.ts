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
import {TokenKind, TokenObject} from "../compiler_tokenizer/tokenObject";
import assert = require("node:assert");

/**
 * A node that represents a type definition.
 */
export type TypeDefinitionNode = NodeEnum | NodeClass | NodeInterface;

export function isDefinitionNodeClassOrInterface(type: TypeDefinitionNode | undefined): type is NodeClass {
    if (type === undefined) return false;
    return type.nodeName === NodeName.Class || type.nodeName === NodeName.Interface;
}

/**
 * The base interface for all symbols.
 */
export interface SymbolBase {
    readonly defToken: TokenObject;
    readonly defScope: SymbolScope;
}

export class SymbolType implements SymbolBase {
    constructor(
        public readonly defToken: TokenObject,
        public readonly defScope: SymbolScope,
        public readonly defNode: TypeDefinitionNode | undefined,
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
        defToken: TokenObject
        defScope: SymbolScope
        defNode: TypeDefinitionNode | undefined
        membersScope: SymbolScope | undefined
        isTypeParameter?: boolean
        templateTypes?: TokenObject[]
        baseList?: (ResolvedType | undefined)[]
        isHandler?: boolean
    }) {
        return new SymbolType(
            args.defToken,
            args.defScope,
            args.defNode,
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
        return this.defToken.text;
    }

    /**
     * Determine if the type is a system type. (e.g. int, float, void)
     */
    public isSystemType(): boolean {
        return this.defNode === undefined;
    }

    public isNumberType(): boolean {
        return this.defToken.isReservedToken() && this.defToken.property.isNumber;
    }
}

export class SymbolFunction implements SymbolBase {
    private _nextOverload: SymbolFunction | undefined = undefined;

    constructor(
        public readonly defToken: TokenObject,
        public readonly defScope: SymbolScope,
        public readonly defNode: NodeFunc | NodeFuncDef | NodeIntfMethod,
        public readonly returnType: ResolvedType | undefined,
        public readonly parameterTypes: (ResolvedType | undefined)[],
        public readonly isInstanceMember: boolean,
        public readonly accessRestriction: AccessModifier | undefined,
    ) {
    }

    public static create(args: {
        defToken: TokenObject
        defScope: SymbolScope
        defNode: NodeFunc | NodeFuncDef | NodeIntfMethod
        returnType: ResolvedType | undefined
        parameterTypes: (ResolvedType | undefined)[]
        isInstanceMember: boolean
        accessRestriction: AccessModifier | undefined
    }) {
        return new SymbolFunction(
            args.defToken,
            args.defScope,
            args.defNode,
            args.returnType,
            args.parameterTypes,
            args.isInstanceMember,
            args.accessRestriction);
    }

    public clone(): this {
        return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    }

    public mutate(): Mutable<this> {
        return this;
    }

    public appendOverload(overload: SymbolFunction) {
        if (this._nextOverload !== undefined) {
            this._nextOverload.appendOverload(overload);
        } else {
            this._nextOverload = overload;
        }
    }

    public get nextOverload(): SymbolFunction | undefined {
        return this._nextOverload;
    }
}

export class SymbolVariable implements SymbolBase {
    constructor(
        public readonly defToken: TokenObject,
        public readonly defScope: SymbolScope,
        public readonly type: ResolvedType | undefined,
        public readonly isInstanceMember: boolean,
        public readonly accessRestriction: AccessModifier | undefined,
    ) {
    }

    public static create(args: {
        defToken: TokenObject
        defScope: SymbolScope
        type: ResolvedType | undefined
        isInstanceMember: boolean
        accessRestriction: AccessModifier | undefined
    }) {
        return new SymbolVariable(
            args.defToken,
            args.defScope,
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



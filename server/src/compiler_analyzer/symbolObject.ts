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
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import assert = require("node:assert");

/**
 * A node that represents a type definition.
 */
export type TypeDefinitionNode = NodeEnum | NodeClass | NodeInterface;

export function isDefinitionNodeClassOrInterface(type: TypeDefinitionNode | undefined): type is NodeClass {
    if (type === undefined) return false;
    return type.nodeName === NodeName.Class || type.nodeName === NodeName.Interface;
}

export enum SymbolKind {
    Type = 'Type',
    Variable = 'Variable',
    Function = 'Function',
}

export type ScopePath = ReadonlyArray<string>;

/**
 * The base interface for all symbols.
 */
export abstract class SymbolBase {
    public abstract get kind(): SymbolKind;

    public isFunction(): this is SymbolFunction {
        return this.kind === SymbolKind.Function;
    }

    public toHolder(): SymbolObjectHolder {
        if (this.isFunction()) return new SymbolFunctionHolder(this);
        assert(this instanceof SymbolType || this instanceof SymbolVariable);
        return this;
    }
}

export interface SymbolHolder {
    get identifierText(): string;

    isFunctionHolder(): this is SymbolFunctionHolder;

    toList(): ReadonlyArray<SymbolObject>;
}

export class SymbolType extends SymbolBase implements SymbolHolder {
    public get kind(): SymbolKind {
        return SymbolKind.Type;
    }

    constructor(
        public readonly defToken: TokenObject,
        public readonly defScope: ScopePath,
        public readonly defNode: TypeDefinitionNode | undefined,
        public readonly membersScope: ScopePath | undefined,
        // Whether this is a template type parameter (i.e., true when this is 'T' in 'class array<T>')
        public readonly isTypeParameter?: boolean,
        // Template type parameters (i.e., 'class A<T, U>' has two template types 'T' and 'U')
        public readonly templateTypes?: TokenObject[],
        public readonly baseList?: (ResolvedType | undefined)[],
        public readonly isHandler?: boolean,
    ) {
        super();
    }

    public static create(args: {
        defToken: TokenObject
        defScope: ScopePath
        defNode: TypeDefinitionNode | undefined
        membersScope: ScopePath | undefined
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

    public isFunctionHolder(): this is SymbolFunctionHolder {
        return false;
    }

    public toList(): SymbolType[] {
        return [this];
    }
}

export class SymbolVariable extends SymbolBase implements SymbolHolder {
    public get kind(): SymbolKind {
        return SymbolKind.Variable;
    }

    constructor(
        public readonly defToken: TokenObject,
        public readonly defScope: ScopePath,
        public readonly type: ResolvedType | undefined,
        public readonly isInstanceMember: boolean,
        public readonly accessRestriction: AccessModifier | undefined,
    ) {
        super();
    }

    public static create(args: {
        defToken: TokenObject
        defScope: ScopePath
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

    public get identifierText(): string {
        return this.defToken.text;
    }

    public isFunctionHolder(): this is SymbolFunctionHolder {
        return false;
    }

    public toList(): SymbolVariable[] {
        return [this];
    }
}

export class SymbolFunction extends SymbolBase {
    public get kind(): SymbolKind {
        return SymbolKind.Function;
    }

    constructor(
        public readonly defToken: TokenObject,
        public readonly defScope: ScopePath,
        public readonly defNode: NodeFunc | NodeFuncDef | NodeIntfMethod,
        public readonly returnType: ResolvedType | undefined,
        public readonly parameterTypes: (ResolvedType | undefined)[],
        public readonly isInstanceMember: boolean,
        public readonly accessRestriction: AccessModifier | undefined,
    ) {
        super();
    }

    public static create(args: {
        defToken: TokenObject
        defScope: ScopePath
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

    public get identifierText(): string {
        return this.defToken.text;
    }
}

export class SymbolFunctionHolder implements SymbolHolder {
    private readonly _overloadList: SymbolFunction[] = [];

    public constructor(firstElement: SymbolFunction) {
        this._overloadList.push(firstElement);
    }

    public pushOverload(overload: SymbolFunction) {
        this._overloadList.push(overload);
    }

    public get overloadList(): ReadonlyArray<SymbolFunction> {
        return this._overloadList;
    }

    public get count(): number {
        return this._overloadList.length;
    }

    public get first(): SymbolFunction {
        return this._overloadList[0];
    }

    public get identifierText(): string {
        return this.first.defToken.text;
    }

    public isFunctionHolder(): this is SymbolFunctionHolder {
        return true;
    }

    public toList(): ReadonlyArray<SymbolFunction> {
        return this._overloadList;
    }
}

export function isSymbolInstanceMember(symbol: SymbolObjectHolder): symbol is SymbolFunctionHolder | SymbolVariable {
    const canBeMember = (symbol.isFunctionHolder()) || (symbol instanceof SymbolVariable);
    if (canBeMember === false) return false;
    return symbol.toList()[0].isInstanceMember;
}

export type SymbolObject = SymbolType | SymbolVariable | SymbolFunction;

export type SymbolObjectHolder = SymbolType | SymbolVariable | SymbolFunctionHolder;

// (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)

/**
 * Information about a symbol that references a symbol declared elsewhere.
 */
export interface ReferencedSymbolInfo {
    readonly declaredSymbol: SymbolObject;
    readonly referencedToken: TokenObject;
}



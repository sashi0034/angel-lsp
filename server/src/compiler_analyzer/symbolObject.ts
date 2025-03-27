import {
    AccessModifier,
    NodeClass,
    NodeEnum,
    NodeFunc,
    NodeFuncDef,
    NodeInterface,
    NodeIntfMethod,
    NodeName,
    NodeBase
} from "../compiler_parser/nodes";
import {Mutable} from "../utils/utilities";
import {ResolvedType} from "./resolvedType";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import assert = require("node:assert");

/**
 * A node that represents a type definition.
 */
export type TypeDefinitionNode = NodeEnum | NodeClass | NodeInterface;

export function isNodeEnumOrClassOrInterface(type: NodeBase | undefined): type is NodeClass {
    if (type === undefined) return false;
    return type.nodeName === NodeName.Enum || type.nodeName === NodeName.Class || type.nodeName === NodeName.Interface;
}

export function isNodeClassOrInterface(type: NodeBase | undefined): type is NodeClass {
    if (type === undefined) return false;
    return type.nodeName === NodeName.Class || type.nodeName === NodeName.Interface;
}

export enum SymbolKind {
    Type = 'Type',
    Variable = 'Variable',
    Function = 'Function',
}

export type ScopePath = ReadonlyArray<string>;

export function isScopePathEquals(lhs: ScopePath, rhs: ScopePath): boolean {
    if (lhs.length !== rhs.length) return false;
    for (let i = 0; i < lhs.length; i++) {
        if (lhs[i] !== rhs[i]) return false;
    }

    return true;
}

/**
 * The base interface for all symbols.
 */
export abstract class SymbolBase {
    public abstract get kind(): SymbolKind;

    public abstract get scopePath(): ScopePath;

    public abstract get identifierText(): string;

    public abstract toHolder(): SymbolObjectHolder;

    public isType(): this is SymbolType {
        return this.kind === SymbolKind.Type;
    }

    public isVariable(): this is SymbolVariable {
        return this.kind === SymbolKind.Variable;
    }

    public isFunction(): this is SymbolFunction {
        return this.kind === SymbolKind.Function;
    }

    public equals(other: SymbolBase): boolean {
        return this.identifierText === other.identifierText && isScopePathEquals(this.scopePath, other.scopePath);
    }
}

export interface SymbolHolder {
    get identifierText(): string;

    isType(): this is SymbolType;

    isVariable(): this is SymbolVariable;

    isFunctionHolder(): this is SymbolFunctionHolder;

    toList(): ReadonlyArray<SymbolObject>;
}

export class SymbolType extends SymbolBase implements SymbolHolder {
    public get kind(): SymbolKind {
        return SymbolKind.Type;
    }

    constructor(
        public readonly identifierToken: TokenObject,
        public readonly scopePath: ScopePath,
        public readonly linkedNode: TypeDefinitionNode | undefined,
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
        identifierToken: TokenObject
        scopePath: ScopePath
        linkedNode: TypeDefinitionNode | undefined
        membersScope: ScopePath | undefined
        isTypeParameter?: boolean
        templateTypes?: TokenObject[]
        baseList?: (ResolvedType | undefined)[]
        isHandler?: boolean
    }) {
        return new SymbolType(
            args.identifierToken,
            args.scopePath,
            args.linkedNode,
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
        return this.identifierToken.text;
    }

    public toHolder(): SymbolObjectHolder {
        return this;
    }

    /**
     * Determine if the type is a primitive type. (e.g. int, float, void)
     * Note: enum is not a primitive type here.
     */
    public isPrimitiveType(): boolean {
        return this.linkedNode === undefined;
    }

    public isNumberType(): boolean {
        return this.identifierToken.isReservedToken() && this.identifierToken.property.isNumber;
    }

    public isEnumType(): boolean {
        return this.linkedNode?.nodeName === NodeName.Enum;
    }

    public isPrimitiveOrEnum(): boolean {
        return this.isPrimitiveType() || this.isEnumType();
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
        public readonly identifierToken: TokenObject,
        public readonly scopePath: ScopePath,
        public readonly type: ResolvedType | undefined,
        public readonly isInstanceMember: boolean,
        public readonly accessRestriction: AccessModifier | undefined,
    ) {
        super();
    }

    public static create(args: {
        identifierToken: TokenObject
        scopePath: ScopePath
        type: ResolvedType | undefined
        isInstanceMember: boolean
        accessRestriction: AccessModifier | undefined
    }) {
        return new SymbolVariable(
            args.identifierToken,
            args.scopePath,
            args.type,
            args.isInstanceMember,
            args.accessRestriction);
    }

    public get identifierText(): string {
        return this.identifierToken.text;
    }

    public toHolder(): SymbolObjectHolder {
        return this;
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
        public readonly identifierToken: TokenObject,
        public readonly scopePath: ScopePath,
        public readonly linkedNode: NodeFunc | NodeFuncDef | NodeIntfMethod,
        public readonly functionScope: ScopePath | undefined,
        public readonly returnType: ResolvedType | undefined,
        public readonly parameterTypes: (ResolvedType | undefined)[],
        public readonly isInstanceMember: boolean,
        public readonly accessRestriction: AccessModifier | undefined,
        // Template type parameters (i.e., 'class A<T, U>' has two template types 'T' and 'U')
        public readonly templateTypes?: TokenObject[],
    ) {
        super();
    }

    public static create(args: {
        identifierToken: TokenObject
        scopePath: ScopePath
        linkedNode: NodeFunc | NodeFuncDef | NodeIntfMethod
        functionScope: ScopePath | undefined,
        returnType: ResolvedType | undefined
        parameterTypes: (ResolvedType | undefined)[]
        isInstanceMember: boolean
        accessRestriction: AccessModifier | undefined
    }) {
        return new SymbolFunction(
            args.identifierToken,
            args.scopePath,
            args.linkedNode,
            args.functionScope,
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
        return this.identifierToken.text;
    }

    public toHolder(): SymbolFunctionHolder {
        return new SymbolFunctionHolder(this);
    }
}

export class SymbolFunctionHolder implements SymbolHolder {
    private readonly _overloadList: SymbolFunction[] = [];

    public constructor(firstElement: SymbolFunction | SymbolFunction[]) {
        if (Array.isArray(firstElement)) {
            assert(firstElement.length > 0);
            this._overloadList = firstElement;
        } else {
            this._overloadList.push(firstElement);
        }
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
        return this.first.identifierToken.text;
    }

    public isVariable(): this is SymbolVariable {
        return false;
    }

    public isType(): this is SymbolType {
        return false;
    }

    public isFunctionHolder(): this is SymbolFunctionHolder {
        return true;
    }

    public toList(): ReadonlyArray<SymbolFunction> {
        return this._overloadList;
    }
}

export function isSymbolInstanceMember(symbol: SymbolObjectHolder): symbol is SymbolFunctionHolder | SymbolVariable {
    const canBeMember = symbol.isFunctionHolder() || symbol.isVariable();
    if (canBeMember === false) return false;

    return symbol.toList()[0].isInstanceMember;
}

export type SymbolObject = SymbolType | SymbolVariable | SymbolFunction;

export type SymbolObjectHolder = SymbolType | SymbolVariable | SymbolFunctionHolder;

// (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)



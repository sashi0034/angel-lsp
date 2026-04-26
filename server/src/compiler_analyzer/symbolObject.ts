import {
    Node_Class,
    Node_Enum,
    Node_Func,
    Node_FuncDef,
    Node_Interface,
    Node_InterfaceMethod,
    NodeName,
    NodeBase
} from '../compiler_parser/nodeObject';
import {AccessRestriction} from './nodeHelper';
import {EvaluatedValue, ResolvedType} from './resolvedType';
import {TokenObject} from '../compiler_tokenizer/tokenObject';
import assert = require('node:assert');

/**
 * A node that represents a type definition.
 */
export type TypeDefinitionNode = Node_Enum | Node_Class | Node_Interface;

export function isNodeEnumOrClassOrInterface(
    type: NodeBase | undefined
): type is Node_Enum | Node_Class | Node_Interface {
    if (type === undefined) {
        return false;
    }

    return type.nodeName === NodeName.Enum || type.nodeName === NodeName.Class || type.nodeName === NodeName.Interface;
}

export function isNodeClassOrInterface(type: NodeBase | undefined): type is Node_Class | Node_Interface {
    if (type === undefined) {
        return false;
    }

    return type.nodeName === NodeName.Class || type.nodeName === NodeName.Interface;
}

export enum SymbolKind {
    Type = 'Type',
    Variable = 'Variable',
    Function = 'Function'
}

export type ScopePath = ReadonlyArray<string>;

export function isScopePathEquals(lhs: ScopePath, rhs: ScopePath): boolean {
    if (lhs.length !== rhs.length) {
        return false;
    }

    for (let i = 0; i < lhs.length; i++) {
        if (lhs[i] !== rhs[i]) {
            return false;
        }
    }

    return true;
}

export type QualifiedIdentifier = string;

export interface TemplateParameter {
    qualifiedIdentifier: QualifiedIdentifier;
    identifierToken: TokenObject;
}

/**
 * The base interface for all symbols.
 */
export abstract class SymbolObject {
    private _qualifiedIdentifier: QualifiedIdentifier | undefined;

    public abstract get kind(): SymbolKind;

    public abstract get scopePath(): ScopePath;

    public abstract get identifierToken(): TokenObject;

    public abstract get identifierText(): string;

    public get qualifiedIdentifier(): QualifiedIdentifier {
        if (this._qualifiedIdentifier === undefined) {
            this._qualifiedIdentifier = [...this.scopePath, this.identifierText].join('.');
        }

        return this._qualifiedIdentifier;
    }

    public abstract toHolder(): SymbolObjectHolder;

    public isType(): this is TypeSymbol {
        return this.kind === SymbolKind.Type;
    }

    public isVariable(): this is VariableSymbol {
        return this.kind === SymbolKind.Variable;
    }

    public isFunction(): this is FunctionSymbol {
        return this.kind === SymbolKind.Function;
    }

    public equals(other: SymbolObject): boolean {
        return this.qualifiedIdentifier === other.qualifiedIdentifier;
    }
}

export interface SymbolHolder {
    get identifierText(): string;

    isType(): this is TypeSymbol;

    isVariable(): this is VariableSymbol;

    isFunctionHolder(): this is FunctionSymbolHolder;

    toList(): ReadonlyArray<SymbolObject>;
}

export class TypeSymbol extends SymbolObject implements SymbolHolder {
    public get kind(): SymbolKind {
        return SymbolKind.Type;
    }

    constructor(
        public readonly identifierToken: TokenObject,
        public readonly scopePath: ScopePath,
        public readonly linkedNode: TypeDefinitionNode | undefined,
        private _membersScopePath: ScopePath | undefined,
        public readonly isMixin?: boolean,
        // Whether this is a template parameter (i.e., true when this is 'T' in 'class array<T>')
        public readonly isTemplateParameterType?: boolean,
        // Template parameter qualifiedIdentifier.
        // e.g., 'class A<T, U>' has two template parameters for 'T' and 'U'.
        private _templateParameters?: TemplateParameter[],
        private _baseList?: (ResolvedType | undefined)[],
        public readonly isHandle?: boolean,
        public readonly aliasTargetType?: TypeSymbol,
        public readonly multipleEnumCandidates?: VariableSymbol[]
    ) {
        super();

        if (this.multipleEnumCandidates !== undefined) {
            // This is an ambiguous enum value and have multiple candidates.
            assert(this.multipleEnumCandidates.length > 1);
        }
    }

    public static create(args: {
        identifierToken: TokenObject;
        scopePath: ScopePath;
        linkedNode: TypeDefinitionNode | undefined;
        membersScopePath: ScopePath | undefined;
        isMixin?: boolean;
        isTemplateParameterType?: boolean;
        templateParameters?: TemplateParameter[];
        baseList?: (ResolvedType | undefined)[];
        isHandle?: boolean;
        aliasTargetType?: TypeSymbol;
        multipleEnumCandidates?: VariableSymbol[];
    }) {
        return new TypeSymbol(
            args.identifierToken,
            args.scopePath,
            args.linkedNode,
            args.membersScopePath,
            args.isMixin,
            args.isTemplateParameterType,
            args.templateParameters,
            args.baseList,
            args.isHandle,
            args.aliasTargetType,
            args.multipleEnumCandidates
        );
    }

    public get membersScopePath(): ScopePath | undefined {
        return this._membersScopePath;
    }

    public assignMembersScopePath(scope: ScopePath | undefined) {
        assert(this._membersScopePath === undefined);
        this._membersScopePath = scope;
    }

    public get templateParameters(): TemplateParameter[] | undefined {
        return this._templateParameters;
    }

    public assignTemplateParameters(templateParameters: TemplateParameter[]) {
        assert(this._templateParameters === undefined);
        this._templateParameters = templateParameters;
    }

    public get baseList(): (ResolvedType | undefined)[] {
        return this._baseList ?? [];
    }

    public assignBaseList(baseList: (ResolvedType | undefined)[] | undefined) {
        assert(this._baseList === undefined);
        this._baseList = baseList;
    }

    // public mutate(): Mutable<this> {
    //     return this;
    // }

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

    public isIntegerType(): boolean {
        return this.identifierToken.isReservedToken() && this.identifierToken.property.isIntegerType;
    }

    public isFloatingPoint(): boolean {
        return this.identifierToken.isReservedToken() && this.identifierToken.property.isFloatingPoint;
    }

    public isEnumType(): boolean {
        return this.linkedNode?.nodeName === NodeName.Enum;
    }

    public isPrimitiveOrEnum(): boolean {
        return this.isPrimitiveType() || this.isEnumType();
    }

    public isFunctionHolder(): this is FunctionSymbolHolder {
        return false;
    }

    public toList(): TypeSymbol[] {
        return [this];
    }
}

export class VariableSymbol extends SymbolObject implements SymbolHolder {
    public get kind(): SymbolKind {
        return SymbolKind.Variable;
    }

    constructor(
        public readonly identifierToken: TokenObject,
        public readonly scopePath: ScopePath,
        private _type: ResolvedType | undefined,
        public readonly isInstanceMember: boolean,
        public readonly accessRestriction: AccessRestriction | undefined,
        public readonly isVirtualProperty?: boolean,
        public readonly isIndexedPropertyAccessor?: boolean,
        private _evaluatedValue?: EvaluatedValue
    ) {
        super();
    }

    public static create(args: {
        identifierToken: TokenObject;
        scopePath: ScopePath;
        type: ResolvedType | undefined;
        isInstanceMember: boolean;
        accessRestriction: AccessRestriction | undefined;
        isVirtualProperty?: boolean;
        isIndexedPropertyAccessor?: boolean;
        evaluatedValue?: EvaluatedValue;
    }) {
        return new VariableSymbol(
            args.identifierToken,
            args.scopePath,
            args.type,
            args.isInstanceMember,
            args.accessRestriction,
            args.isVirtualProperty,
            args.isIndexedPropertyAccessor,
            args.evaluatedValue
        );
    }

    public get identifierText(): string {
        return this.identifierToken.text;
    }

    public toHolder(): SymbolObjectHolder {
        return this;
    }

    public isFunctionHolder(): this is FunctionSymbolHolder {
        return false;
    }

    public toList(): VariableSymbol[] {
        return [this];
    }

    public get type(): ResolvedType | undefined {
        return this._type;
    }

    public assignType(type: ResolvedType | undefined) {
        assert(this._type === undefined);
        this._type = type;
    }

    public get evaluatedValue(): EvaluatedValue | undefined {
        return this._evaluatedValue;
    }

    public assignEvaluatedValue(evaluatedValue: EvaluatedValue | undefined) {
        this._evaluatedValue = evaluatedValue;
    }
}

export class FunctionSymbol extends SymbolObject {
    public get kind(): SymbolKind {
        return SymbolKind.Function;
    }

    constructor(
        public readonly identifierToken: TokenObject,
        public readonly scopePath: ScopePath,
        public readonly linkedNode: Node_Func | Node_FuncDef | Node_InterfaceMethod,
        public readonly functionScopePath: ScopePath | undefined,
        private _returnType: ResolvedType | undefined,
        private _parameterTypes: (ResolvedType | undefined)[],
        public readonly isInstanceMember: boolean,
        public readonly accessRestriction: AccessRestriction | undefined,
        // Template parameter qualifiedIdentifier.
        // For example, 'func<T, U>' has two template parameters for 'T' and 'U'.
        private _templateParameters?: TemplateParameter[]
    ) {
        super();
    }

    public static create(args: {
        identifierToken: TokenObject;
        scopePath: ScopePath;
        linkedNode: Node_Func | Node_FuncDef | Node_InterfaceMethod;
        functionScopePath: ScopePath | undefined;
        returnType: ResolvedType | undefined;
        parameterTypes: (ResolvedType | undefined)[];
        isInstanceMember: boolean;
        accessRestriction: AccessRestriction | undefined;
    }) {
        return new FunctionSymbol(
            args.identifierToken,
            args.scopePath,
            args.linkedNode,
            args.functionScopePath,
            args.returnType,
            args.parameterTypes,
            args.isInstanceMember,
            args.accessRestriction
        );
    }

    public clone(option?: {identifierToken?: TokenObject; accessRestriction?: AccessRestriction}): this {
        return new FunctionSymbol(
            option?.identifierToken ?? this.identifierToken,
            this.scopePath,
            this.linkedNode,
            this.functionScopePath,
            this._returnType,
            this._parameterTypes,
            this.isInstanceMember,
            option?.accessRestriction ?? this.accessRestriction,
            this._templateParameters
        ) as this;
    }

    public get returnType(): ResolvedType | undefined {
        return this._returnType;
    }

    public assignReturnType(returnType: ResolvedType | undefined) {
        assert(this._returnType === undefined);
        this._returnType = returnType;
    }

    public get parameterTypes(): (ResolvedType | undefined)[] {
        return this._parameterTypes;
    }

    public assignParameterTypes(parameterTypes: (ResolvedType | undefined)[]) {
        assert(this._parameterTypes.length === 0);
        this._parameterTypes = parameterTypes;
    }

    public get templateParameters(): TemplateParameter[] | undefined {
        return this._templateParameters;
    }

    public assignTemplateParameters(templateParameters: TemplateParameter[]) {
        assert(this._templateParameters === undefined);
        this._templateParameters = templateParameters;
    }

    // public mutate(): Mutable<this> {
    //     return this;
    // }

    public get identifierText(): string {
        return this.identifierToken.text;
    }

    /**
     * The actual identifier token linked to the function.
     * e.g., actualIdentifierToken: 'BaseObject', identifierToken: 'super'
     */
    public get actualIdentifierToken(): TokenObject {
        return this.linkedNode.identifier;
    }

    public toHolder(): FunctionSymbolHolder {
        return new FunctionSymbolHolder(this);
    }
}

export class FunctionSymbolHolder implements SymbolHolder {
    private readonly _overloadList: FunctionSymbol[] = [];

    public constructor(firstElement: FunctionSymbol | FunctionSymbol[]) {
        if (Array.isArray(firstElement)) {
            assert(firstElement.length > 0);
            this._overloadList = firstElement;
        } else {
            this._overloadList.push(firstElement);
        }
    }

    public pushOverload(overload: FunctionSymbol) {
        this._overloadList.push(overload);
    }

    public get overloadList(): ReadonlyArray<FunctionSymbol> {
        return this._overloadList;
    }

    public get count(): number {
        return this._overloadList.length;
    }

    public get first(): FunctionSymbol {
        return this._overloadList[0];
    }

    public get identifierText(): string {
        return this.first.identifierToken.text;
    }

    public isVariable(): this is VariableSymbol {
        return false;
    }

    public isType(): this is TypeSymbol {
        return false;
    }

    public isFunctionHolder(): this is FunctionSymbolHolder {
        return true;
    }

    public toList(): ReadonlyArray<FunctionSymbol> {
        return this._overloadList;
    }
}

export function isSymbolInstanceMember(symbol: SymbolObjectHolder): symbol is FunctionSymbolHolder | VariableSymbol {
    const canBeMember = symbol.isFunctionHolder() || symbol.isVariable();
    if (canBeMember === false) {
        return false;
    }

    return symbol.toList()[0].isInstanceMember;
}

export type SymbolObjectHolder = TypeSymbol | VariableSymbol | FunctionSymbolHolder;

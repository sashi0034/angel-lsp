import {ScopePath, FunctionSymbol, TypeSymbol, VariableSymbol, QualifiedIdentifier} from './symbolObject';
import {TokenObject} from '../compiler_tokenizer/tokenObject';
import {Node_Lambda} from '../compiler_parser/nodes';
import type {TokenRange} from '../compiler_tokenizer/tokenRange';

/**
 * Mapping from template parameter qualifiedIdentifier to the types they are resolved to.
 * For example, when instantiating `array<T>` as `array<int>`,
 * the qualified identifier of `T` is mapped to the type `int`.
 */
export type TemplateMapping = Map<QualifiedIdentifier, ResolvedType | undefined>;

/**
 * Metadata for a lambda expression whose type is resolved later from a funcdef target.
 */
export interface LambdaInfo {
    node: Node_Lambda;
    parameterTypes: (ResolvedType | undefined)[];
    resolve: (expectedType: ResolvedType, nodeRange?: TokenRange) => void;
}

/**
 * Apply the template mapping to the target type.
 */
export function applyTemplateMapping(
    target: ResolvedType | undefined,
    mapping: TemplateMapping | undefined
): ResolvedType | undefined {
    // e.g. 1:
    // target: array<T> with {T: T}
    // mapping: {T: int}
    // --> array<T> with {T: int}
    // i.e., T at the end of the target is replaced with int

    // e.g. 2:
    // target: array<T> with {T: array<T> with {T: T}}
    // mapping: {T: bool}
    // --> array<T> with {T: array<T> with {T: bool}}
    // i.e., T at the end of the target is replaced with bool

    if (target === undefined || mapping === undefined) {
        return target;
    }

    if (target.typeOrFunc.templateTypes?.length === 0 || target.templateMapping === undefined) {
        // The target has no templates.
        if (target.typeOrFunc.isType() && target.typeOrFunc.isTypeParameter) {
            // If the target is a type parameter such as `T`, translate it.
            // e.g.:
            // target: T
            // mapping: {T: bool}
            // --> bool
            return mapping.get(target.typeOrFunc.qualifiedIdentifier) ?? target;
        }

        return target;
    }

    // -----------------------------------------------
    // At this point, the target has template parameters.

    // Create a new template mapping by replacing the template type with the mapped type.
    const newMapping: TemplateMapping = new Map();
    for (const [qualifiedIdentifier, translatedType] of target.templateMapping) {
        if (translatedType?.typeOrFunc.isType() && mapping.has(translatedType.typeOrFunc.qualifiedIdentifier)) {
            // Replace `T` at the end of the target with the mapped type.
            newMapping.set(qualifiedIdentifier, mapping.get(translatedType.typeOrFunc.qualifiedIdentifier));
        } else {
            // Templates may be nested, so visit recursively.
            newMapping.set(qualifiedIdentifier, applyTemplateMapping(translatedType, mapping));
        }
    }

    return target.cloneWithTemplateMapping(newMapping);
}

/**
 * Merge two template mappings, with the overlay taking precedence over the base.
 */
export function mergeTemplateMappings(
    base: TemplateMapping | undefined,
    overlay: TemplateMapping | undefined
): TemplateMapping | undefined {
    if (base === undefined) {
        return overlay;
    }

    if (overlay === undefined) {
        return base;
    }

    const merged: TemplateMapping = new Map(base);
    for (const [token, type] of overlay) {
        merged.set(token, type);
    }

    return merged;
}

/**
 * The type of symbol that has been resolved by deduction.
 * This has the template mapping from `T` to actual types.
 */
export class ResolvedType {
    constructor(
        // A type or function that has been resolved.
        public readonly typeOrFunc: TypeSymbol | FunctionSymbol,
        public readonly isHandle?: boolean,
        public readonly templateMapping?: TemplateMapping,
        // This is attached when accessed through a variable, including a delegate variable.
        // For functions, only the token information of the access source is retained.
        private _attachedAccessSource?: VariableSymbol | TokenObject,
        public readonly isExplicitHandleAccess?: boolean,
        public readonly lambdaInfo?: LambdaInfo
    ) {}

    public static create(args: {
        typeOrFunc: TypeSymbol | FunctionSymbol;
        isHandle?: boolean;
        templateMapping?: TemplateMapping;
        attachedAccessSource?: VariableSymbol | TokenObject;
        isExplicitHandleReference?: boolean;
        lambdaInfo?: LambdaInfo;
    }) {
        return new ResolvedType(
            args.typeOrFunc,
            args.isHandle,
            args.templateMapping,
            args.attachedAccessSource,
            args.isExplicitHandleReference,
            args.lambdaInfo
        );
    }

    public cloneWithType(type: TypeSymbol): ResolvedType {
        return new ResolvedType(
            type,
            this.isHandle,
            this.templateMapping,
            this._attachedAccessSource,
            this.isExplicitHandleAccess,
            this.lambdaInfo
        );
    }

    public cloneWithTemplateMapping(templateMapping: TemplateMapping | undefined): ResolvedType {
        return new ResolvedType(
            this.typeOrFunc,
            this.isHandle,
            templateMapping,
            this._attachedAccessSource,
            this.isExplicitHandleAccess,
            this.lambdaInfo
        );
    }

    public cloneWithHandle(isHandle: boolean | undefined): ResolvedType {
        return new ResolvedType(
            this.typeOrFunc,
            isHandle,
            this.templateMapping,
            this._attachedAccessSource,
            this.isExplicitHandleAccess,
            this.lambdaInfo
        );
    }

    public cloneWithExplicitHandleAccess(isExplicitHandleReference: boolean | undefined): ResolvedType {
        return new ResolvedType(
            this.typeOrFunc,
            this.isHandle,
            this.templateMapping,
            this._attachedAccessSource,
            isExplicitHandleReference,
            this.lambdaInfo
        );
    }

    public cloneWithAttachedAccessSource(attachedAccessSource: VariableSymbol | TokenObject | undefined): ResolvedType {
        return new ResolvedType(
            this.typeOrFunc,
            this.isHandle,
            this.templateMapping,
            attachedAccessSource,
            this.isExplicitHandleAccess,
            this.lambdaInfo
        );
    }

    public get scopePath(): ScopePath | undefined {
        return this.typeOrFunc.scopePath;
    }

    public get identifierToken(): TokenObject | undefined {
        return this.typeOrFunc.identifierToken;
    }

    public get identifierText(): string {
        return this.typeOrFunc.identifierToken.text;
    }

    public get attachedAccessSourceVariable(): VariableSymbol | undefined {
        return this._attachedAccessSource instanceof VariableSymbol ? this._attachedAccessSource : undefined;
    }

    public get attachedAccessSourceFunctionToken(): TokenObject | undefined {
        return this._attachedAccessSource instanceof VariableSymbol === false ? this._attachedAccessSource : undefined;
    }

    public get attachedAccessSourceToken(): TokenObject | undefined {
        if (this._attachedAccessSource === undefined) {
            return undefined;
        }

        if (this._attachedAccessSource instanceof VariableSymbol) {
            return this._attachedAccessSource.identifierToken;
        }

        return this._attachedAccessSource;
    }

    public getMappedTemplateTypes(): (ResolvedType | undefined)[] {
        return this.typeOrFunc.templateTypes?.map(type => this.templateMapping?.get(type.qualifiedIdentifier)) ?? [];
    }

    public equals(other: ResolvedType | undefined): boolean {
        if (other === undefined) {
            return false;
        }

        if (this.typeOrFunc.equals(other.typeOrFunc) === false) {
            return false;
        }

        if (this.isHandle !== other.isHandle) {
            return false;
        }

        // Compare the template types.
        if (this.typeOrFunc.templateTypes !== undefined && other.typeOrFunc.templateTypes !== undefined) {
            if (this.typeOrFunc.templateTypes.length !== other.typeOrFunc.templateTypes.length) {
                return false;
            }

            const thisTemplates = this.getMappedTemplateTypes();
            const otherTemplates = other.getMappedTemplateTypes();

            for (let i = 0; i < thisTemplates.length; i++) {
                if (thisTemplates[i]?.equals(otherTemplates[i]) === false) {
                    return false;
                }
            }
        }

        return true;
    }

    public isAutoType(): boolean {
        return this.typeOrFunc.isType() && this.typeOrFunc.identifierText === 'auto';
    }

    public isAnyType(): boolean {
        return this.typeOrFunc.isType() && this.typeOrFunc.identifierText === '?';
    }

    public isNullType(): boolean {
        return this.typeOrFunc.isType() && this.typeOrFunc.identifierText === 'null';
    }
}

import {ScopePath, FunctionSymbol, TypeSymbol, VariableSymbol, QualifiedIdentifier} from './symbolObject';
import {TokenObject} from '../compiler_tokenizer/tokenObject';
import {Node_Lambda} from '../compiler_parser/nodes';
import type {TokenRange} from '../compiler_tokenizer/tokenRange';

/**
 * Mapping from template parameter qualifiedIdentifier to the types they are resolved to.
 * For example, when instantiating `array<T>` as `array<int>`,
 * the qualified identifier of `T` is mapped to the type `int`.
 */
export type TemplateTranslator = Map<QualifiedIdentifier, ResolvedType | undefined>;

/**
 * Metadata for a lambda expression whose type is resolved later from a funcdef target.
 */
export interface LambdaInfo {
    node: Node_Lambda;
    parameterTypes: (ResolvedType | undefined)[];
    resolve: (expectedType: ResolvedType, nodeRange?: TokenRange) => void;
}

/**
 * Apply the template translator to the target type.
 */
export function applyTemplateTranslator(
    target: ResolvedType | undefined,
    translator: TemplateTranslator | undefined
): ResolvedType | undefined {
    // e.g. 1:
    // target: array<T> with {T: T}
    // translator: {T: int}
    // --> array<T> with {T: int}
    // i.e., T at the end of the target is replaced with int

    // e.g. 2:
    // target: array<T> with {T: array<T> with {T: T}}
    // translator: {T: bool}
    // --> array<T> with {T: array<T> with {T: bool}}
    // i.e., T at the end of the target is replaced with bool

    if (target === undefined || translator === undefined) {
        return target;
    }

    if (target.typeOrFunc.templateTypes?.length === 0 || target.templateTranslator === undefined) {
        // The target has no templates.
        if (target.typeOrFunc.isType() && target.typeOrFunc.isTypeParameter) {
            // If the target is a type parameter such as `T`, translate it.
            // e.g.:
            // target: T
            // translator: {T: bool}
            // --> bool
            return translator.get(target.typeOrFunc.qualifiedIdentifier) ?? target;
        }

        return target;
    }

    // -----------------------------------------------
    // At this point, the target has template parameters.

    // Create a new template translator by replacing the template type with the translated type.
    const newTranslator: TemplateTranslator = new Map();
    for (const [qualifiedIdentifier, translatedType] of target.templateTranslator) {
        if (translatedType?.typeOrFunc.isType() && translator.has(translatedType.typeOrFunc.qualifiedIdentifier)) {
            // Replace `T` at the end of the target with the translated type.
            newTranslator.set(qualifiedIdentifier, translator.get(translatedType.typeOrFunc.qualifiedIdentifier));
        } else {
            // Templates may be nested, so visit recursively.
            newTranslator.set(qualifiedIdentifier, applyTemplateTranslator(translatedType, translator));
        }
    }

    return target.cloneWithTemplateTranslator(newTranslator);
}

/**
 * Merge two template translators, with the overlay taking precedence over the base.
 */
export function mergeTemplateTranslators(
    base: TemplateTranslator | undefined,
    overlay: TemplateTranslator | undefined
): TemplateTranslator | undefined {
    if (base === undefined) {
        return overlay;
    }

    if (overlay === undefined) {
        return base;
    }

    const merged: TemplateTranslator = new Map(base);
    for (const [token, type] of overlay) {
        merged.set(token, type);
    }

    return merged;
}

/**
 * The type of symbol that has been resolved by deduction.
 * This has the template translator, which is a mapping from `T` to actual types.
 */
export class ResolvedType {
    constructor(
        // A type or function that has been resolved.
        public readonly typeOrFunc: TypeSymbol | FunctionSymbol,
        public readonly isHandle?: boolean,
        public readonly templateTranslator?: TemplateTranslator,
        // This is attached when accessed through a variable, including a delegate variable.
        // For functions, only the token information of the access source is retained.
        private _attachedAccessSource?: VariableSymbol | TokenObject,
        public readonly isExplicitHandleAccess?: boolean,
        public readonly lambdaInfo?: LambdaInfo
    ) {}

    public static create(args: {
        typeOrFunc: TypeSymbol | FunctionSymbol;
        isHandle?: boolean;
        templateTranslator?: TemplateTranslator;
        attachedAccessSource?: VariableSymbol | TokenObject;
        isExplicitHandleReference?: boolean;
        lambdaInfo?: LambdaInfo;
    }) {
        return new ResolvedType(
            args.typeOrFunc,
            args.isHandle,
            args.templateTranslator,
            args.attachedAccessSource,
            args.isExplicitHandleReference,
            args.lambdaInfo
        );
    }

    public cloneWithType(type: TypeSymbol): ResolvedType {
        return new ResolvedType(
            type,
            this.isHandle,
            this.templateTranslator,
            this._attachedAccessSource,
            this.isExplicitHandleAccess,
            this.lambdaInfo
        );
    }

    public cloneWithTemplateTranslator(templateTranslator: TemplateTranslator | undefined): ResolvedType {
        return new ResolvedType(
            this.typeOrFunc,
            this.isHandle,
            templateTranslator,
            this._attachedAccessSource,
            this.isExplicitHandleAccess,
            this.lambdaInfo
        );
    }

    public cloneWithHandle(isHandle: boolean | undefined): ResolvedType {
        return new ResolvedType(
            this.typeOrFunc,
            isHandle,
            this.templateTranslator,
            this._attachedAccessSource,
            this.isExplicitHandleAccess,
            this.lambdaInfo
        );
    }

    public cloneWithExplicitHandleAccess(isExplicitHandleReference: boolean | undefined): ResolvedType {
        return new ResolvedType(
            this.typeOrFunc,
            this.isHandle,
            this.templateTranslator,
            this._attachedAccessSource,
            isExplicitHandleReference,
            this.lambdaInfo
        );
    }

    public cloneWithAttachedAccessSource(attachedAccessSource: VariableSymbol | TokenObject | undefined): ResolvedType {
        return new ResolvedType(
            this.typeOrFunc,
            this.isHandle,
            this.templateTranslator,
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

    public get mappedTemplateTypes(): (ResolvedType | undefined)[] {
        return this.typeOrFunc.templateTypes?.map(type => this.templateTranslator?.get(type.qualifiedIdentifier)) ?? [];
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

            const thisTemplates = this.mappedTemplateTypes;
            const otherTemplates = other.mappedTemplateTypes;

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

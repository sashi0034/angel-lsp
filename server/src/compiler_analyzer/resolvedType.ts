import {ScopePath, FunctionSymbol, TypeSymbol, VariableSymbol} from './symbolObject';
import {TokenObject} from '../compiler_tokenizer/tokenObject';
import type {Node_Lambda} from '../compiler_parser/nodes';
import type {TokenRange} from '../compiler_tokenizer/tokenRange';

/**
 * Mapping from template parameter tokens to the types they are resolved to.
 * For example, when instantiating `array<T>` as `array<int>`,
 * the token `T` is mapped to the type `int`.
 */
export type TemplateTranslator = Map<TokenObject, ResolvedType | undefined>;

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
    // e.g.1:
    // target: array<T> with {T: T}
    // translator: {T: int}
    // -> array<T> with {T: int}
    // i.e., T at the end of the target is replaced with int

    // e.g.2:
    // target: array<T> with {T: array<T> with {T: T}}
    // translator: {T: bool}
    // -> array<T> with {T: array<T> with {T: bool}}
    // i.e., T at the end of the target is replaced with bool

    if (target === undefined || translator === undefined) {
        return target;
    }

    if (target.typeOrFunc.templateTypes?.length === 0 || target.templateTranslator === undefined) {
        // The target has no templates.
        if (target.typeOrFunc.isType() && target.typeOrFunc.isTypeParameter) {
            // If the target is a type parameter such as `T`, translate it.
            return translator.get(target.typeOrFunc.identifierToken) ?? target;
        }

        return target;
    }

    // -----------------------------------------------
    // At this point, the target has template parameters.

    // Create a new template translator by replacing the template type with the translated type.
    const newTranslator = new Map<TokenObject, ResolvedType | undefined>();
    for (const [token, translatedType] of target.templateTranslator) {
        if (translatedType?.identifierToken !== undefined && translator.has(translatedType?.identifierToken)) {
            // Replace `T` at the end of the target with the translated type.
            newTranslator.set(token, translator.get(translatedType?.identifierToken));
        } else {
            // Templates may be nested, so visit recursively.
            newTranslator.set(token, applyTemplateTranslator(translatedType, translator));
        }
    }

    return target.cloneWithTemplateTranslator(translator);
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
        accessSource?: VariableSymbol | TokenObject;
        isExplicitHandleReference?: boolean;
        lambdaInfo?: LambdaInfo;
    }) {
        return new ResolvedType(
            args.typeOrFunc,
            args.isHandle,
            args.templateTranslator,
            args.accessSource,
            args.isExplicitHandleReference,
            args.lambdaInfo
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

    public cloneWithAccessSource(accessSource: VariableSymbol | TokenObject | undefined): ResolvedType {
        return new ResolvedType(
            this.typeOrFunc,
            this.isHandle,
            this.templateTranslator,
            accessSource,
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

    public get accessSourceVariable(): VariableSymbol | undefined {
        return this._attachedAccessSource instanceof VariableSymbol ? this._attachedAccessSource : undefined;
    }

    public get attachedAccessSourceFunctionToken(): TokenObject | undefined {
        return this._attachedAccessSource instanceof VariableSymbol === false ? this._attachedAccessSource : undefined;
    }

    public get accessSourceToken(): TokenObject | undefined {
        if (this._attachedAccessSource === undefined) {
            return undefined;
        }

        if (this._attachedAccessSource instanceof VariableSymbol) {
            return this._attachedAccessSource.identifierToken;
        }

        return this._attachedAccessSource;
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

            const thisTemplates = this.typeOrFunc.templateTypes.map(type => this.templateTranslator?.get(type));
            const otherTemplates = other.typeOrFunc.templateTypes.map(type => other.templateTranslator?.get(type));

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

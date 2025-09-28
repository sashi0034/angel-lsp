import {ScopePath, SymbolFunction, SymbolType, SymbolVariable} from "./symbolObject";
import {TokenObject} from "../compiler_tokenizer/tokenObject";

// Template translation is resolved as a mapping from tokens to types.
// In other words, for example, when instantiating `array<T>` as `array<int>`,
// the key 'T' is mapped to the type `int`.
export type TemplateTranslator = Map<TokenObject, ResolvedType | undefined>;

/**
 * Apply the template translator to the target type.
 */
export function applyTemplateTranslator(target: ResolvedType | undefined, translator: TemplateTranslator | undefined): ResolvedType | undefined {
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

    if (target === undefined || translator === undefined) return target;

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
        public readonly typeOrFunc: SymbolType | SymbolFunction,
        public readonly isHandler?: boolean,
        public readonly templateTranslator?: TemplateTranslator,
        public readonly accessSource?: SymbolVariable | TokenObject // This is attached when accessing from the variable.
    ) {
    }

    public static create(args: {
        typeOrFunc: SymbolType | SymbolFunction
        isHandler?: boolean
        templateTranslator?: TemplateTranslator,
        accessSource?: SymbolVariable | TokenObject
    }) {
        return new ResolvedType(args.typeOrFunc, args.isHandler, args.templateTranslator, args.accessSource);
    }

    // public clone(): ResolvedType {
    //     return new ResolvedType(this.typeOrFunc, this.isHandler, this.templateTranslator);
    // }

    // public cloneWith(typeOrFunc: SymbolType | SymbolFunction): ResolvedType {
    //     return new ResolvedType(typeOrFunc, this.isHandler, this.templateTranslator, this.accessToken);
    // }

    public cloneWithTemplateTranslator(templateTranslator: TemplateTranslator | undefined): ResolvedType {
        return new ResolvedType(this.typeOrFunc, this.isHandler, templateTranslator, this.accessSource);
    }

    public cloneWithAccessSource(accessSource: SymbolVariable | TokenObject | undefined): ResolvedType {
        return new ResolvedType(this.typeOrFunc, this.isHandler, this.templateTranslator, accessSource);
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

    public get accessSourceVariable(): SymbolVariable | undefined {
        return this.accessSource instanceof SymbolVariable ? this.accessSource : undefined;
    }

    public get accessSourceToken(): TokenObject | undefined {
        if (this.accessSource === undefined) {
            return undefined;
        }

        if (this.accessSource instanceof SymbolVariable) {
            return this.accessSource.identifierToken;
        }

        return this.accessSource;
    }

    public equals(other: ResolvedType | undefined): boolean {
        if (other === undefined) return false;

        if (this.typeOrFunc.equals(other.typeOrFunc) === false) return false;

        // Compare the template types.
        if (this.typeOrFunc.templateTypes !== undefined && other.typeOrFunc.templateTypes !== undefined) {
            if (this.typeOrFunc.templateTypes.length !== other.typeOrFunc.templateTypes.length) return false;

            const thisTemplates = this.typeOrFunc.templateTypes.map(type => this.templateTranslator?.get(type));
            const otherTemplates = other.typeOrFunc.templateTypes.map(type => other.templateTranslator?.get(type));

            for (let i = 0; i < thisTemplates.length; i++) {
                if (thisTemplates[i]?.equals(otherTemplates[i]) === false) return false;
            }
        }

        return true;
    }

    public isAutoType(): boolean {
        return this.typeOrFunc.isType() && this.typeOrFunc.identifierText === 'auto';
    }
}

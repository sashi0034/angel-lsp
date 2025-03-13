import {ScopePath, SymbolFunction, SymbolType} from "./symbolObject";
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
 */
export class ResolvedType {
    constructor(
        // A type or function that has been resolved.
        public readonly typeOrFunc: SymbolType | SymbolFunction,
        public readonly isHandler?: boolean,
        public readonly templateTranslator?: TemplateTranslator,
    ) {
    }

    public static create(args: {
        typeOrFunc: SymbolType | SymbolFunction
        isHandler?: boolean
        templateTranslator?: TemplateTranslator
    }) {
        return new ResolvedType(args.typeOrFunc, args.isHandler, args.templateTranslator);
    }

    // public clone(): ResolvedType {
    //     return new ResolvedType(this.typeOrFunc, this.isHandler, this.templateTranslator);
    // }

    public cloneWithTemplateTranslator(templateTranslator: TemplateTranslator | undefined): ResolvedType {
        return new ResolvedType(this.typeOrFunc, this.isHandler, templateTranslator);
    }

    public get sourceScope(): ScopePath | undefined {
        return this.typeOrFunc.scopePath;
    }

    public get identifierToken(): TokenObject | undefined {
        return this.typeOrFunc.identifierToken;
    }

    public get identifierText(): string {
        return this.typeOrFunc.identifierToken.text;
    }
}

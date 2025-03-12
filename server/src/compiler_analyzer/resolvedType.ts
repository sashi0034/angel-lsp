import {ScopePath, SymbolFunction, SymbolType} from "./symbolObject";
import {TokenObject} from "../compiler_tokenizer/tokenObject";

// Template translation is resolved as a mapping from tokens to types.
// In other words, for example, when instantiating `array<T>` as `array<int>`,
// the key 'T' is mapped to the type `int`.
export type TemplateTranslator = Map<TokenObject, ResolvedType | undefined>;

// TODO: Fix around template translation?

export function resolveTemplateType(
    templateTranslate: TemplateTranslator | undefined, type: ResolvedType | undefined
): ResolvedType | undefined {
    if (templateTranslate === undefined) return type;

    if (type === undefined) return undefined;

    if (type.typeOrFunc.isFunction()) return undefined; // FIXME: Also check the function handler type?

    if (type.typeOrFunc.isTypeParameter !== true) return type;

    if (templateTranslate.has(type.typeOrFunc.identifierToken)) {
        return templateTranslate.get(type.typeOrFunc.identifierToken);
    }

    return type;
}

export function resolveTemplateTypes(
    templateTranslate: (TemplateTranslator | undefined)[], type: ResolvedType | undefined
): ResolvedType | undefined {
    return templateTranslate
        .reduce((arg, t) => t !== undefined ? resolveTemplateType(t, arg) : arg, type);
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

    public get sourceScope(): ScopePath | undefined {
        return this.typeOrFunc.scopePath;
    }

    public get identifierText(): string {
        return this.typeOrFunc.identifierToken.text;
    }

}

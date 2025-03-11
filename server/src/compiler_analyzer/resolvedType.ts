import {TemplateTranslation} from "./symbolUtils";
import {ScopePath, SymbolFunction, SymbolFunctionHolder, SymbolType} from "./symbolObject";

/**
 * The type of symbol that has been resolved by deduction.
 */
export class ResolvedType {
    constructor(
        public readonly typeOrFunc: SymbolType | SymbolFunction,
        public readonly isHandler?: boolean,
        public readonly templateTranslate?: TemplateTranslation,
    ) {
    }

    public static create(args: {
        typeOrFunc: SymbolType | SymbolFunction
        isHandler?: boolean
        templateTranslate?: TemplateTranslation
    }) {
        return new ResolvedType(args.typeOrFunc, args.isHandler, args.templateTranslate);
    }

    public get sourceScope(): ScopePath | undefined {
        return this.typeOrFunc.scopePath;
    }

    public get identifierText(): string {
        return this.typeOrFunc.identifierToken.text;
    }
}

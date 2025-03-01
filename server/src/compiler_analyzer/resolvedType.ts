import {TemplateTranslation} from "./symbolUtils";
import {SymbolScope} from "./symbolScope";
import {SymbolFunction, SymbolType} from "./symbolObject";

/**
 * The type of symbol that has been resolved by deduction.
 */
export class ResolvedType {
    constructor(
        public readonly symbolType: SymbolType | SymbolFunction, // TODO: rename?
        // public readonly sourceScope: SymbolScope | undefined,
        public readonly isHandler?: boolean,
        public readonly templateTranslate?: TemplateTranslation,
    ) {
    }

    public static create(args: {
        symbolType: SymbolType | SymbolFunction
        isHandler?: boolean
        templateTranslate?: TemplateTranslation
    }) {
        return new ResolvedType(args.symbolType, args.isHandler, args.templateTranslate);
    }

    public get sourceScope(): SymbolScope | undefined {
        return this.symbolType.defScope;
    }
}

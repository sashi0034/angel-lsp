import {TemplateTranslation} from "./symbolUtils";
import {ScopePath, SymbolFunction, SymbolFunctionHolder, SymbolType} from "./symbolObject";

/**
 * The type of symbol that has been resolved by deduction.
 */
export class ResolvedType {
    constructor(
        public readonly symbolType: SymbolType | SymbolFunction, // TODO: rename?
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

    public get sourceScope(): ScopePath | undefined {
        return this.symbolType.scopePath;
    }

    public get identifierText(): string {
        return this.symbolType.identifierToken.text;
    }
}

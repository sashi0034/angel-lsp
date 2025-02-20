import {TemplateTranslation} from "./symbolUtils";
import {SymbolScope} from "./symbolScope";
import {SymbolFunction, SymbolType} from "./symbols";

/**
 * The type of symbol that has been resolved by deduction.
 */
export interface ResolvedType {
    readonly symbolType: SymbolType | SymbolFunction;
    readonly sourceScope: SymbolScope | undefined; // FIXME: Obsolete? Use symbolType.declaredScope instead.
    readonly isHandler?: boolean;
    readonly templateTranslate?: TemplateTranslation;
}

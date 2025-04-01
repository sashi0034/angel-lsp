import {SymbolGlobalScope, SymbolScope} from "./symbolScope";

export function createGlobalScope(filepath: string, includeScopes: AnalyzerScope[]): SymbolGlobalScope {
    const globalScope = new SymbolGlobalScope(filepath);

    globalScope.activateContext();

    for (const include of includeScopes) {
        globalScope.includeExternalScope(include.getPureGlobalScope());
    }

    return globalScope;
}

// -----------------------------------------------

/**
 *  Represents the scope of the file being analyzed.
 */
export class AnalyzerScope {
    /**
     * The path of the file being analyzed.
     */
    public readonly filepath: string;

    /**
     * The scope that contains all symbols in the file.
     * It includes symbols from other modules as well.
     */
    public readonly globalScope: SymbolGlobalScope;

    private _pureGlobalScope: SymbolGlobalScope | undefined;

    /**
     * The scope that contains only symbols in the file.
     */
    public getPureGlobalScope(): SymbolScope {
        if (this._pureGlobalScope === undefined) {
            this._pureGlobalScope = new SymbolGlobalScope(this.globalScope.getContext());
            this._pureGlobalScope.includeExternalScope(this.globalScope);
        }

        return this._pureGlobalScope;
    }

    public constructor(path: string, result: SymbolGlobalScope) {
        this.filepath = path;
        this.globalScope = result;
    }
}
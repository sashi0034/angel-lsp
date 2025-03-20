import {SymbolGlobalScope, SymbolScope} from "./symbolScope";

export function createGlobalScope(filepath: string, includeScopes: AnalyzerScope[]): SymbolGlobalScope {
    const globalScope = new SymbolGlobalScope(filepath);

    globalScope.activateContext();

    for (const include of includeScopes) {
        globalScope.includeExternalScope(include.getUniqueGlobalScope());
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

    private _fileGlobalScope: SymbolGlobalScope | undefined;

    /**
     * The scope that contains only symbols in the file.
     */
    public getUniqueGlobalScope(): SymbolScope {
        if (this._fileGlobalScope === undefined) {
            this._fileGlobalScope = new SymbolGlobalScope(this.globalScope.getContext());
            this._fileGlobalScope.includeExternalScope(this.globalScope);
        }

        return this._fileGlobalScope;
    }

    public constructor(path: string, result: SymbolGlobalScope) {
        this.filepath = path;
        this.globalScope = result;
    }

    /**
     * Remove symbols declared in this file
     */
    // public cleanInFile() {
    //     this._fileGlobalScope = undefined;

    //     this.globalScope.cleanInFile();
    // }
}
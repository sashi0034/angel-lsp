import {SymbolScope} from "./symbolScope";

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
    public readonly globalScope: SymbolScope;

    private _fileGlobalScope: SymbolScope | undefined;

    /**
     * The scope that contains only symbols in the file.
     */
    public getFileGlobalScope(): SymbolScope {
        if (this._fileGlobalScope === undefined) {
            this._fileGlobalScope = SymbolScope.createEmpty(this.globalScope.getContext());
            this._fileGlobalScope.includeExternalScope(this.globalScope);
        }

        return this._fileGlobalScope;
    }

    public constructor(path: string, full: SymbolScope) {
        this.filepath = path;
        this.globalScope = full;
    }
}
import {TextRange} from "../compiler_tokenizer/textLocation";
import {SymbolGlobalScope} from "../compiler_analyzer/symbolScope";
import {codeActionNamedArguments} from "../actions/namedArguments";
import {CodeActionWrapper} from "../actions/utils";

export function provideCodeAction(
    globalScope: SymbolGlobalScope, allGlobalScopes: SymbolGlobalScope[], range: TextRange
): CodeActionWrapper[] {
    return [
        ...codeActionNamedArguments(globalScope, range)
    ];
}

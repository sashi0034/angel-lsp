import {SymbolScope} from "../compiler_analyzer/symbolScope";
import {TextRange} from "../compiler_tokenizer/textLocation";
import {InlayHint} from "vscode-languageserver-protocol";

export function provideInlineHint(globalScope: SymbolScope, range: TextRange): InlayHint[] {
    return [{
        position: {
            line: 0,
            character: 0
        },
        label: 'TODO'
    }];
}

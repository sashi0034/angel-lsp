import {SymbolGlobalScope} from "../compiler_analyzer/symbolScope";
import {TextPosition} from "../compiler_tokenizer/textLocation";
import {provideDefinition} from "./definition";
import {getDocumentCommentOfSymbol} from "./utils";
import {stringifySymbolObject} from "../compiler_analyzer/symbolUtils";

import * as lsp from 'vscode-languageserver';

export function provideHover(globalScope: SymbolGlobalScope, caret: TextPosition): lsp.Hover | undefined {
    const definition = provideDefinition(globalScope, caret);
    if (definition === undefined) return undefined;

    const documentComment = getDocumentCommentOfSymbol(definition);

    return {
        contents: {
            kind: 'markdown',
            // FIXME: Currently colored in C++, because AngelScript support in linguist looks poor.
            // I would like to see someone motivated to be a linguist contributor! https://github.com/github-linguist/linguist
            value: "```cpp\n" + stringifySymbolObject(definition) + ";\n```" + `\n***\n${documentComment}`
            // value: "```AngelScript\n" + stringifySymbolObject(definition) + "\n```"
        }
    };
}

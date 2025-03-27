import * as lsp from "vscode-languageserver/node";

export interface CodeActionWrapper {
    action: lsp.CodeAction;
    resolver: (action: lsp.CodeAction) => void;
}

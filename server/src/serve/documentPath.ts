import {TextDocumentIdentifier} from "vscode-languageserver";
import {fileURLToPath} from "url";
import {TextDocument} from "vscode-languageserver-textdocument";

export interface DocumentPath {
    uri: string;
    path: string;
}

interface TextDocumentParam1 {
    document: TextDocument;
}

interface TextDocumentParam2 {
    textDocument: TextDocumentIdentifier;
}

export function getDocumentPath(document: TextDocumentParam1 | TextDocumentParam2): DocumentPath {
    if ('textDocument' in document)
        return {uri: document.textDocument.uri, path: fileURLToPath(document.textDocument.uri)};
    return {uri: document.document.uri, path: fileURLToPath(document.document.uri)};
}

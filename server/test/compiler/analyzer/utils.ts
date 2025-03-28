import {DiagnosticSeverity} from "vscode-languageserver-types";
import {Inspector} from "../../../src/inspector/inspector";

interface FileContent {
    uri: string;
    content: string;
}

function isRawContent(fileContent: string | FileContent[]): fileContent is string {
    return typeof fileContent === "string";
}

function testAnalyzer(fileContents: string | FileContent[], expectSuccess: boolean) {
    const targetUri = isRawContent(fileContents) ? 'file:///path/to/file.as' : fileContents.at(-1)!.uri;
    const rawContent = isRawContent(fileContents) ? fileContents : fileContents.at(-1)!.content;

    it(`[analyze] ${rawContent}`, () => {
        const inspector = new Inspector();

        if (isRawContent(fileContents)) {
            inspector.inspectFile(targetUri, rawContent);
        } else {
            for (const content of fileContents) {
                inspector.inspectFile(content.uri, content.content);
            }
        }

        inspector.flushRecord();

        const diagnosticsInAnalyzer =
            inspector.getRecord(targetUri).diagnosticsInAnalyzer.filter(
                diagnostic => diagnostic.severity === DiagnosticSeverity.Error || diagnostic.severity === DiagnosticSeverity.Warning
            );

        const hasError = diagnosticsInAnalyzer.length > 0;
        if ((expectSuccess && hasError)) {
            const diagnostic = diagnosticsInAnalyzer[0];
            const message = diagnostic.message;
            const line = diagnostic.range.start.line;
            const character = diagnostic.range.start.character;
            throw new Error(`${message} (:${line}:${character})`);
        } else if (!expectSuccess && !hasError) {
            throw new Error("Expecting error but got none.");
        }
    });
}

export function expectSuccess(fileContents: string | FileContent[]) {
    testAnalyzer(fileContents, true);
}

export function expectError(fileContents: string | FileContent[]) {
    testAnalyzer(fileContents, false);
}


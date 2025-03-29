import {DiagnosticSeverity} from "vscode-languageserver-types";
import {
    FileContents,
    inspectFileContents,
    InspectorTestEvent, makeFileContentList
} from "../../inspectorUtils";

function testAnalyzer(fileContents: FileContents, expectSuccess: boolean): InspectorTestEvent {
    const fileContentList = makeFileContentList(fileContents);
    const targetUri = fileContentList.at(-1)!.uri;
    const targetContent = fileContentList.at(-1)!.content;

    const event = new InspectorTestEvent();

    it(`[analyze] ${targetContent}`, () => {
        event.begin();

        const inspector = inspectFileContents(fileContentList);

        const diagnosticsInAnalyzer =
            inspector.getRecord(targetUri).diagnosticsInAnalyzer.filter(
                diagnostic => diagnostic.severity === DiagnosticSeverity.Error || diagnostic.severity === DiagnosticSeverity.Warning
            );

        const hasError = diagnosticsInAnalyzer.length > 0;
        if (expectSuccess && hasError) {
            const diagnostic = diagnosticsInAnalyzer[0];
            const message = diagnostic.message;
            const line = diagnostic.range.start.line;
            const character = diagnostic.range.start.character;
            throw new Error(`${message} (:${line}:${character})`);
        } else if (!expectSuccess && !hasError) {
            throw new Error("Expecting error but got none.");
        }
    });

    return event;
}

export function expectSuccess(fileContents: FileContents) {
    return testAnalyzer(fileContents, true);
}

export function expectError(fileContents: FileContents) {
    return testAnalyzer(fileContents, false);
}


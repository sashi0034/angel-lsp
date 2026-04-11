import {DiagnosticSeverity} from 'vscode-languageserver-types';
import {FileContents, inspectFileContents, makeFileContentList} from '../../inspectorUtils';

function testAnalyzer(fileContents: FileContents, expectSuccess: boolean, onBegin?: () => void) {
    const fileContentList = makeFileContentList(fileContents);
    const targetUri = fileContentList.at(-1)!.uri;

    onBegin?.();

    const inspector = inspectFileContents(fileContentList);

    const diagnostics = [
        ...inspector
            .getRecord(targetUri)
            .diagnosticsInParser.filter(
                diagnostic =>
                    diagnostic.severity === DiagnosticSeverity.Error ||
                    diagnostic.severity === DiagnosticSeverity.Warning
            ),
        ...inspector
            .getRecord(targetUri)
            .diagnosticsInAnalyzer.filter(
                diagnostic =>
                    diagnostic.severity === DiagnosticSeverity.Error ||
                    diagnostic.severity === DiagnosticSeverity.Warning
            )
    ];

    const hasError = diagnostics.length > 0;
    if (expectSuccess && hasError) {
        const diagnostic = diagnostics[0];
        const message = diagnostic.message;
        const line = diagnostic.range.start.line;
        const character = diagnostic.range.start.character;
        throw new Error(`${message} (:${line}:${character})`);
    } else if (!expectSuccess && !hasError) {
        throw new Error('Expecting error but got none.');
    }
}

export function expectSuccess(fileContents: FileContents, onBegin?: () => void) {
    testAnalyzer(fileContents, true, onBegin);
}

export function expectError(fileContents: FileContents, onBegin?: () => void) {
    testAnalyzer(fileContents, false, onBegin);
}

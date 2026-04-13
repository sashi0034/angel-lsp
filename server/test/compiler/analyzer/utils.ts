import {DiagnosticSeverity} from 'vscode-languageserver-types';
import {FileContents, inspectFileContents, makeFileContentList} from '../../inspectorUtils';

function testAnalyzer(fileContents: FileContents, expectSuccess: boolean) {
    const fileContentList = makeFileContentList(fileContents);

    const inspector = inspectFileContents(fileContentList);

    const diagnostics = inspector
        .getAllRecords()
        .flatMap(record =>
            [...record.diagnosticsInParser, ...record.diagnosticsInAnalyzer]
                .filter(
                    diagnostic =>
                        diagnostic.severity === DiagnosticSeverity.Error ||
                        diagnostic.severity === DiagnosticSeverity.Warning
                )
                .map(diagnostic => ({uri: record.uri, diagnostic}))
        );

    const hasError = diagnostics.length > 0;
    if (expectSuccess && hasError) {
        const {uri, diagnostic} = diagnostics[0];
        const message = diagnostic.message;
        const line = diagnostic.range.start.line;
        const character = diagnostic.range.start.character;
        throw new Error(`${message} (${uri}:${line}:${character})`);
    } else if (!expectSuccess && !hasError) {
        throw new Error('Expecting error but got none.');
    }
}

export function expectSuccess(fileContents: FileContents) {
    testAnalyzer(fileContents, true);
}

export function expectError(fileContents: FileContents) {
    testAnalyzer(fileContents, false);
}

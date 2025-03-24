import {diagnostic} from "../../../src/core/diagnostic";
import {tokenize} from "../../../src/compiler_tokenizer/tokenizer";
import {preprocessAfterTokenized} from "../../../src/compiler_parser/parserPreprocess";
import {parseAfterPreprocessed} from "../../../src/compiler_parser/parser";
import {analyzerDiagnostic} from "../../../src/compiler_analyzer/analyzerDiagnostic";
import {hoistAfterParsed} from "../../../src/compiler_analyzer/hoist";
import {createGlobalScope} from "../../../src/compiler_analyzer/analyzerScope";
import {analyzeAfterHoisted} from "../../../src/compiler_analyzer/analyzer";
import {DiagnosticSeverity} from "vscode-languageserver-types";

function testAnalyzer(content: string, expectSuccess: boolean) {
    it(`[analyze] ${content}`, () => {
        diagnostic.beginSession();

        const uri = "/foo/bar.as";
        const rawTokens = tokenize(uri, content);
        const preprocessedOutput = preprocessAfterTokenized(rawTokens);
        const ast = parseAfterPreprocessed(preprocessedOutput.preprocessedTokens);

        const diagnosticsInParser = diagnostic.endSession();

        // -----------------------------------------------

        analyzerDiagnostic.beginSession();

        const hoistResult = hoistAfterParsed(ast, createGlobalScope(uri, []));
        analyzeAfterHoisted(uri, hoistResult);

        const diagnosticsInAnalyzer =
            analyzerDiagnostic.endSession().filter(
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

export function expectSuccess(content: string) {
    testAnalyzer(content, true);
}

export function expectError(content: string) {
    testAnalyzer(content, false);
}


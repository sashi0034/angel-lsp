import {diagnostic} from "../../src/core/diagnostic";
import {tokenize} from "../../src/compiler_tokenizer/tokenizer";
import {preprocessAfterTokenized} from "../../src/compiler_parser/parserPreprocess";
import {parseAfterPreprocessed} from "../../src/compiler_parser/parser";
import {analyzeAfterHoisted} from "../../src/compiler_analyzer/analyzer";
import {hoistAfterParsed} from "../../src/compiler_analyzer/hoist";
import {analyzerDiagnostic} from "../../src/compiler_analyzer/analyzerDiagnostic";

function testAnalyzer(content: string, expectSuccess: boolean) {
    it(`analyzes: ${content}`, () => {
        diagnostic.beginSession();

        const uri = "/foo/bar.as";
        const tokenizedTokens = tokenize(uri, content);
        const preprocessedOutput = preprocessAfterTokenized(tokenizedTokens);
        const ast = parseAfterPreprocessed(preprocessedOutput.preprocessedTokens);

        const diagnosticsInParser = diagnostic.endSession();

        // -----------------------------------------------

        analyzerDiagnostic.reset();

        const hoistResult = hoistAfterParsed(ast, uri, []);
        analyzeAfterHoisted(uri, hoistResult);

        const diagnosticsInAnalyzer = analyzerDiagnostic.flush();

        const hasError = diagnosticsInAnalyzer.length > 0;
        if ((expectSuccess && hasError) || (!expectSuccess && !hasError)) {
            const diagnostic = diagnosticsInAnalyzer[0];
            const message = diagnostic.message;
            const line = diagnostic.range.start.line;
            const character = diagnostic.range.start.character;
            throw new Error(`${message} (:${line}:${character})`);
        }
    });
}

function expectSuccess(content: string) {
    testAnalyzer(content, true);
}

function expectError(content: string) {
    testAnalyzer(content, false);
}

describe("Analyzer", () => {
    // opAddAssign is defined
    expectSuccess(`
        class Foo {
            int opAddAssign(Foo foo) { return 0; }
        }

        void main() {
            Foo foo;
            foo += foo;
        }
    `);

    // opAddAssign is not defined
    expectError(`
        class Foo {
            int bar;
        }

        void main() {
            Foo foo;
            foo += foo;
        }
    `);

    // TODO: Add more tests
});



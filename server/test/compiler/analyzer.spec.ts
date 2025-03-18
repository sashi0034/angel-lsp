import {diagnostic} from "../../src/core/diagnostic";
import {tokenize} from "../../src/compiler_tokenizer/tokenizer";
import {preprocessAfterTokenized} from "../../src/compiler_parser/parserPreprocess";
import {parseAfterPreprocessed} from "../../src/compiler_parser/parser";
import {analyzeAfterHoisted} from "../../src/compiler_analyzer/analyzer";
import {hoistAfterParsed} from "../../src/compiler_analyzer/hoist";
import {analyzerDiagnostic} from "../../src/compiler_analyzer/analyzerDiagnostic";
import {Diagnostic} from "vscode-languageserver/node";
import {DiagnosticSeverity} from "vscode-languageserver-types";

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

        const diagnosticsInAnalyzer =
            analyzerDiagnostic.flush().filter(
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

    // Named arguments
    expectSuccess(`
        class B { }
        class C { }

        void foo(int a, B b = B(), C c = C(), bool d = false, double e = 0) { }
        
        void main() {
            foo(1, e: 2.0, b: B(), d: true);
        }
    `);

    expectError(`
        class B { }
        class C { }

        void foo(int a, B b = B(), C c = C(), bool d = false, double e = 0) { }
        
        void main() {
            foo(e: 2.0, 1, b: B(), d: true); // Positional arguments cannot be passed after named arguments
        }
    `);

    // Default constructor
    expectSuccess(`
        class A { int m; }
        A g_a();
        void main() {
            A a();
        }
    `);

    expectError(`
        class A { int m; }
        void main() {
            A a = A(A());
        }
    `);

    expectSuccess(`
        enum Kind { A, B, C }
        void main() {
            int number = int(1); Kind kind = Kind(1); bool flag = bool(true);
        }
    `);

    expectError(`
        enum Kind { A, B, C }
        void main() {
            int number = int(1, 1); Kind kind = Kind(); bool flag = bool();
        }
    `);

    // Implicit bool conversion in Logic operators
    expectSuccess(`
        class flag { bool opImplConv() const { return true; } }      
        void main() {
            flag f;
            if (f && bool(f)) { }
        }
    `);

    expectError(`
        class flag { bool opImplConv() const { return true; } }      
        void main() {
            flag f;
            if (f && f) { } // One of the operands must be explicitly boolean
        }
    `);
});



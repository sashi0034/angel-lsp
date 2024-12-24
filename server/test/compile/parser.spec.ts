import {tokenize} from "../../src/compile/tokenizer";
import {parseFromTokenized} from "../../src/compile/parser";
import {diagnostic} from '../../src/code/diagnostic';
import {preprocessTokensForParser} from "../../src/compile/parserPreprocess";

function itParses(content: string) {
    it(`parses ${content}`, () => {
        diagnostic.beginSession();

        const targetUri = "/foo/bar.as";
        const tokenizedTokens = tokenize(content, targetUri);
        const preprocessedTokens = preprocessTokensForParser(tokenizedTokens);
        parseFromTokenized(preprocessedTokens.parsingTokens);

        const diagnosticsInAnalyzer = diagnostic.endSession();
        if (diagnosticsInAnalyzer.length > 0) {
            const diagnostic = diagnosticsInAnalyzer[0];
            const message = diagnostic.message;
            const line = diagnostic.range.start.line;
            const character = diagnostic.range.start.character;
            throw new Error(`${message} (:${line}:${character})`);
        }
    });
}

describe("Parser", () => {
    itParses("void foo() {}");
    itParses("int MyValue = 0;");
    itParses("const uint Flag1 = 0x01;");
    itParses(`
        class Foo
        {
            void bar() { value++; }
            int value;
        }
    `);
    itParses(`
        interface MyInterface
        {
            void DoSomething();
        }
    `);
    itParses(`
        enum MyEnum
        {
            eValue0,
            eValue2 = 2,
            eValue3,
            eValue200 = eValue2 * 100
        }
    `);
    itParses(`
        enum Foo
        {
            fizz,
            buzz,
        }
    `);
    itParses("funcdef bool CALLBACK(int, int);");
    itParses("typedef double real64;");
    itParses(`
        namespace A
        {
            void function() { variable++; }
            int variable;
        }
    `);
});

import {tokenize} from "../../src/compiler_tokenizer/tokenizer";
import {parseAfterPreprocessed} from "../../src/compiler_parser/parser";
import {diagnostic} from '../../src/core/diagnostic';
import {preprocessAfterTokenized} from "../../src/compiler_parser/parserPreprocess";

function testParser(content: string, expectSuccess: boolean) {
    it(`parses: ${content}`, () => {
        diagnostic.beginSession();

        const uri = "/foo/bar.as";
        const rawTokens = tokenize(uri, content);
        const preprocessedTokens = preprocessAfterTokenized(rawTokens);
        parseAfterPreprocessed(preprocessedTokens.preprocessedTokens);

        const diagnosticsInParser = diagnostic.endSession();
        const hasError = diagnosticsInParser.length > 0;
        if ((expectSuccess && hasError) || (!expectSuccess && !hasError)) {
            const diagnostic = diagnosticsInParser[0];
            const message = diagnostic.message;
            const line = diagnostic.range.start.line;
            const character = diagnostic.range.start.character;
            throw new Error(`${message} (:${line}:${character})`);
        }
    });
}

function expectSuccess(content: string) {
    testParser(content, true);
}

// We also should test for failures to avoid an infinite loop.
function expectFailure(content: string) {
    testParser(content, false);
}

// TODO: Separate tests for as.predefined?

describe("Parser", () => {
    expectSuccess("void foo() {}");

    expectSuccess("int MyValue = 0; float MyFloat = 15.f;");

    expectSuccess("const uint Flag1 = 0x01;");

    expectSuccess(`
        class Foo
        {
            void bar() { value++; }
            int value;
        }
    `);

    expectSuccess(`
        interface MyInterface
        {
            void DoSomething();
        }
    `);

    expectSuccess(`
        enum MyEnum
        {
            eValue0,
            eValue2 = 2,
            eValue3,
            eValue200 = eValue2 * 100
        }
    `);

    expectSuccess(`
        enum Foo
        {
            fizz,
            buzz,
        }
    `);

    expectSuccess("funcdef bool CALLBACK(int, int);");

    expectSuccess("typedef double real64;");

    expectSuccess(`
        namespace A
        {
            void function() { variable++; }
            int variable;
        }
    `);

    expectSuccess(`
        enum Test {
            A = 1,
            B = 2
        }

        void Main() {
            Test x = Test(1);
            Test y = Test(Test::A + Test::B | Test::A);
            bool z = (y & Test::A) != 0;
            int v = 1;
            bool w = v == Test::A;
        }
    `);

    expectSuccess(`bool foo = not true; bool bar = not not false;`);

    expectFailure(`funcdef`);
});

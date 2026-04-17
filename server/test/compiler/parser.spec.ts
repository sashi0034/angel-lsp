import {tokenize} from '../../src/compiler_tokenizer/tokenizer';
import {parseAfterPreprocess} from '../../src/compiler_parser/parser';
import {diagnostic} from '../../src/core/diagnostic';
import {preprocessAfterTokenize} from '../../src/compiler_parser/parserPreprocess';
import {FileContentUnit} from '../inspectorUtils';

function testParser(file: string | FileContentUnit, expectSuccess: boolean) {
    diagnostic.beginSession();

    let content: string;
    let uri: string;
    if (typeof file === 'string') {
        content = file;
        uri = 'file:///path/to/file.as';
    } else {
        content = file.content;
        uri = file.uri;
    }

    const rawTokens = tokenize(uri, content);
    const preprocessedTokens = preprocessAfterTokenize(rawTokens, []);
    parseAfterPreprocess(preprocessedTokens.preprocessedTokens);

    const diagnosticsInParser = diagnostic.endSession();
    const hasError = diagnosticsInParser.length > 0;
    if ((expectSuccess && hasError) || (!expectSuccess && !hasError)) {
        const diagnostic = diagnosticsInParser[0];
        const message = diagnostic.message;
        const line = diagnostic.range.start.line;
        const character = diagnostic.range.start.character;
        throw new Error(`${message} (:${line}:${character})`);
    }
}

function expectSuccess(content: string | FileContentUnit, uri: string = `file:///path/to/file.as`) {
    testParser(content, true);
}

// We also should test for failures to avoid an infinite loop.
function expectFailure(content: string | FileContentUnit, uri: string = `file:///path/to/file.as`) {
    testParser(content, false);
}

// TODO: Separate tests for as.predefined?

describe('Parser', () => {
    it('parses an empty function declaration', () => {
        expectSuccess('void foo() {}');
    });

    it('parses variable declarations with numeric initializers', () => {
        expectSuccess('int MyValue = 0; float MyFloat = 15.f;');
    });

    it('parses const declarations with hex initializers', () => {
        expectSuccess('const uint Flag1 = 0x01;');
    });

    it('parses class declarations with methods and fields', () => {
        expectSuccess(`
            class Foo
            {
                void bar() { value++; }
                int value;
            }
        `);
    });

    it('parses interface declarations', () => {
        expectSuccess(`
            interface MyInterface
            {
                void DoSomething();
            }
        `);
    });

    it('parses enum declarations with explicit values', () => {
        expectSuccess(`
            enum MyEnum
            {
                eValue0,
                eValue2 = 2,
                eValue3,
                eValue200 = eValue2 * 100
            }
        `);
    });

    it('parses enum declarations with trailing commas', () => {
        expectSuccess(`
            enum Foo
            {
                fizz,
                buzz,
            }
        `);
    });

    it('parses funcdef declarations', () => {
        expectSuccess('funcdef bool CALLBACK(int, int);');
    });

    it('parses typedef declarations', () => {
        expectSuccess('typedef double real64;');
    });

    it('parses list factory declarations and initializer lists', () => {
        expectSuccess({
            uri: 'file:///path/to/as.predefined',
            content: `
            class int_array {
                // List patterns require a semicolon after the closing brace.
                int_array@ f(int &in) {repeat int};
            }

            class dictionary {
                dictionary@ f(int &in) {repeat {string, ?}};
            }

            class grid {
                grid@ f(int &in) {repeat {repeat_same int}};
            }
            `
        });
    });

    it('parses namespace declarations', () => {
        expectSuccess(`
            namespace A
            {
                void function() { variable++; }
                int variable;
            }
        `);
    });

    it('parses enum casts and enum bitwise expressions', () => {
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
    });

    it('parses not expressions', () => {
        expectSuccess(`bool foo = not true; bool bar = not not false;`);
    });

    it('parses files with a BOM', () => {
        expectSuccess(`\uFEFF // <-- BOM
            void foo() { }`);
    });

    it('rejects an incomplete funcdef', () => {
        expectFailure(`funcdef`);
    });

    it('rejects an incomplete function declaration', () => {
        expectFailure('void foo(');
    });

    it('parses exponential notation', () => {
        expectSuccess(`
            void test() {
                double e0 = 1e10;
                e0 = 1e+10;
                e0 = 1e-10;
                e0 = 1.5e10;
                e0 = 1.5e+10;
                e0 = 1.5e-10;
                e0 = .5e10;
                e0 = .5e+10;
                e0 = .5e-10;
                e0 = 1.E10;
                e0 = 1.E+10;
                e0 = 1.E-10;
            }
        `);
    });
});

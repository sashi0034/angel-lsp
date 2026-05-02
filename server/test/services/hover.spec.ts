import {MarkupContent} from 'vscode-languageserver-types';
import {provideHover} from '../../src/services/hover';
import {inspectFileContents, makeFileContentList} from '../inspectorUtils';
import {CaretMap} from './caretMap';

function expectHoverContains(rawContent: string, expected: string) {
    const fileContentList = makeFileContentList(rawContent);

    const caretMap = new CaretMap();
    caretMap.processFiles(fileContentList);

    const caret = caretMap.get(0);
    const inspector = inspectFileContents(fileContentList);
    const globalScope = inspector.getRecord(caret.uri).analyzerScope.globalScope;

    const hover = provideHover(globalScope, caret.position);
    const value = (hover?.contents as MarkupContent | undefined)?.value;

    if (value === undefined) {
        throw new Error('Expected hover, but got none.');
    }

    if (value.includes(expected) === false) {
        throw new Error(`Expected hover to contain "${expected}", but got:\n${value}`);
    }
}

describe('services/hover', () => {
    it('shows const variable values', () => {
        expectHoverContains(
            `
            const int CONST_VALUE = 3;
            int value = $C0$CONST_VALUE;
            `,
            'const int CONST_VALUE = 3;'
        );
    });

    it('shows const hex numeric literal values', () => {
        expectHoverContains(
            `
            const int CONST_VALUE = 0x2356;
            int value = $C0$CONST_VALUE;
            `,
            'const int CONST_VALUE = 9046;'
        );
    });

    it('shows const binary numeric literal values', () => {
        expectHoverContains(
            `
            const int CONST_VALUE = 0b0101;
            int value = $C0$CONST_VALUE;
            `,
            'const int CONST_VALUE = 5;'
        );
    });

    it('shows const octal numeric literal values', () => {
        expectHoverContains(
            `
            const int CONST_VALUE = 0o123;
            int value = $C0$CONST_VALUE;
            `,
            'const int CONST_VALUE = 83;'
        );
    });

    it('shows const explicit decimal numeric literal values', () => {
        expectHoverContains(
            `
            const int CONST_VALUE = 0d2356;
            int value = $C0$CONST_VALUE;
            `,
            'const int CONST_VALUE = 2356;'
        );
    });

    it('shows evaluated const numeric expressions', () => {
        expectHoverContains(
            `
            const double CONST_VALUE = 12.0 + 3;
            double value = $C0$CONST_VALUE;
            `,
            'const double CONST_VALUE = 15.0;'
        );
    });

    it('expands const variable references in numeric expressions', () => {
        expectHoverContains(
            `
            const int v1 = 23;
            const int v2 = v1 + 4;
            int value = $C0$v2;
            `,
            'const int v2 = 27;'
        );
    });

    it('shows evaluated const bool expressions', () => {
        expectHoverContains(
            `
            const bool CONST_VALUE = !(false || (1 > 2));
            bool value = $C0$CONST_VALUE;
            `,
            'bool CONST_VALUE = true;'
        );
    });

    it('shows evaluated const string concatenation expressions', () => {
        expectHoverContains(
            `
            class string {
                string opAdd(const string &in other) const { return string(); }
            }

            const auto HELLO = "hello";
            const string CONST_VALUE = HELLO + (' ' + "world");
            string value = $C0$CONST_VALUE;
            `,
            'string CONST_VALUE = "hello world";'
        );
    });

    it('trims AngelScript heredoc boundary lines', () => {
        expectHoverContains(
            `
            class string {}

            const string CONST_VALUE = """   
hello
world
            """;
            string value = $C0$CONST_VALUE;
            `,
            'string CONST_VALUE = "hello\\nworld";'
        );
    });

    it('shows enum member values', () => {
        expectHoverContains(
            `
            enum Value {
                A,
                B = 5,
                C
            }

            Value value = Value::$C0$C;
            `,
            'Value C = 6;'
        );
    });

    it('shows evaluated enum member expressions', () => {
        expectHoverContains(
            `
            enum Value {
                A = 12 + 3,
                B
            }

            Value value = Value::$C0$A;
            `,
            'Value A = 15;'
        );
    });

    it('continues implicit enum values after evaluated expressions', () => {
        expectHoverContains(
            `
            enum Value {
                A = 12 + 3,
                B
            }

            Value value = Value::$C0$B;
            `,
            'Value B = 16;'
        );
    });
});

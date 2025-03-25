import {formatFile} from "../src/formatter/formatter";
import {TextDocument} from "vscode-languageserver-textdocument";
import {Inspector} from "../src/inspector/inspector";

function makeVisible(content: string) {
    const lines = content.split(/\r?\n/);
    return lines.map((line, index) => {
        return `${index}: '${line}'`;
    }).join('\n');
}

function getDiffLineNumber(expected: string, actual: string) {
    const expectedLines = expected.split('\n');
    const actualLines = actual.split('\n');
    const diffLines = [];
    for (let i = 0; i < expectedLines.length; i++) {
        if (expectedLines[i] !== actualLines[i]) {
            diffLines.push(i);
        }
    }

    return diffLines;
}

function testFormatter(content: string, expectedContent: string) {
    it(`format ${content}`, () => {
        const inspector = new Inspector();

        const uri = "/foo/bar.as";
        inspector.inspectFile(uri, content);

        inspector.flushRecord();

        const record = inspector.getRecord(uri);

        const textEdits = formatFile(record.content, record.rawTokens, record.ast);
        const document = TextDocument.create(uri, 'angelscript', 0, content);
        const actualContent = TextDocument.applyEdits(document, textEdits);

        if (expectedContent.includes('\t')) {
            expectedContent.replace('\n', '    ');
        }

        const actual = actualContent.trim();
        const expected = expectedContent.trim();

        if (actual !== expected) {
            const difference = `difference: ${getDiffLineNumber(expected, actual)}`;
            const hr = '-----------------------------------------------';
            throw new Error(`${hr} expected\n${makeVisible(actual)}\n${hr} actual\n${makeVisible(expected)}\n${hr}\n${difference}`);
        }
    });
}

describe('Formatter', () => {
    testFormatter(
        /* before */ `
class    Position {
    int x ;    // comment    is    here
    int   y ;
        }

void main ( )  {
        Position pos;
pos.x=1; }
`,
        /* after */ `
class Position {
    int x; // comment    is    here
    int y;
}

void main() {
    Position pos;
    pos.x = 1;
}
`
    );
});



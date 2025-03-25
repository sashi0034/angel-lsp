import {testCompletion} from "./utils";

describe('completion/transitiveInclude', () => {
    testCompletion([{
            uri: 'file:///path/to/file_1.as',
            content: `
            int ThisYear = 2025:
            int GetNextYear() { return ThisYear + 1; }
            `
        }, {
            uri: 'file:///path/to/file_2.as',
            content: `
            #include "file_1.as"
        `
        }, {
            uri: 'file:///path/to/file_3.as',
            content: `// Transitive includes are available.
            #include "file_2.as"
            void main() {
                $C0$
            }
        `
        }], /* $C0$ */ ["ThisYear", "GetNextYear", "main"]
    );

    testCompletion([{
            uri: 'file:///path/to/file_1.as',
            content: `
            #include "file_1.as"
            #include "file_2.as"
            int Alpha = 1;
            `
        }, {
            uri: 'file:///path/to/file_2.as',
            content: `
            #include "file_1.as"
            #include "file_2.as"
            int Beta = 2;
        `
        }, {
            uri: 'file:///path/to/file_3.as',
            content: `// Transitive includes can be cyclic.
            #include "file_1.as"
            void main() {
                $C0$
            }
        `
        }], /* $C0$ */ ["Alpha", "Beta", "main"]
    );
});

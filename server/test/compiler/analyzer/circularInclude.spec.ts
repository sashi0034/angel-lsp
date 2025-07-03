import {expectError, expectSuccess} from "./utils";

describe('analyzer/circularInclude', () => {
    expectSuccess([{
        uri: 'file:///path/to/file_1.as',
        content: `
            #include "file_2.as"
            class File1 { 
            }`
    }, {
        uri: 'file:///path/to/file_2.as',
        content: `// Circular include is allowed.
            #include "file_1.as"
            class File2 : File1 {
            }`
    }]);

    expectError([{
        uri: 'file:///path/to/file_1.as',
        content: `
            #include "file_2.as"
            class File1 { 
            }`
    }, {
        uri: 'file:///path/to/file_2.as',
        content: `// This is an error because the other file is not included.
            // #include "file_1.as"
            class File2 : File1 {
            }`
    }]);
});
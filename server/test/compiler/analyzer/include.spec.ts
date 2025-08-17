import {expectError, expectSuccess} from "./utils";

describe('analyzer/include', () => {
    expectSuccess([{
        uri: 'file:///path/to/file_1.as',
        content: `
            class File1 {
            }`
    }, {
        uri: 'file:///path/to/file_2.as',
        content: `// Include is allowed.
            #include "file_1.as"
            class File2 : File1 {
            }`
    }]);

    expectError([{
        uri: 'file:///path/to/file_1.as',
        content: `
            class File1 { 
            }`
    }, {
        uri: 'file:///path/to/file_2.as',
        content: `// This is an error because the other file is not included.
            #include "file_3.as"
            class File2 : File1 {
            }`
    }]);
});
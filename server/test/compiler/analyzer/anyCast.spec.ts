import {expectSuccess} from "./utils";

describe('analyzer/anyCast', () => {
    expectSuccess([{
        uri: 'file:///path/to/as.predefined',
        content: `
            void throw(?& in something) {
            }
            `
    }, {
        uri: 'file:///path/to/file.as',
        content: `// '?' is a type that can be used to throw any value.
            int fn() { return 1; }
        
            int main() {
                throw(fn());
            
                throw(@fn);
            }`
    }]);
});
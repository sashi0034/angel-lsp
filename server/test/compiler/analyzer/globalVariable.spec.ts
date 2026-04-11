import {expectSuccess} from './utils';

describe('analyzer/globalVariable', () => {
    it("accepts: Global variables can be defined with initializers.", () => {
        expectSuccess(`// Global variables can be defined with initializers.
            int foo(bar + 456); // This is not function declaration!

            int bar = 123;
        `);
    });
});

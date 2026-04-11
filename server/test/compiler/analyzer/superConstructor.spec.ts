import {expectError, expectSuccess} from './utils';

describe('analyzer/superConstructor', () => {
    it("accepts: Default super constructor is available.", () => {
        expectSuccess(`// Default super constructor is available.
            class Base { }

            class Derived : Base {
                Derived() { super(); }
            }
        `);
    });

    it("rejects: Cannot call super constructor in a non-constructor function.", () => {
        expectError(`// Cannot call super constructor in a non-constructor function.
            class Base { }

            class Derived : Base {
                void fn() { super(); }
            }
        `);
    });
});

import {expectError, expectSuccess} from "./utils";

describe('analyzer/superConstructor', () => {
    expectSuccess(`// Default super constructor is available.
        class Base { }
        
        class Derived : Base {
            Derived() { super(); }
        }
    `);

    expectError(`// Cannot call super constructor in a non-constructor function.
        class Base { }
        
        class Derived : Base {
            void fn() { super(); }
        }
    `);
});
import {expectError, expectSuccess} from "./utils";

describe("analyzer/namedArguments", () => {
    expectSuccess(`
        class B { }
        class C { }

        void foo(int a, B b = B(), C c = C(), bool d = false, double e = 0) { }
        
        void main() {
            foo(1, e: 2.0, b: B(), d: true);
        }
    `);

    expectError(`
        class B { }
        class C { }

        void foo(int a, B b = B(), C c = C(), bool d = false, double e = 0) { }
        
        void main() {
            foo(e: 2.0, 1, b: B(), d: true); // Positional arguments cannot be passed after named arguments
        }
    `);
});
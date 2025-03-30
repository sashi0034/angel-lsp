import {testDefinition} from "./utils";

describe('definition/namedArguments', () => {
    testDefinition(`
        class B { }
        class C { }

        void foo(int a, B b$C0$ = B(), C c = C(), bool d = false, double e = 0) { }

        void main() {
            foo(1, e: 2.0, b$C1$: B(), d: true);
        }
    `);
});
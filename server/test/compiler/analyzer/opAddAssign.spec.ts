import {expectError, expectSuccess} from "./utils";

describe("analyzer/opAddAssign", () => {
    // opAddAssign is defined
    expectSuccess(`
        class Foo {
            int opAddAssign(Foo foo) { return 0; }
        }

        void main() {
            Foo foo;
            foo += foo;
        }
    `);

    // opAddAssign is not defined
    expectError(`
        class Foo {
            int bar;
        }

        void main() {
            Foo foo;
            foo += foo;
        }
    `);
});
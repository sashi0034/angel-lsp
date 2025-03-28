import {expectError, expectSuccess} from "./utils";

describe("analyzer/opAddAssign", () => {
    expectSuccess(`// opAddAssign is defined
        class Foo {
            int opAddAssign(Foo foo) { return 0; }
        }

        void main() {
            Foo foo;
            foo += foo;
        }
    `);

    expectError(`// opAddAssign is not defined
        class Foo {
            int bar;
        }

        void main() {
            Foo foo;
            foo += foo;
        }
    `);
});
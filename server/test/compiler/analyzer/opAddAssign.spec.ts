import {expectError, expectSuccess} from './utils';

describe('analyzer/opAddAssign', () => {
    it("accepts: opAddAssign is defined", () => {
        expectSuccess(`// opAddAssign is defined
            class Foo {
                int opAddAssign(Foo foo) { return 0; }
            }

            void main() {
                Foo foo;
                foo += foo;
            }
        `);
    });

    it("rejects: opAddAssign is not defined", () => {
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
});

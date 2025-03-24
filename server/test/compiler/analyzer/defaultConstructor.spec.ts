import {expectError, expectSuccess} from "./utils";

describe("analyzer/defaultConstructor", () => {
    expectSuccess(`
        class A { int m; }
        A g_a();
        void main() {
            A a();
        }
    `);

    expectError(`
        class A { int m; }
        void main() {
            A a = A(A());
        }
    `);

    expectSuccess(`
        enum Kind { A, B, C }
        void main() {
            int number = int(1); Kind kind = Kind(1); bool flag = bool(true);
        }
    `);

    expectError(`
        enum Kind { A, B, C }
        void main() {
            int number = int(1, 1); Kind kind = Kind(); bool flag = bool();
        }
    `);
});

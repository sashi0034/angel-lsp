import {expectError, expectSuccess} from './utils';

describe('analyzer/namedArguments', () => {
    it('accepts analyzer case 1', () => {
        expectSuccess(`
            class B { }
            class C { }

            void foo(int a, B b = B(), C c = C(), bool d = false, double e = 0) { }

            void main() {
                foo(1, e: 2.0, b: B(), d: true);
            }
        `);
    });

    it("rejects: Positional arguments cannot be passed after named arguments", () => {
        expectError(`
            class B { }
            class C { }

            void foo(int a, B b = B(), C c = C(), bool d = false, double e = 0) { }

            void main() {
                foo(e: 2.0, 1, b: B(), d: true); // Positional arguments cannot be passed after named arguments
            }
        `);
    });

    it('rejects: required parameters before named arguments must be provided', () => {
        expectError(`
            void foo(int a, int b) { }

            void main() {
                foo(b: 1);
            }
        `);
    });
});

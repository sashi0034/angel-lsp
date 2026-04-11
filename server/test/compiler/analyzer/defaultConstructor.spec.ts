import {expectError, expectSuccess} from './utils';

describe('analyzer/defaultConstructor', () => {
    it('accepts analyzer case 1', () => {
        expectSuccess(`
            class A { int m; }
            A g_a();
            void main() {
                A a();
            }
        `);
    });

    it('rejects analyzer case 2', () => {
        expectError(`
            class A { int m; }
            void main() {
                A a = A(A());
            }
        `);
    });

    it('accepts analyzer case 3', () => {
        expectSuccess(`
            enum Kind { A, B, C }
            void main() {
                int number = int(1); Kind kind = Kind(1); bool flag = bool(true);
            }
        `);
    });

    it('rejects analyzer case 4', () => {
        expectError(`
            enum Kind { A, B, C }
            void main() {
                int number = int(1, 1); Kind kind = Kind(); bool flag = bool();
            }
        `);
    });
});

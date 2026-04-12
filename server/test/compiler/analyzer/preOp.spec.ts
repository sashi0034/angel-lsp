import {expectError, expectSuccess} from './utils';

describe('analyzer/preOp', () => {
    it('accepts: primitive prefix operators', () => {
        expectSuccess(`// primitive prefix operators
            enum E { A = 1 }

            void main() {
                int i = 1;
                bool b = false;
                E e = A;

                int a = -i;
                int b2 = +i;
                int c = ~i;
                bool d = !b;
                bool e2 = not b;
                ++i;
                --i;
                int f = -e;
                int g = +e;
                int h = ~e;
            }
        `);
    });

    it('accepts: overloadable prefix operators', () => {
        expectSuccess(`// overloadable prefix operators
            class Foo {
                Foo opNeg() const { return Foo(); }
                Foo opCom() const { return Foo(); }
                Foo opPreInc() { return Foo(); }
                Foo opPreDec() { return Foo(); }
            }

            void main() {
                Foo foo;
                Foo neg = -foo;
                Foo com = ~foo;
                Foo inc = ++foo;
                Foo dec = --foo;
            }
        `);
    });

    it('rejects: missing prefix operator overload', () => {
        expectError(`// missing prefix operator overload
            class Foo {}

            void main() {
                Foo foo;
                Foo neg = -foo;
            }
        `);
    });

    it('rejects: non-overloadable prefix operators on classes', () => {
        expectError(`// non-overloadable prefix operators on classes
            class Foo {
                bool opImplConv() const { return true; }
            }

            void main() {
                Foo foo;
                bool b = !foo;
            }
        `);
    });

    it('rejects: increment and decrement on enums', () => {
        expectError(`// increment and decrement on enums
            enum E { A = 1 }

            void main() {
                E e = A;
                ++e;
            }
        `);
    });
});

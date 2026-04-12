import {testDefinition} from './utils';

describe('definition/preOp', () => {
    it('resolves a prefix operator overload', () => {
        testDefinition(`
            class Foo {
                Foo opNeg$C0$() const { return Foo(); }
            }

            void main() {
                Foo foo;
                Foo neg = $C1$-foo;
            }`);
    });

    it('resolves a prefix increment overload', () => {
        testDefinition(`
            class Foo {
                Foo opPreInc$C0$() { return Foo(); }
            }

            void main() {
                Foo foo;
                Foo inc = $C1$++foo;
            }`);
    });
});

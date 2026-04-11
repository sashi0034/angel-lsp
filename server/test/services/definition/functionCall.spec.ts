import {testDefinition} from './utils';

describe('definition/functionCall', () => {
    it('resolves a recursive function call', () => {
        testDefinition(`
            int sum$C0$(int v) {
                if (v == 0) return 0;
                return v + sum$C1$(v - 1;)
            }`);
    });

    it('resolves parameter references', () => {
        testDefinition(`
            int sum(int v$C0$) {
                if (v == 0) return 0;
                return v$C1$ + sum(v$C2$ - 1;)
            }`);
    });

    it('resolves a field reference from an instance member access', () => {
        testDefinition(`
            class Foo {
                int value$C0$;

                int add(int v) { return v + value; }
            }

            void main() {
                Foo foo;
                foo.value$C1$ = 2;
            }`);
    });
});

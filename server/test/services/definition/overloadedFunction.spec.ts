import {testDefinition} from './utils';

describe('definition/overloadedFunction', () => {
    it('resolves an int overload', () => {
        testDefinition(`
            void ovl_fn$C0$(int a, int b) { }
            void ovl_fn(float a, float b) { }
            void ovl_fn(double a, double b) { }
            void main() { ovl_fn$C1$(1, 2); }`);
    });

    it('resolves a float overload', () => {
        testDefinition(`
            void ovl_fn(int a, int b) { }
            void ovl_fn$C0$(float a, float b) { }
            void ovl_fn(double a, double b) { }
            void main() { ovl_fn$C1$(1.1f, 2.1f); }`);
    });

    it('resolves a double overload', () => {
        testDefinition(`
            void ovl_fn(int a, int b) { }
            void ovl_fn(float a, float b) { }
            void ovl_fn$C0$(double a, double b) { }
            void main() { ovl_fn$C1$(1.2, 2.2); }`);
    });
});

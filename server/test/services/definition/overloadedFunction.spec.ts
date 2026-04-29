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

    it('resolves the mutable handle overload before const handle conversion', () => {
        testDefinition(`
            class Base {}
            class Derived : Base {}

            int pick(const Base@ value) { return 0; }
            bool pick$C0$(Base@ value) { return true; }

            void main() {
                Derived@ value = Derived();
                bool selected = pick$C1$(value);
            }`);
    });

    it('resolves the const object overload before mutable copy conversion', () => {
        testDefinition(`
            class Obj {}

            int pick(Obj &in value) { return 0; }
            bool pick$C0$(const Obj &in value) { return true; }

            void main() {
                const Obj value;
                bool selected = pick$C1$(value);
            }`);
    });

    it('resolves the mutable overload after object conversion', () => {
        testDefinition(`
            class Target {}
            class Source {
                Target opImplConv() { return Target(); }
            }

            int pick(const Target &in value) { return 0; }
            bool pick$C0$(Target &in value) { return true; }

            void main() {
                Source value;
                bool selected = pick$C1$(value);
            }`);
    });

    it('resolves the const primitive overload for a const primitive argument', () => {
        testDefinition(`
            int pick(int value) { return 0; }
            bool pick$C0$(const int value) { return true; }

            void main() {
                const int value = 1;
                bool selected = pick$C1$(value);
            }`);
    });

    it('resolves the mutable primitive overload for a mutable primitive argument', () => {
        testDefinition(`
            int pick(const int value) { return 0; }
            bool pick$C0$(int value) { return true; }

            void main() {
                int value = 1;
                bool selected = pick$C1$(value);
            }`);
    });
});

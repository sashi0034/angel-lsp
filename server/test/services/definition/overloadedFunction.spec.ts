import {testDefinition} from "./utils";

describe('definition/overloadedFunction', () => {
    testDefinition(`
        void ovl_fn$C0$(int a, int b) { }
        void ovl_fn(float a, float b) { }
        void ovl_fn(double a, double b) { }
        void main() { ovl_fn$C1$(1, 2); }`
    );

    testDefinition(`
        void ovl_fn(int a, int b) { }
        void ovl_fn$C0$(float a, float b) { }
        void ovl_fn(double a, double b) { }
        void main() { ovl_fn$C1$(1.1f, 2.1f); }`
    );

    testDefinition(`
        void ovl_fn(int a, int b) { }
        void ovl_fn(float a, float b) { }
        void ovl_fn$C0$(double a, double b) { }
        void main() { ovl_fn$C1$(1.2, 2.2); }`
    );
});
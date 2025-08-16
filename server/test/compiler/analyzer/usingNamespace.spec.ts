import {expectSuccess} from "./utils";

describe('analyzer/usingNamespace', () => {
    expectSuccess(`// 'using namespace' is available.
        namespace A {
            void fn_a() {
            }
        }
        
        namespace A {
            namespace B {
                void fn_b() {
                }
            }
        }
        
        void main() {
            using namespace A;
            fn_a();
        
            B::fn_b();
        
            using namespace A::B;
            fn_b();
        }
    `);

    expectSuccess(`// 'using namespace' can be hoisted in the global scope.
        namespace D {
            int getData() {
                return 42;
            }
        }
        
        namespace A {
            class B {
                void method() {
                    int value = getData();
                }
            }
        }
        
        namespace A {
            using namespace D;
        }
    `);
});

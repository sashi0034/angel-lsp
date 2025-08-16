import {expectError, expectSuccess} from "./utils";

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

    expectSuccess([{
        uri: 'file:///path/to/file_1.as',
        content: `
            namespace A {
                using namespace B;
            }`
    }, {
        uri: 'file:///path/to/file_2.as',
        content: `// This is an error because the other file is not included.
            #include "file_1.as"
            
            namespace A::B {
                void fn_a_b();
            }
            `
    }, {
        uri: 'file:///path/to/file_3.as',
        content: `// Include 'using namespace' from another file.
            #include "file_2.as"
            namespace A {
                void a() {
                    fn_a_b();
                }
            }`
    }]);
});

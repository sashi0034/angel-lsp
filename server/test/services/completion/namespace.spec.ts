import {testCompletion} from "./utils";

describe('completion/namespace', () => {
    testCompletion(`// Nested namespace completion
        namespace foo {
            namespace bar {
                void call_baz() { }
            }
            
            void call_foo() { }
        }
        
        void main() {
            foo::$C0$
        }
    `, ["bar", "call_foo"]
    );

    testCompletion(`// Nested nested namespace completion
        namespace foo {
            namespace bar {
                void call_baz() { }
            }
            
            void call_foo() { }
        }
        
        void main() {
            foo::bar::$C0$
        }
    `, ["call_baz"]
    );

    testCompletion(`// Completion is possible even if the namespace is defined in multiple places.
        class A {
            void apple();
        }
        
        namespace A {
            namespace B {
                void beta_0() { }
                
                namespace C_0 { int c_0; }
            }

            void alpha_0() { }
        }
        
        namespace A {
            namespace B {
                void beta_1() { }
                
                namespace C_1 { int c_1; }
            }

            void alpha_1() { }
        }
        
        void main() {
            A::$C0$B::$C1$ int value; // We want to complement even though it is invalid syntax.
            
            A a;
            a.$C2$
        }`
        , /* $C0$ */ ["B", "alpha_0", "alpha_1"]
        , /* $C1$ */ ["beta_0", "beta_1", "C_0", "C_1"]
        , /* $C2$ */ ["apple"]
    );

    testCompletion([{
            uri: 'file:///path/to/as.predefined',
            content: `
            namespace A {
                namespace B {
                    void predefined_function();
                }

                namespace C_0 { void a(); }
            }`
        }, {
            uri: 'file:///path/to/file_1.as',
            content: `
            namespace A {
                namespace B {
                    void other_file_function();
                }

                namespace C_1 { void a(); }
            }
        `
        }, {
            uri: 'file:///path/to/file_2.as',
            content: `// Compression of other files is also possible
            #include "file_1.as"
            
            void main() {
                A::$C0$;
                A::B::$C1$;
            }
        `
        }], /* $C0$ */ ["B", "C_0", "C_1"]
        , /* $C1$ */ ["predefined_function", "other_file_function"]
    );

    testCompletion(
        `// Class inheritance completion
        namespace foo {
            namespace bar {
                class Baz { }
            }
            
            class Bar : bar::$C0$ { 
            }
        }
        
        class Foo : foo::bar::$C1$ { 
        }`
        , /* $C0$ */ ["Baz"]
        , /* $C1$ */ ["Baz"]
    );
});

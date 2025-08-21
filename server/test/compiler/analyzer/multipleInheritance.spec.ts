import {expectSuccess} from "./utils";

describe('analyzer/multipleInheritance', () => {
    expectSuccess([{
        uri: 'file:///path/to/file_a.as',
        content: `
            class A {}
            `
    }, {
        uri: 'file:///path/to/file_b.as',
        content: `
            #include "file_a.as"
            class B : A { 
                int b;
                int get_b() { return b; }
                int get_b(int b2) { return b; }
            }
            `
    }, {
        uri: 'file:///path/to/file_c.as',
        content: `
            #include "file_b.as"
            class C : B { }
            `
    }, {
        uri: 'file:///path/to/file_d.as',
        content: `
            #include "file_c.as"
            class D : C { 
                int d;
            }
            `
    }, {
        uri: 'file:///path/to/file_e.as',
        content: `// Inherited class members with multiple files. (#205)
            #include "file_d.as"
            class E : D {
                int test(E other) {
                    return b + get_b() + d + 
                        other.b + other.get_b() + other.d;
                }
            }
            `
    }]);
});
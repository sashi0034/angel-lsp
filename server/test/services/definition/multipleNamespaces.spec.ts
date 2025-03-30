import {testDefinition} from "./utils";

describe('definition/multipleNamespaces', () => {
    testDefinition([{
        uri: 'file:///path/to/file_0.as',
        content: `
            namespace A$C0$ {
                void fn_0() { }
            }
        `
    }, {
        uri: 'file:///path/to/file_1.as',
        content: `// Jump to the most appropriate namespace
            #include "file_0.as"
            namespace A {
                void fn_1() { }
            }
            
            void main() {
                A$C1$::fn_0();
            }
        `
    }]);

    testDefinition([{
        uri: 'file:///path/to/file_0.as',
        content: `// Jump to the most appropriate namespace
            namespace A {
                void fn_0() { }
            }
        `
    }, {
        uri: 'file:///path/to/file_1.as',
        content: `
            #include "file_0.as"
            namespace A$C0$ {
                void fn_1() { }
            }
            
            void main() {
                A$C1$::fn_1();
            }
        `
    }]);

    testDefinition(`// Jump to the most appropriate namespace
        namespace A$C0$ {
            namespace B$C1$ {
                namespace C_0$C2$ { int c_0$C3$; }
            }
        }
        
        namespace A$C4$ {
            namespace B$C5$ {
                namespace C_1$C6$ { int c_1$C7$; }
            }
        }
        
        enum A$C8$ { Red$C9$ }
        
        void main() {
            A$C10$ :: B$C11$ :: C_0$C12$ :: c_0$C13$ = 1;
            A$C14$ :: B$C15$ :: C_1$C16$ :: c_1$C17$ = 2;
            int v = A$C18$ :: Red$C19$;
        }
    `, [[10, 0], [11, 1], [12, 2], [13, 3], [14, 4], [15, 5], [16, 6], [17, 7], [18, 8], [19, 9]]
        // This mapping is an array of pairs of caret positions in the format [(from), (to)]
    );
});
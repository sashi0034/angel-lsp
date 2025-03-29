import {expectError, expectSuccess} from "./utils";

describe('analyzer/namespaceAccess', () => {
    expectSuccess(`// Select the most appropriate scope for namespace access
        namespace A {
            namespace B {
                void fn_a_b() {
                    B::fn_a_b();
                    B::fn_b();
                };
            }
        }

        namespace B {
            void fn_b() {
                A::B::fn_a_b();
                A::fn_b_a();
            };

            namespace A {
                void fn_b_a(){
                    B::fn_b();
                }
            }
        }
    `);

    expectError(`// The first matching result is used to resolve namespace access.
        namespace A {
            namespace B {
                void fn() {
                    B::fn(1, 2); // Error: This is A::B::fn()
                };
            }
        }

        namespace B {
            void fn(int x, int y) { };
        }
    `);
});


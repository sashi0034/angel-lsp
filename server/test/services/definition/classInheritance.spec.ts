import {testDefinition} from "./utils";

describe('definition/classInheritance', () => {
    testDefinition(`// The definition of 'super' is the constructor of the base class.
        class Base {
            Base() { }
            Base$C0$(int x, int y) { }
        }
        
        class Derived : Base {
            Derived() {
                super$C1$(1, 2); 
            }
        }
    `);

    testDefinition(`// The definition source of a namespaced class inheritance
         namespace foo {
            namespace bar {
                class Baz$C0$ { }
            }
        }
        
        class Foo : foo::bar::Baz$C1$ { 
        }
    `);
});
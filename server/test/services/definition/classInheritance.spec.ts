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
});
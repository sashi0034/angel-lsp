import {testDefinition} from "./utils";

describe('definition/constructor', () => {
    testDefinition(` // Bug reported in #232
        class MyClass {
            MyClass(int value) { }
        }
        
        void main () {
            MyClass myClass$C0$$C1$(1, 2);
        }
    `);
});
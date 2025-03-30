import {testDefinition} from "./utils";

describe('definition/instanceMember', () => {
    testDefinition(`
        class Foo {
            int value$C0$;
        
            int add(int v) { return v + value; }
        }

        void main() {
            Foo foo;
            foo.value$C1$ = 2;
        }`
    );
});
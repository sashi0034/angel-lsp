import {expectSuccess} from "./utils";

describe('analyzer/classConstructor', () => {
    expectSuccess(`// Do not confuse type declarations with constructors (#159)
        class B { B() { } }
        
        class C : B{
            B@ _b;
            C@ _c;
        
            C() { }
            
            void receive(B@ b, C@ c) {
                B@ b2 = b;
                C@ c2 = c;
                _b = b;
                _c = c;
            }
        }
    `);
});



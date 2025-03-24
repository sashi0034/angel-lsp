import {testCompletion} from "./utils";

describe('completion/function', () => {
    testCompletion(`// Basic function completion
        void foo() { 
            int x = 1; 
        }
        
        void bar() {
            int y = 1;
            while (y < 10) {
                $C0$
            }
        }    
        `, ["foo", "bar", "y"]
    );
});

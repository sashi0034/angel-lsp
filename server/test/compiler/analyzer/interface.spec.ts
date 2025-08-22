import {expectError, expectSuccess} from "./utils";

describe('analyzer/interface', () => {
    expectSuccess(`// Interfaces can have functions.
        funcdef int my_funcdef(float);

        int my_function(float f) { return f; }
    
        interface IEvent {
            int get();
            int get(int a);
            int get(int a, int b);
            int get(my_funcdef@ value);
        }
        
        int get(IEvent@ e) {
            int t;
            t += e.get();
            t += e.get(1);
            t += e.get(1, 2);
            t += e.get(@my_function);
        }
    `);

    expectError(`
        interface IEvent {
            int get();
            int get(int a, int b);
        }
        
        int get(IEvent@ e) {
            int t;
            t += e.get(1); // Error: No matching function found for get(int)
        }
    `);
});
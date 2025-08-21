import {testDefinition} from "./utils";

describe('definition/funcdef', () => {
    testDefinition(`
        funcdef void my_funcdef();
        
        void my_function$C0$() { }
        
        void my_function(float a) { }
        
        void main() {
            auto t = @my_funcdef(my_function$C1$);
        }
    `);

    testDefinition(`
        funcdef void my_funcdef(float, int);
        
        void my_function() { }
        
        void my_function$C0$(float a, int b) { }
        
        void main() {
            auto t = @my_funcdef(my_function$C1$);
        }
    `);

    testDefinition(`
        funcdef void my_funcdef$C0$(float);
        
        void my_function() { }
        
        void my_function(float a) { }
        
        void main() {
            auto t = @my_funcdef$C1$(my_function);
        }
    `);

    testDefinition(`
        funcdef void my_funcdef(float);
        
        void my_function() { }
        
        void my_function$C0$(float input) { }
        
        class MyClass {
            MyClass(my_funcdef@ value) { }
        }
        
        void main () {
            auto t = @my_funcdef(my_function);
            MyClass(t);
            MyClass(my_function$C1$);
        }
    `);
});
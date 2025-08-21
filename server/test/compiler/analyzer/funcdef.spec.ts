import {expectError, expectSuccess} from "./utils";

describe('analyzer/funcdef', () => {
    expectSuccess(`// Resolve function overloads with funcdef
        funcdef void my_funcdef(float);
        
        void my_function() { }
        
        void my_function(float input) { }
        
        class MyClass {
            MyClass(my_funcdef@ value) { }
        }
        
        void main () {
            auto t = @my_funcdef(my_function);
            MyClass(t);
            MyClass(my_function);
        }
    `);

    expectError(`// No suitable overload found for funcdef
        funcdef void my_funcdef(float);
        
        void my_function() { }
        
        void my_function(float input, int other) { }
        
        class MyClass {
            MyClass(my_funcdef@ value) { }
        }
        
        void main () {
            auto t = @my_funcdef(my_function);
            MyClass(t);
            MyClass(my_function);
        }
    `);
});



import {testDefinition} from './utils';

describe('definition/funcdef', () => {
    it('resolves a function used as a funcdef target', () => {
        testDefinition(`
            funcdef void my_funcdef();

            void my_function$C0$() { }

            void my_function(float a) { }

            void main() {
                auto t = @my_funcdef(my_function$C1$);
            }
        `);
    });

    it('resolves the overload matching a funcdef signature', () => {
        testDefinition(`
            funcdef void my_funcdef(float, int);

            void my_function() { }

            void my_function$C0$(float a, int b) { }

            void main() {
                auto t = @my_funcdef(my_function$C1$);
            }
        `);
    });

    it('resolves a funcdef type reference', () => {
        testDefinition(`
            funcdef void my_funcdef$C0$(float);

            void my_function() { }

            void my_function(float a) { }

            void main() {
                auto t = @my_funcdef$C1$(my_function);
            }
        `);
    });

    it('resolves a function passed to a funcdef constructor argument', () => {
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

    it('resolves an auto funcdef handle variable at its declaration', () => {
        testDefinition(`
            funcdef void callback_f();
            
            void ignore(callback_f@ f) { }
            
            void do_nothing() { }
            
            auto my_f$C0$$C1$ = callback_f(@do_nothing);
        `);
    });

    it('resolves a function passed to a parameter of a funcdef type', () => {
        testDefinition(`
            funcdef void callback_t(int);

            void registerCallback(callback_t c) {
            }

            class Main {
                void main() {
                    registerCallback(callback$C1$);
                }
            }

            void callback$C0$(int v) { }
        `);
    });

    it('resolves a function passed to a parameter whose type is unresolved', () => {
        testDefinition(`
            funcdef void callback_t(int);

            void registerCallback(undefined_type c) {
            }

            class Main {
                void main() {
                    registerCallback(callback$C1$);
                }
            }

            void callback$C0$(int v) { }
        `);
    });

    it('resolves an auto funcdef handle variable after it is used as an argument', () => {
        testDefinition(`
            funcdef void callback_f();
            
            void ignore(callback_f@ f) { }
            
            void do_nothing() { }
            
            auto my_f$C0$$C1$ = callback_f(@do_nothing);
            
            void f() {
               ignore(my_f$C2$);
            }
        `);
    });
});

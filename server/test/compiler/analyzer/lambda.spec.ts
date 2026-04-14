import {expectError, expectSuccess} from './utils';

describe('analyzer/lambda', () => {
    it('accepts lambdas assigned to funcdef handles', () => {
        expectSuccess(`
            funcdef int BinaryOp(int a, int b);

            void main() {
                BinaryOp@ op1 = function(int a, int b) {
                    return a + b;
                };

                BinaryOp@ op2 = function(int a, int b) {
                    return a - b;
                };

                int value = op1(1, 2) * op2(3, 4);
            }
        `);
    });

    it('accepts lambdas inferred from funcdef handles', () => {
        expectSuccess(`
            funcdef int BinaryOp(int a, int b);

            void main() {
                BinaryOp@ op = function(a, b) {
                    return a + b;
                };

                int value = op(1, 2);
            }
        `);
    });

    it('accepts lambdas inferred from function parameters', () => {
        expectSuccess(`
            funcdef int UnaryOp(int value);

            int call(UnaryOp@ op) {
                return op(2);
            }

            void main() {
                int value = call(function(value) {
                    return value + 1;
                });
            }
        `);
    });

    it('accepts lambdas inferred after overloads are filtered by argument count', () => {
        expectSuccess(`
            funcdef void Callback1(float value);
            funcdef void Callback2(int value);

            void fn(Callback1@ callback) { }
            void fn(int value, Callback2@ callback) { }

            void main() {
                fn(1, function(value) {
                    int result = value + 1;
                });
            }
        `);
    });

    it('rejects lambdas when multiple overloads can provide the funcdef type', () => {
        expectError(`
            funcdef void Callback1(int value);
            funcdef void Callback2(float value);

            void fn(Callback1@ callback) { }
            void fn(Callback2@ callback) { }

            void main() {
                fn(function(value) { });
            }
        `);
    });

    it('rejects lambdas with incompatible funcdef parameters', () => {
        expectError(`
            funcdef int BinaryOp(int a, int b);

            void main() {
                BinaryOp@ op = function(int value) {
                    return value;
                };
            }
        `);
    });

    // TODO
    // it('rejects lambdas with incompatible funcdef return types', () => {
    //     expectError(`
    //         funcdef int Predicate(int value);
    //
    //         void main() {
    //             Predicate@ cb = function(int value) {
    //                 return value > 0;
    //             };
    //         }
    //     `);
    // });

    // TODO
    // it('rejects lambdas with inconsistent return types', () => {
    //     expectError(`
    //         funcdef int UnaryOp(int value);
    //
    //         void main() {
    //             UnaryOp@ cb = function(int value) {
    //                 if (value > 0) {
    //                     return value;
    //                 }
    //
    //                 return true;
    //             };
    //         }
    //     `);
    // });

    // it('rejects auto variables initialized by lambdas', () => {
    //     expectError(`
    //         void main() {
    //             auto cb = function(int value) {
    //                 return value;
    //             };
    //         }
    //     `);
    // });

    it('accepts lambdas that return the correct type', () => {
        expectSuccess(`
            class Obj { }

            funcdef Obj@ callback_f(int v);

            void main() {
                callback_f@ cb = function(int v) {
                    return Obj();
                };
            }
        `);
    });
});

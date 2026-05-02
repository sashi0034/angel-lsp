import {expectError, expectSuccess} from './utils';

describe('analyzer/overloadAmbiguity', () => {
    it('rejects: ambiguous overload between two equally-good size-down conversions.', () => {
        // 'int -> int8' and 'int -> int16' both use PrimitiveSizeDownConv,
        // so the call is ambiguous and AngelScript reports an error.
        expectError(`// ambiguous overload between two equally-good size-down conversions.
            void foo(int8 v) { }
            void foo(int16 v) { }

            void main() {
                int x = 1;
                foo(x);
            }
        `);
    });

    it('rejects: ambiguous overload between float and double for an int argument.', () => {
        expectError(`// ambiguous overload between float and double for an int argument.
            void foo(float v) { }
            void foo(double v) { }

            void main() {
                int x = 1;
                foo(x);
            }
        `);
    });

    it('accepts: exact match wins over an equal-cost alternative.', () => {
        expectSuccess(`// exact match wins over an equal-cost alternative.
            void foo(int v) { }
            void foo(uint v) { }

            void main() {
                int x = 1;
                foo(x);
            }
        `);
    });

    it('accepts: single-overload calls remain valid.', () => {
        expectSuccess(`// single-overload calls remain valid.
            void foo(int v) { }

            void main() {
                int8 x = 1;
                foo(x);
            }
        `);
    });
});

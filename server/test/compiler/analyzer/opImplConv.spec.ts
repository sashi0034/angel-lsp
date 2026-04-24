import {expectSuccess} from './utils';

describe('analyzer/opImplConv', () => {
    // Implicit bool conversion in Logic operators
    it('accepts: opImplConv is allowed when one of the operands is explicitly boolean.', () => {
        expectSuccess(`// opImplConv is allowed when one of the operands is explicitly boolean.
            class flag { bool opImplConv() const { return true; } }
            void main() {
                flag f;
                if (f && bool(f)) { }
            }
        `);
    });

    it('accepts: opImplConv overloads can differ only by return type.', () => {
        expectSuccess(`// opImplConv overloads can differ only by return type.
            class number_t {
                int64 opImplConv() const { return 42; }
                double opImplConv() const { return 3.5; }
            }
        `);
    });

    // expectError(`// One of the operands must be explicitly boolean.
    //     class flag { bool opImplConv() const { return true; } }
    //     void main() {
    //         flag f;
    //         if (f && f) { }
    //     }
    // `);
});

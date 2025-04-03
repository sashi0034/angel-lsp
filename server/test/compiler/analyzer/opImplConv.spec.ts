import {expectError, expectSuccess} from "./utils";

describe('analyzer/opImplConv', () => {
    // Implicit bool conversion in Logic operators
    expectSuccess(`// opImplConv is allowed when one of the operands is explicitly boolean.
        class flag { bool opImplConv() const { return true; } }      
        void main() {
            flag f;
            if (f && bool(f)) { }
        }
    `);

    // expectError(`// One of the operands must be explicitly boolean.
    //     class flag { bool opImplConv() const { return true; } }
    //     void main() {
    //         flag f;
    //         if (f && f) { }
    //     }
    // `);
});

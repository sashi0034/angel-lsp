import {expectError, expectSuccess} from './utils';

describe('analyzer/functionArguments', () => {
    it('accepts: Function arguments can have the same name as their type.', () => {
        expectSuccess(`// Function arguments can have the same name as their type.
            class button { }

            button get_button(button button, button other) {
                return button;
            }
        `);
    });

    it('accepts: void can be passed to output reference parameters to discard the result.', () => {
        expectSuccess(`// void can be passed to output reference parameters to discard the result.
            void GetValues(int&out Int1, int&out Int2) { }

            void main() {
                int Int1;
                GetValues(Int1, void);
            }
        `);
    });

    it('accepts: output reference parameters can use void as the default argument.', () => {
        expectSuccess(`// output reference parameters can use void as the default argument.
            void GetValues(int&out Int1, int&out Int2 = void) { }

            void main() {
                int Int1;
                GetValues(Int1);
                GetValues(Int1, void);
            }
        `);
    });

    it('rejects: void cannot be passed to value parameters.', () => {
        expectError(`// void cannot be passed to value parameters.
            void TakeValue(int value) { }

            void main() {
                TakeValue(void);
            }
        `);
    });

    it('rejects: void cannot be passed to input reference parameters.', () => {
        expectError(`// void cannot be passed to input reference parameters.
            void TakeIn(int&in value) { }

            void main() {
                TakeIn(void);
            }
        `);
    });

    it('rejects: value parameters cannot use void as the default argument.', () => {
        expectError(`// value parameters cannot use void as the default argument.
            void TakeValue(int value = void) { }
        `);
    });

    it('rejects: input reference parameters cannot use void as the default argument.', () => {
        expectError(`// input reference parameters cannot use void as the default argument.
            void TakeIn(int&in value = void) { }
        `);
    });
});

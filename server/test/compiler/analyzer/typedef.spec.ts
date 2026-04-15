import {expectError, expectSuccess} from './utils';

describe('analyzer/typedef', () => {
    it('accepts: Primitive typedefs can be used as normal type names.', () => {
        expectSuccess(`// Primitive typedefs can be used as normal type names.
            typedef int user_id;

            user_id current_user;

            user_id get_user_id(user_id id) {
                return id;
            }
        `);
    });

    it('accepts: Function declarations can use typedefs declared later.', () => {
        expectSuccess(`// Function declarations can use typedefs declared later.
            real64 normalize(real64 value) {
                return value;
            }

            typedef double real64;
        `);
    });

    it('accepts: Typedefs can be used to create aliases for complex types.', () => {
        expectSuccess(`// Typedefs can be used to create aliases for complex types.
            typedef bool flag;

            void main() {
                bool f1 = true;
                flag f2 = f1;
            }
        `);
    });
});

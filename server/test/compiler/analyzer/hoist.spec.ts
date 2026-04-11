import {expectSuccess} from './utils';

describe('analyzer/hoist', () => {
    it('accepts: Function can use a type declared after it.', () => {
        expectSuccess(`// Function can use a type declared after it.
            Value get_value() { return Value(); }

            class Value { }
        `);
    });

    it('accepts: Function can use a type declared after it.', () => {
        expectSuccess(`// Function can use a type declared after it.
            int pre() {
                return A::get_id(1);
            }

            namespace A {
                int pre() {
                    return get_id(1);
                }

                int get_id(int id) {
                    return id;
                }

                int post() {
                    return get_id(1);
                }
            }

            int post() {
                return A::get_id(1);
            }
        `);
    });

    it('accepts analyzer case 3', () => {
        expectSuccess([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class array<T> { }
                `
            },
            {
                uri: 'file:///path/to/file.as',
                content: `// Hoisting of global variable types
                array<Str> strs;

                class Str { }
                `
            }
        ]);
    });
});

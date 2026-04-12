import {expectError, expectSuccess} from './utils';

describe('analyzer/handleType', () => {
    it('accepts: Handles can be assigned to compatible handles.', () => {
        expectSuccess(`
            class Base { }
            class Derived : Base { }

            void main() {
                Derived@ derived = Derived();
                Base@ base = derived;
            }
        `);
    });

    it('accepts: Values can be assigned to compatible handles.', () => {
        expectSuccess(`
            class Base { }
            class Derived : Base { }

            void main() {
                Base@ base = Derived();
            }
        `);
    });

    it('accepts: Auto variables initialized from handles resolve to handles.', () => {
        expectSuccess(`
            class Value { }

            void main() {
                Value@ source = Value();
                Value sourceValue;
                auto inferred = source;
                auto fromValue = Value();
                auto fromValueVariable = sourceValue;
                auto@ explicit = source;

                if (inferred is source) {
                    @inferred = null;
                }

                if (fromValue is source) {
                    @fromValue = null;
                }

                if (fromValueVariable is source) {
                    @fromValueVariable = null;
                }

                if (explicit is source) {
                    @explicit = null;
                }
            }
        `);
    });

    it('rejects: Auto reference variables are not valid declarations.', () => {
        expectError(`
            class Value { }

            void main() {
                Value@ source = Value();
                auto& inferred = source;
            }
        `);
    });

    it('rejects: Auto handles cannot be inferred from primitive values.', () => {
        expectError(`
            void main() {
                auto@ value = 1;
            }
        `);
    });

    it('accepts: Handle references can be passed to compatible handle parameters.', () => {
        expectSuccess(`
            class Base { }
            class Derived : Base { }

            void receive(Base@ value) { }

            void main() {
                Derived@ derived = Derived();
                receive(derived);
            }
        `);
    });

    it('accepts: Null can be assigned and returned as a handle.', () => {
        expectSuccess(`
            class Value { }

            Value@ maybe_get() {
                return null;
            }

            void main() {
                Value@ value = null;
                value = maybe_get();
            }
        `);
    });

    it('accepts: Object handles can be compared with null using is and !is.', () => {
        expectSuccess(`
            class Value { }

            void main() {
                Value@ value = null;
                if (value is null) {
                    value = Value();
                }

                if (value !is null) {
                    @value = null;
                }

                if (null is value) {
                    @value = null;
                }
            }
        `);
    });

    it('accepts: Object handles can be compared by identity.', () => {
        expectSuccess(`
            class Value { }

            void main() {
                Value@ left = Value();
                Value@ right = left;

                if (left is right) {
                    @left = null;
                }

                if (@left == @right) {
                    @right = null;
                }

                if (@left != null) {
                    @left = null;
                }
            }
        `);
    });

    it('accepts: Function handles can be compared with null using is.', () => {
        expectSuccess(`
            funcdef void Callback();

            void main() {
                Callback@ callback = null;
                if (callback is null) {
                    @callback = null;
                }
            }
        `);
    });

    it('rejects: Null cannot be assigned to object values.', () => {
        expectError(`
            class Value { }

            void main() {
                // The AngelScript compiler allows this, but the language server reports an error
                // because assigning null to an object value is not semantically valid.
                Value value = null;
            }
        `);
    });

    it('accepts: Handles can be assigned to values by dereferencing.', () => {
        expectSuccess(`
            class Value { }

            Value@ get_value() {
                return Value();
            }

            void main() {
                Value value = get_value();
            }
        `);
    });

    it('accepts: Reference casts from handles return handles.', () => {
        expectSuccess(`
            interface IValue { }
            class Value : IValue { }

            void main() {
                IValue@ base = Value();
                Value@ value = cast<Value>(base);
                if (cast<Value>(base) is null) {
                    @value = null;
                }
            }
        `);
    });

    it('accepts: Reference casts from handles can be assigned to values by dereferencing.', () => {
        expectSuccess(`
            interface IValue { }
            class Value : IValue { }

            void main() {
                IValue@ base = Value();
                Value value = cast<Value>(base);
            }
        `);
    });

    it('rejects: is and !is require handles or null.', () => {
        expectError(`
            void main() {
                int value = 1;
                if (value is null) {
                    value = 2;
                }
            }
        `);
    });

    it('rejects: Null cannot be assigned to primitive values.', () => {
        expectError(`
            void main() {
                int value = null;
            }
        `);
    });

    it('rejects: Null cannot be reassigned to object handles without @.', () => {
        expectError(`
            class Value { }

            void main() {
                Value@ value = Value();
                value = null;
            }
        `);
    });

    it('rejects: Null cannot be reassigned to function handles without @.', () => {
        expectError(`
            funcdef void Callback();

            void main() {
                Callback@ callback = null;
                callback = null;
            }
        `);
    });

    it('rejects: Primitive values cannot be handles.', () => {
        expectError(`
            void main() {
                int@ value = null;
            }
        `);
    });

    it('rejects: Unrelated handles cannot be compared by identity.', () => {
        expectError(`
            class Left { }
            class Right { }

            void main() {
                Left@ left = Left();
                Right@ right = Right();
                if (left is right) {
                    left = null;
                }
            }
        `);
    });

    it('rejects: Handle parameters do not accept unrelated handle types.', () => {
        expectError(`
            class Left { }
            class Right { }

            void receive(Left@ value) { }

            void main() {
                Right@ right = Right();
                receive(right);
            }
        `);
    });

    it('rejects: Values cannot be assigned to unrelated handles.', () => {
        expectError(`
            class Left { }
            class Right { }

            void main() {
                Left@ left = Right();
            }
        `);
    });

    it('accepts: Handles can be converted to primitive values through opImplConv.', () => {
        expectSuccess(`
            class Value {
                int opImplConv() { return 1; }
            }

            void main() {
                Value@ value = Value();
                int number = value;
            }
        `);
    });

    it('accepts: Primitive values can be converted to handles through constructors.', () => {
        expectSuccess(`
            class Value {
                Value(int number) { }
            }

            void main() {
                Value@ value = 1;
            }
        `);
    });

    it('rejects: Template handle arguments must match.', () => {
        expectError([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class array<T> { }`
            },
            {
                uri: 'file:///path/to/file.as',
                content: `
                class Value { }

                void receive(array<Value@> values) { }

                void main() {
                    array<Value> values;
                    receive(values);
                }`
            }
        ]);
    });

    it('rejects: Funcdef parameter handles must match.', () => {
        expectError(`
            class Value { }
            funcdef void Callback(Value@ value);

            void call(Callback@ callback) { }

            void callback(Value value) { }

            void main() {
                call(@Callback(callback));
            }
        `);
    });
});

import {describe, it} from 'node:test';
import {expectError, expectSuccess} from './utils';

describe('analyzer/duplicateDefinition', () => {
    it('detects duplicate class definitions', () => {
        expectError(`// Detect duplicate class definitions
			class A { }

			class A { }
		`);
    });

    it('detects duplicate global function signatures', () => {
        expectError(
            `// Detect duplicate global function signatures
                void f() { }
                void f() { }
            `
        );
    });

    it('detects duplicate global functions even when return types differ', () => {
        expectError(`// Detect duplicate global functions even when return types differ
            void f() { }
            int f() { return 0; }
        `);
    });

    it('detects duplicate global functions even when parameter names differ', () => {
        expectError(`// Detect duplicate global functions even when parameter names differ
            void f(int a) { }
            void f(int b) { }
        `);
    });

    it('detects duplicate global functions even when default arguments differ', () => {
        expectError(`// Detect duplicate global functions even when default arguments differ
            void f(int value = 1) { }
            void f(int value = 2) { }
        `);
    });

    it('accepts overloaded global functions with different parameter types', () => {
        expectSuccess(`// Accept overloaded global functions with different parameter types
            void f(int value) { }
            void f(float value) { }
        `);
    });

    it('accepts overloaded global functions when value parameter constness differs', () => {
        expectSuccess(`// Accept overloaded global functions when value parameter constness differs
            void f(int value) { }
            void f(const int value) { }
        `);
    });

    it('detects duplicate global functions when a parameter uses a primitive typedef', () => {
        expectError(`// Detect duplicate global functions when a parameter uses a primitive typedef
            typedef int MyInt;

            void f(int value) { }
            void f(MyInt value) { }
        `);
    });

    it('detects duplicate global functions when the typedef overload appears first', () => {
        expectError(`// Detect duplicate global functions when the typedef overload appears first
            typedef int MyInt;

            void f(MyInt value) { }
            void f(int value) { }
        `);
    });

    it('accepts overloaded global functions when typedef and parameter types differ', () => {
        expectSuccess(`// Accept overloaded global functions when typedef and parameter types differ
            typedef int MyInt;

            void f(MyInt value) { }
            void f(float value) { }
        `);
    });

    it('detects duplicate global functions when one of multiple parameters uses a primitive typedef', () => {
        expectError(`// Detect duplicate global functions when one of multiple parameters uses a primitive typedef
            typedef int MyInt;

            void f(int value, float factor) { }
            void f(MyInt value, float factor) { }
        `);
    });

    it('detects duplicate global functions when a later parameter uses a primitive typedef', () => {
        expectError(`// Detect duplicate global functions when a later parameter uses a primitive typedef
            typedef int MyInt;

            void f(float factor, int value) { }
            void f(float factor, MyInt value) { }
        `);
    });

    it('accepts overloaded global functions with typedef parameters when another parameter differs', () => {
        expectSuccess(`// Accept overloaded global functions with typedef parameters when another parameter differs
            typedef int MyInt;

            void f(MyInt value, float factor) { }
            void f(MyInt value, double factor) { }
        `);
    });

    it('detects duplicate class method signatures', () => {
        expectError(`// Detect duplicate class method signatures
            class C {
                void f() { }
                void f() { }
            }
        `);
    });

    it('accepts class method overloads that differ by trailing const', () => {
        expectSuccess(`// Accept class method overloads that differ by trailing const
            class C {
                void f() { }
                void f() const { }
            }
        `);
    });

    it('detects duplicate class method signatures with trailing const', () => {
        expectError(`// Detect duplicate class method signatures with trailing const
            class C {
                void f() const { }
                void f() const { }
            }
        `);
    });

    it('detects duplicate interface method signatures', () => {
        expectError(`// Detect duplicate interface method signatures
            interface I {
                void f();
                void f();
            }
        `);
    });

    it('accepts interface method overloads that differ by trailing const', () => {
        expectSuccess(`// Accept interface method overloads that differ by trailing const
            interface I {
                void f();
                void f() const;
            }
        `);
    });

    it('accepts overloaded global functions with typedef parameters when another parameter differs', () => {
        expectSuccess([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class array<T> { }`
            },
            {
                uri: 'file:///path/to/file.as',
                content: `
                void iterate(array<int> arr) { }
                void iterate(const array<int>@ arr) { }
                void iterate(array<int> arr) const { }
                void iterate(array<bool> arr) { }
                }`
            }
        ]);
    });

    it('detects duplicate global functions with typedef parameters', () => {
        expectError([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class array<T> { }`
            },
            {
                uri: 'file:///path/to/file.as',
                content: `
                void iterate(array<int> arr) { }
                void iterate(array<int> arr) { }
                }`
            }
        ]);
    });
});

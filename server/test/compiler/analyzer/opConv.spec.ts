import {expectError, expectSuccess} from './utils';

describe('analyzer/opConv', () => {
    it('rejects: opConv return conversions are explicit-only.', () => {
        expectError(`// opConv return conversions are explicit-only.
            class flag { bool opConv() const { return true; } }
            void main() {
                flag f;
                bool value = f;
            }
        `);
    });

    it('accepts: opConv return conversions can be used by explicit value casts.', () => {
        expectSuccess(`// opConv return conversions can be used by explicit value casts.
            class flag { bool opConv() const { return true; } }
            void main() {
                flag f;
                bool value = bool(f);
            }
        `);
    });

    it('accepts: opConv object return conversions can be used by explicit value casts.', () => {
        expectSuccess(`// opConv object return conversions can be used by explicit value casts.
            class target {}
            class source { target opConv() const { return target(); } }
            void main() {
                source s;
                target t = target(s);
            }
        `);
    });

    it('accepts: opConv handle return conversions can be used by explicit value casts.', () => {
        expectSuccess(`// opConv handle return conversions can be used by explicit value casts.
            class target {}
            class source { target@ opConv() const { return target(); } }
            void main() {
                source s;
                target@ t = target(s);
            }
        `);
    });

    it('accepts: opConv handle return conversions can be used by reference casts.', () => {
        expectSuccess(`// opConv handle return conversions can be used by reference casts.
            class target {}
            class source { target@ opConv() const { return target(); } }
            void main() {
                source s;
                target@ t = cast<target>(s);
            }
        `);
    });

    it('accepts: const source values can use non-const opConv methods.', () => {
        expectSuccess(`// const source values can use non-const opConv methods.
            class target {}
            class source { target opConv() { return target(); } }
            void main() {
                const source s;
                target t = target(s);
            }
        `);
    });

    it('accepts: const source handles can use non-const opConv handle return conversions.', () => {
        expectSuccess(`// const source handles can use non-const opConv handle return conversions.
            class target {}
            class source { target@ opConv() { return target(); } }
            void main() {
                const source@ s = source();
                const target@ t = cast<target>(s);
            }
        `);
    });

    it('rejects: cast expressions do not use opConv for primitive value casts.', () => {
        expectError(`// cast expressions do not use opConv for primitive value casts.
            class flag { bool opConv() const { return true; } }
            void main() {
                flag f;
                bool value = cast<bool>(f);
            }
        `);
    });

    it('accepts: opConv overloads can differ only by return type.', () => {
        expectSuccess(`// opConv overloads can differ only by return type.
            class number_t {
                int64 opConv() const { return 42; }
                double opConv() const { return 3.5; }
            }
        `);
    });

    it('rejects: void opConv(?&out) is explicit-only for conversions.', () => {
        expectError([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class dictionaryValue {
                    void opConv(?&out value);
                }
                `
            },
            {
                uri: 'file:///path/to/file.as',
                content: `// void opConv(?&out) is explicit-only for conversions.
                void main() {
                    dictionaryValue dv;
                    bool flag = dv;
                }
                `
            }
        ]);
    });

    it('accepts: void opConv(?&out) can be used by explicit casts.', () => {
        expectSuccess([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class dictionaryValue {
                    void opConv(?&out value);
                }
                `
            },
            {
                uri: 'file:///path/to/file.as',
                content: `// void opConv(?&out) can be used by explicit casts.
                void main() {
                    dictionaryValue dv;
                    bool flag = bool(dv);
                }
                `
            }
        ]);
    });

    it('accepts: void opConv(?&out) can be used by explicit object casts.', () => {
        expectSuccess([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class dictionaryValue {
                    void opConv(?&out value);
                }
                
                class string { }
                `
            },
            {
                uri: 'file:///path/to/file.as',
                content: `// void opConv(?&out) can be used by explicit casts.
                void main() {
                    dictionaryValue dv;
                    string str = string(dv);
                }
                `
            }
        ]);
    });
});

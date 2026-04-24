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
});

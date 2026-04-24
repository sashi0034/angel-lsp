import {expectError, expectSuccess} from './utils';

describe('analyzer/opConv', () => {
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

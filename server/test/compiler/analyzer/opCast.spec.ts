import {expectError, expectSuccess} from './utils';

describe('analyzer/opCast', () => {
    it('rejects: void opCast(?&out) is explicit-only for conversions.', () => {
        expectError([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class dictionaryValue {
                    void opCast(?&out);
                }
                `
            },
            {
                uri: 'file:///path/to/file.as',
                content: `// void opCast(?&out) is explicit-only for conversions.
                void main() {
                    dictionaryValue dv;
                    bool flag = dv;
                }
                `
            }
        ]);
    });

    it('accepts: void opCast(?&out) can be used by explicit casts.', () => {
        expectSuccess([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class dictionaryValue {
                    void opCast(?&out);
                }
                `
            },
            {
                uri: 'file:///path/to/file.as',
                content: `// void opCast(?&out) can be used by explicit casts.
                void main() {
                    dictionaryValue dv;
                    bool flag = bool(dv);
                }
                `
            }
        ]);
    });
});

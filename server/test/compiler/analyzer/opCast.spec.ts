import {expectError, expectSuccess} from './utils';

describe('analyzer/opCast', () => {
    it('rejects: opCast return conversions are not value casts.', () => {
        expectError(`// opCast return conversions are not value casts.
            class flag { bool opCast() const { return true; } }
            void main() {
                flag f;
                bool value = bool(f);
            }
        `);
    });

    it('rejects: opCast object return conversions are not value casts.', () => {
        expectError(`// opCast object return conversions are not value casts.
            class target {}
            class source { target opCast() const { return target(); } }
            void main() {
                source s;
                target t = target(s);
            }
        `);
    });

    it('accepts: opCast return conversions can be used by cast expressions.', () => {
        expectSuccess(`// opCast return conversions can be used by cast expressions.
            class target {}
            class source { target opCast() const { return target(); } }
            void main() {
                source s;
                target t = cast<target>(s);
            }
        `);
    });

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

    it('rejects: void opCast(?&out) cannot be used by explicit value casts.', () => {
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
                content: `// void opCast(?&out) cannot be used by explicit value casts.
                void main() {
                    dictionaryValue dv;
                    bool flag = bool(dv);
                }
                `
            }
        ]);
    });

    it('accepts: void opCast(?&out) can be used by explicit reference casts.', () => {
        expectSuccess([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class target {}
                class dictionaryValue {
                    void opCast(?&out);
                }
                `
            },
            {
                uri: 'file:///path/to/file.as',
                content: `// void opCast(?&out) can be used by explicit reference casts.
                void main() {
                    dictionaryValue@ dv;
                    target@ value = cast<target>(dv);
                }
                `
            }
        ]);
    });
});

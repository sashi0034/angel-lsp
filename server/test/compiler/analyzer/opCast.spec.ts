import {expectError, expectSuccess} from './utils';

describe('analyzer/opCast', () => {
    it('accepts: explicit reference casts can downcast handles.', () => {
        expectSuccess(`// explicit reference casts can downcast handles.
            class Base {}
            class Derived : Base {}
            void main() {
                Base@ base = Derived();
                Derived@ derived = cast<Derived>(base);
            }
        `);
    });

    it('rejects: implicit conversions cannot downcast handles.', () => {
        expectError(`// implicit conversions cannot downcast handles.
            class Base {}
            class Derived : Base {}
            void main() {
                Base@ base = Derived();
                Derived@ derived = base;
            }
        `);
    });

    it('accepts: explicit reference casts can downcast to const handles.', () => {
        expectSuccess(`// explicit reference casts can downcast to const handles.
            class Base {}
            class Derived : Base { void read() const {} }
            void main() {
                Base@ base = Derived();
                const Derived@ derived = cast<const Derived>(base);
                derived.read();
            }
        `);
    });

    it('rejects: explicit reference casts preserve const object handles while downcasting.', () => {
        expectError(`// explicit reference casts preserve const object handles while downcasting.
            class Base {}
            class Derived : Base { void mutate() {} }
            void main() {
                const Base@ base = Derived();
                Derived@ derived = cast<Derived>(base);
                derived.mutate();
            }
        `);
    });

    it('accepts: explicit reference casts preserve const object handles when target is const.', () => {
        expectSuccess(`// explicit reference casts preserve const object handles when target is const.
            class Base {}
            class Derived : Base { void read() const {} }
            void main() {
                const Base@ base = Derived();
                const Derived@ derived = cast<Derived>(base);
                derived.read();
            }
        `);
    });

    it('accepts: const handles do not make referenced objects const for reference casts.', () => {
        expectSuccess(`// const handles do not make referenced objects const for reference casts.
            class Base {}
            class Derived : Base { void mutate() {} }
            void main() {
                Base@ const base = Derived();
                Derived@ derived = cast<Derived>(base);
                derived.mutate();
            }
        `);
    });

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

    it('accepts: opCast handle return conversions can be used by reference casts from values.', () => {
        expectSuccess(`// opCast handle return conversions can be used by reference casts from values.
            class target {}
            class source { target@ opCast() { return target(); } }
            void main() {
                source s;
                target@ t = cast<target>(s);
            }
        `);
    });

    it('accepts: opCast handle return conversions can be used by reference casts from handles.', () => {
        expectSuccess(`// opCast handle return conversions can be used by reference casts from handles.
            class target {}
            class source { target@ opCast() { return target(); } }
            void main() {
                source@ s = source();
                target@ t = cast<target>(s);
            }
        `);
    });

    it('rejects: value casts do not use opCast handle return conversions.', () => {
        expectError(`// value casts do not use opCast handle return conversions.
            class target {}
            class source { target@ opCast() { return target(); } }
            void main() {
                source s;
                target t = target(s);
            }
        `);
    });

    it('rejects: const source handles require const opCast methods.', () => {
        expectError(`// const source handles require const opCast methods.
            class target {}
            class source { target@ opCast() { return target(); } }
            void main() {
                const source@ s = source();
                target@ t = cast<target>(s);
            }
        `);
    });

    it('rejects: const source handle opCast results cannot drop const.', () => {
        expectError(`// const source handle opCast results cannot drop const.
            class target {}
            class source { target@ opCast() const { return target(); } }
            void main() {
                const source@ s = source();
                target@ t = cast<target>(s);
            }
        `);
    });

    it('accepts: const source handle opCast results can be assigned to const handles.', () => {
        expectSuccess(`// const source handle opCast results can be assigned to const handles.
            class target {}
            class source { target@ opCast() const { return target(); } }
            void main() {
                const source@ s = source();
                const target@ t = cast<target>(s);
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

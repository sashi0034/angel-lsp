import {expectError, expectSuccess} from './utils';

describe('analyzer/const', () => {
    it('rejects: Assigning to a const primitive variable.', () => {
        expectError(`
            void main() {
                const int value = 1;
                value = 2;
            }
        `);
    });

    it('rejects: Compound assignment to a const primitive variable.', () => {
        expectError(`
            void main() {
                const int value = 1;
                value += 2;
            }
        `);
    });

    it('rejects: Incrementing a const primitive variable.', () => {
        expectError(`
            void main() {
                const int value = 1;
                ++value;
            }
        `);
    });

    it('rejects: Assigning to const auto.', () => {
        expectError(`
            void main() {
                const auto value = 1;
                value = 2;
            }
        `);
    });

    it('rejects: Const auto object handles cannot call non-const methods.', () => {
        expectError(`
            class Obj {
                void mutate() {}
                void read() const {}
            }

            void main() {
                const auto@ handle = Obj();
                handle.read();
                handle.mutate();
            }
        `);
    });

    it('accepts: Const auto object handles can be reseated explicitly.', () => {
        expectSuccess(`
            class Obj {
                void read() const {}
            }

            void main() {
                const auto@ handle = Obj();
                @handle = Obj();
                handle.read();
            }
        `);
    });

    it('rejects: Auto const handles cannot be reseated.', () => {
        expectError(`
            class Obj {
                void mutate() {}
            }

            void main() {
                auto@ const handle = Obj();
                handle.mutate();
                @handle = Obj();
            }
        `);
    });

    it('accepts: Auto const handles can mutate the referenced object.', () => {
        expectSuccess(`
            class Obj {
                void mutate() {}
            }

            void main() {
                auto@ const handle = Obj();
                handle.mutate();
            }
        `);
    });

    it('accepts: Non-const objects can call const methods.', () => {
        expectSuccess(`
            class Obj {
                void read() const {}
            }

            void main() {
                Obj obj;
                obj.read();
            }
        `);
    });

    it('rejects: Const objects cannot call non-const methods.', () => {
        expectError(`
            class Obj {
                void mutate() {}
                void read() const {}
            }

            void main() {
                const Obj obj;
                obj.read();
                obj.mutate();
            }
        `);
    });

    it('rejects: Const object handles cannot call non-const methods.', () => {
        expectError(`
            class Obj {
                void mutate() {}
                void read() const {}
            }

            void main() {
                const Obj@ handle = Obj();
                handle.read();
                handle.mutate();
            }
        `);
    });

    it('accepts: Const object handles can be reseated explicitly.', () => {
        expectSuccess(`
            class Obj {
                void read() const {}
            }

            void main() {
                const Obj@ handle = Obj();
                @handle = Obj();
                handle.read();
            }
        `);
    });

    it('rejects: Const object handles cannot be assigned without explicit handle access.', () => {
        expectError(`
            class Obj {
                void read() const {}
            }

            void main() {
                const Obj@ handle = Obj();
                handle = Obj();
            }
        `);
    });

    it('rejects: Const handle variables cannot be reseated.', () => {
        expectError(`
            class Obj {}

            void main() {
                Obj@ const handle = Obj();
                @handle = Obj();
            }
        `);
    });

    it('accepts: Const handle variables can mutate the referenced object.', () => {
        expectSuccess(`
            class Obj {
                int value;
                void mutate() { value = 1; }
            }

            void main() {
                Obj@ const handle = Obj();
                handle.mutate();
            }
        `);
    });

    it('rejects: Const object const handles cannot mutate or reseat.', () => {
        expectError(`
            class Obj {
                void mutate() {}
                void read() const {}
            }

            void main() {
                const Obj@ const handle = Obj();
                handle.read();
                handle.mutate();
                @handle = Obj();
            }
        `);
    });

    it('rejects: Fields of const value objects are read-only.', () => {
        expectError(`
            class Obj {
                int value;
            }

            void main() {
                const Obj obj;
                obj.value = 1;
            }
        `);
    });

    it('accepts: Handle fields of const value objects can mutate their target.', () => {
        expectSuccess(`
            class Child {
                void mutate() {}
            }

            class Obj {
                Child@ child = Child();
            }

            void main() {
                const Obj obj;
                obj.child.mutate();
            }
        `);
    });

    it('rejects: Casts preserve const object handles.', () => {
        expectError(`
            class Obj {
                void mutate() {}
            }

            void main() {
                const Obj@ handle = Obj();
                Obj@ mutable = cast<Obj>(handle);
                mutable.mutate();
            }
        `);
    });

    it('accepts: Casts can explicitly produce const object handles.', () => {
        expectSuccess(`
            class Obj {
                void read() const {}
            }

            void main() {
                Obj@ handle = Obj();
                const Obj@ value = cast<const Obj>(handle);
                value.read();
            }
        `);
    });

    it('accepts: Non-const object handles prefer mutable overloads over const overloads.', () => {
        expectSuccess(`
            class Base {}
            class Derived : Base {}

            int pick(const Base@ value) { return 0; }
            bool pick(Base@ value) { return true; }

            void main() {
                Derived@ value = Derived();
                bool selected = pick(value);
            }
        `);
    });

    it('accepts: Const object values prefer const overloads over mutable copy overloads.', () => {
        expectSuccess(`
            class Obj {}

            int pick(Obj &in value) { return 0; }
            bool pick(const Obj &in value) { return true; }

            void main() {
                const Obj value;
                bool selected = pick(value);
            }
        `);
    });

    it('accepts: Object conversions prefer mutable overloads over const overloads.', () => {
        expectSuccess(`
            class Target {}
            class Source {
                Target opImplConv() { return Target(); }
            }

            int pick(const Target &in value) { return 0; }
            bool pick(Target &in value) { return true; }

            void main() {
                Source value;
                bool selected = pick(value);
            }
        `);
    });
});

import {testCompletion, useCompletionWithoutBuiltinKeywords} from './utils';

describe('completion/class', () => {
    useCompletionWithoutBuiltinKeywords();

    it('completes instance members after a period', () => {
        testCompletion(
            `//  Instance member completion occurs after period.
            class Player {
                int x, y;

                void attack() { $C0$ }

                private void move() { }
            }

            void bar() {
                int y = 1;
                Player player;
                player.$C1$
            }
            `,
            /* $C0$ */ ['Player', 'x', 'y', 'this', 'attack', 'move', 'bar'],
            /* $C1$ */ ['x', 'y', 'attack']
        );
    });

    it('omits inaccessible private and protected members', () => {
        testCompletion(
            `// Private members can be accessed only from within the class.
            class Foo {
                int x;
                private int z;
                protected int y;

                void a() { }
                private void b() { }
                protected void c() { }
            }

            class Bar : Foo {
                int w;
                void d() { $C0$ }

                private int v;
                private void e() { }
            }

            void main() {
                Bar bar;
                bar.$C1$
            }`,
            /* $C0 */ ['Foo', 'Bar', 'x', 'y', 'a', 'c', 'this', 'w', 'v', 'd', 'e', 'main'],
            /* $C1 */ ['w', 'd', 'x', 'a']
        );
    });

    it('excludes constructors from member access completions', () => {
        testCompletion(
            `class Obj {
                Obj() { }
                Obj(int v) { }

                void f() {
                    Obj obj;
                    obj.$C0$
                }

                void g() {
                    Obj().$C1$
                }
            }`,
            /* $C0$ */ ['f', 'g'],
            /* $C1$ */ ['f', 'g']
        );
    });

    it('does not fall back to global completions after invalid member access', () => {
        testCompletion(
            `// Invalid member access should not fall back to normal scope completion.
            class Foo { }

            class Bar {
                int w;
                private void e() { }
            }

            void main() {
                Bar bar;
                bar.w.$C0$;
                bar.undefined_member.$C1$;
                bar.e().$C2$;
            }`,
            /* $C0 */ [],
            /* $C1 */ [],
            /* $C2 */ []
        );
    });
});

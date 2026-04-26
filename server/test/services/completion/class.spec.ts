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
                {
                    Bar bar;
                    bar.$C1$
                }
                
                {
                    Bar bar;
                    bar.w.$C2$; // should show nothing
                    bar.e().$C3$ // should show nothing
                }
            }`,
            /* $C0 */ ['Foo', 'Bar', 'x', 'y', 'a', 'c', 'this', 'w', 'v', 'd', 'e', 'main'],
            /* $C1 */ ['w', 'd', 'x', 'a'],
            /* $C2 */ [],
            /* $C3 */ []
        );
    });
});

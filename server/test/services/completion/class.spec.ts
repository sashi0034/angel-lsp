import {testCompletion} from "./utils";

describe('completion/class', () => {
    testCompletion(`//  Instance member completion occurs after period.
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
        `,  /* $C0$ */ ["Player", "x", "y", "this", "attack", "move", "bar"]
        , /* $C1$ */ ["x", "y", "attack"]
    );

    testCompletion(`// Private members can be accessed only from within the class.
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
        }`
        , /* $C0 */ ["Foo", "Bar", "x", "y", "a", "c", "this", "w", "v", "d", "e", "main"]
        , /* $C1 */ ["w", "d", "x", "a"]
    );

});
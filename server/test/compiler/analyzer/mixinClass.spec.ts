import {expectError, expectSuccess} from "./utils";

describe('analyzer/mixinClass', () => {
    expectSuccess(`// Derived class can access all members of mixin class.
        mixin class MyMixin {
            int m_public;
            private int m_private;
            protected int m_protected;
            
            private int fn_private() { return 1; }
        }
        
        class MyClass : MyMixin {
            void test() {
                m_public = 1;
                m_private = 2;
                m_protected = 3;

                this.m_public = 1;
                this.m_private = 2;
                this.m_protected = 3;
                
                fn_private();
            }
        }
    `);

    expectError(`// Derived class cannot access private members of non-mixin class.
        class NoMixin {
            int m_public;
            private int m_private;
            protected int m_protected;
            
            private int fn_private() { return 1; }
        }
        
        class MyClass : NoMixin {
            void test() {
                m_public = 1;
                m_private = 2;
                m_protected = 3;

                this.m_public = 1;
                this.m_private = 2;
                this.m_protected = 3;
                
                fn_private();
            }
        }
    `);
});
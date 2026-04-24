import {expectError, expectSuccess} from './utils';

describe('analyzer/enum', () => {
    it('accepts namespaced enum member access in local auto initializers', () => {
        expectSuccess(`
            namespace Color {
                enum Color {
                    Red,
                }
            }
            
            void ok(Color::Color color) { }
        
            void main() {
                auto c = Color::Red;
                ok(c);
            }
        `);
    });

    it('accepts namespaced enum member access in global auto initializers', () => {
        expectSuccess(`
            namespace Color {
                enum Color {
                    Red,
                }
            }
            
            void ok(Color::Color color) { }
        
            auto c = Color::Red;
                
            void main() {
                ok(c);
            }
        `);
    });
});

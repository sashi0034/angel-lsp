import {expectError, expectSuccess} from "./utils";

describe('analyzer/indexedPropertyAccessor', () => {
    expectSuccess(`// Indexed property accessors can be used through the index operator.
        class MyVector {
            int x;
            int y;
            int z;
        
            int get_elem(int index) const property {
                if (index == 0) return x;
                else if (index == 1) return y;
                else if (index == 2) return z;
                else return -1;
            }

            void set_elem(int index, int value) property {
                if (index == 0) x = value;
                else if (index == 1) y = value;
                else if (index == 2) z = value;
            }
        }

        void main() {
            MyVector p;
            p.elem[0] = p.elem[1 + 2];
        }
    `);

    expectError(`
        class MyVector {
            int x;
            int y;
            int z;
        
            int get_elem(int index) const property {
                if (index == 0) return x;
                else if (index == 1) return y;
                else if (index == 2) return z;
                else return -1;
            }

            void set_elem(int index, int value) property {
                if (index == 0) x = value;
                else if (index == 1) y = value;
                else if (index == 2) z = value;
            }
        }

        void main() {
            MyVector p;
            p.elem[0] = p.elem[1, 2]; // Error: too many arguments
        }
    `);
});
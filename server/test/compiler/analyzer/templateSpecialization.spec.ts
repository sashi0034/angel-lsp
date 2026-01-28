import {expectError, expectSuccess} from "./utils";

describe('analyzer/templateSpecialization', () => {
    expectSuccess([{
        uri: 'file:///path/to/as.predefined',
        content: `
            class Container<T> {
                T item;
            }

            class Player {
                int health;
            }
            `
    }, {
        uri: 'file:///path/to/file.as',
        content: `// Generic type parameter resolves correctly for member access.
            void main() {
                Container<Player> container;
                container.item.health = 100;
            }
            `
    }]);

    expectSuccess([{
        uri: 'file:///path/to/as.predefined',
        content: `
            class Wrapper<T> {
                T data;
            }

            class Entity {
                int x, y;
            }
            `
    }, {
        uri: 'file:///path/to/file.as',
        content: `// Nested generic types resolve correctly.
            void main() {
                Wrapper<Wrapper<Entity>> nested;
                nested.data.data.x = 10;
                nested.data.data.y = 20;
            }
            `
    }]);

    expectSuccess([{
        uri: 'file:///path/to/as.predefined',
        content: `
            class Box<T> {
                T value;
            }

            class Box<float> {
                float specialValue;
            }

            class Item {
                int weight;
            }

            class Box<Item> {
                int specialWeight;
            }

            class Weapon {
                int damage;
            }
            `
    }, {
        uri: 'file:///path/to/file.as',
        content: `// Template specialization is used when available.
            void main() {
                Box<Item> special;
                special.specialWeight = 42;

                Box<Weapon> generic;
                generic.value.damage = 10;
            }
            `
    }]);

    expectError([{
        uri: 'file:///path/to/as.predefined',
        content: `
            class Cache<T> {
                T data;
            }

            class Record {
                int id;
            }

            class Cache<Record> {
                int capacity;
            }
            `
    }, {
        uri: 'file:///path/to/file.as',
        content: `// Specialization does not have generic member 'data'.
            void main() {
                Cache<Record> cache;
                cache.data.id;
            }
            `
    }]);

    expectSuccess([{
        uri: 'file:///path/to/as.predefined',
        content: `
            class Item {
                int weight;
            }

            class Box<Item> {
                int specialWeight;
            }

            T findItem<T>(int id) {
                T item;
                return item;
            }
            `
    }, {
        uri: 'file:///path/to/file.as',
        content: `// Explicit function template arguments resolve return types.
            void main() {
                auto itemBox = findItem<Box<Item>>(1);
                Box<Item> itemBoxCopy = itemBox;
            }
            `
    }]);
});

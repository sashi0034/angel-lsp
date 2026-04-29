import {expectError, expectSuccess} from './utils';

describe('analyzer/templateSpecialization', () => {
    it('accepts object handles for template parameters in predefined files', () => {
        expectSuccess([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class obj<T> {
                    const T@ get() const;
                }
                `
            }
        ]);
    });

    it('accepts analyzer case 1', () => {
        expectSuccess([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class Container<T> {
                    T item;
                }

                class Player {
                    int health;
                }
                `
            },
            {
                uri: 'file:///path/to/file.as',
                content: `// Generic template parameter resolves correctly for member access.
                void main() {
                    Container<Player> container;
                    container.item.health = 100;
                }
                `
            }
        ]);
    });

    it('accepts analyzer case 2', () => {
        expectSuccess([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class Wrapper<T> {
                    T data;
                }

                class Entity {
                    int x, y;
                }
                `
            },
            {
                uri: 'file:///path/to/file.as',
                content: `// Nested generic types resolve correctly.
                void main() {
                    Wrapper<Wrapper<Entity>> nested;
                    nested.data.data.x = 10;
                    nested.data.data.y = 20;
                }
                `
            }
        ]);
    });

    it('accepts analyzer case 3', () => {
        expectSuccess([
            {
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
            },
            {
                uri: 'file:///path/to/file.as',
                content: `// Template specialization is used when available.
                void main() {
                    Box<Item> special;
                    special.specialWeight = 42;

                    Box<Weapon> generic;
                    generic.value.damage = 10;
                }
                `
            }
        ]);
    });

    it('rejects analyzer case 4', () => {
        expectError([
            {
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
            },
            {
                uri: 'file:///path/to/file.as',
                content: `// Specialization does not have generic member 'data'.
                void main() {
                    Cache<Record> cache;
                    cache.data.id;
                }
                `
            }
        ]);
    });

    it('accepts analyzer case 5', () => {
        expectSuccess([
            {
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
            },
            {
                uri: 'file:///path/to/file.as',
                content: `// Explicit function template arguments resolve return types.
                void main() {
                    auto itemBox = findItem<Box<Item>>(1);
                    Box<Item> itemBoxCopy = itemBox;
                }
                `
            }
        ]);
    });

    it('accepts function template declarations in predefined files', () => {
        expectSuccess([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                namespace math {
                    T abs<T>(const T&in v); // Reported in #286
                }
                `
            },
            {
                uri: 'file:///path/to/file.as',
                content: `
                int fn() {
                    return math::abs(-1);
                }
                `
            }
        ]);
    });

    it('accepts specialized members without losing the generic template fallback', () => {
        expectSuccess([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class Item {
                    int weight;
                }

                class Other {
                    int durability;
                }

                class Box<T> {
                    T get();
                }

                class Box<Item> {
                    Item get();
                }
                `
            },
            {
                uri: 'file:///path/to/file.as',
                content: `
                void main() {
                    Box<Item> itemBox;
                    auto item = itemBox.get();
                    item.weight = 1;

                    Box<Other> otherBox;
                    auto other = otherBox.get();
                    other.durability = 2;
                }
                `
            }
        ]);
    });

    it('accepts template arguments that are object handles', () => {
        expectSuccess([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class Box<T> {
                    T item;
                }

                class Value {
                    void mutate();
                }
                `
            },
            {
                uri: 'file:///path/to/file.as',
                content: `
                void main() {
                    Box<Value@> box;
                    Value@ value = Value();
                    box.item = value;
                    box.item.mutate();
                }
                `
            }
        ]);
    });

    it('rejects template handle arguments that lose the handle modifier', () => {
        expectError([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class Box<T> {
                    T item;
                }

                class Value {}

                void receive(Box<Value@> box);
                `
            },
            {
                uri: 'file:///path/to/file.as',
                content: `
                void main() {
                    Box<Value> box;
                    receive(box);
                }
                `
            }
        ]);
    });

    it('accepts template class methods that call function templates with class-typed template arguments', () => {
        expectSuccess([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class Item {
                    int weight;
                }

                T identity<T>(T value) {
                    return value;
                }

                class Box<T> {
                    T make(T input);
                }
                `
            },
            {
                uri: 'file:///path/to/file.as',
                content: `
                void main() {
                    Box<Item> box;
                    Item item;

                    auto output = box.make(item);
                    output.weight = 3;
                }
                `
            }
        ]);
    });

    it('rejects member template calls when specialized class arguments differ', () => {
        expectError([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class Item { }

                class Other { }

                class Box<T> {
                    T value;
                }

                class Box<Item> {
                    int specialWeight;
                }

                class Consumer<T> {
                    void consume<U>(T first, U second);
                }
                `
            },
            {
                uri: 'file:///path/to/file.as',
                content: `
                void main() {
                    Consumer<Box<Item>> consumer;
                    Box<Other> otherBox;
                    Other other;

                    consumer.consume<Other>(otherBox, other);
                }
                `
            }
        ]);
    });

    it('accepts funcdef handles with specialized template arguments in return and parameter types', () => {
        expectSuccess([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class Item { }

                class Box<T> {
                    T value;
                }

                class Box<Item> {
                    int specialWeight;

                    void push<Number>(Item item, Number number);
                }

                funcdef Box<Item> ItemBoxFactory();
                funcdef void ItemBoxConsumer(Box<Item> box);

                Box<Item> makeItemBox();

                void consumeItemBox(Box<Item> box);
                `
            },
            {
                uri: 'file:///path/to/file.as',
                content: `
                void main() {
                    ItemBoxFactory@ factory = @ItemBoxFactory(makeItemBox);
                    auto box = factory();
                    box.specialWeight = 1;
                    box.push<int64>(Item(), 123);

                    ItemBoxConsumer@ consumer = @ItemBoxConsumer(consumeItemBox);
                    consumer(box);
                }
                `
            }
        ]);
    });

    it('keeps class and function template parameters with the same name separate', () => {
        expectSuccess([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class Item {
                    int itemValue;
                }

                class Other {
                    int otherValue;
                }

                class Box<T> {
                    T value;

                    T echo<T>(T arg) {
                        return arg;
                    }
                }
                `
            },
            {
                uri: 'file:///path/to/file.as',
                content: `
                void main() {
                    Box<Item> box;
                    Other other;

                    auto result = box.echo<Other>(other);
                    result.otherValue = 1;
                    box.value.itemValue = 2;
                }
                `
            }
        ]);
    });

    it('accepts array of typedef primitive matches array of original primitive', () => {
        expectSuccess(`
            typedef uint8 byte;

            class array<T> { }

            void main() {
                array<byte> src;
                array<uint8> dst = src;

                array<array<byte>> src2;
                array<array<uint8>> dst2 = src2;
            }
        `);
    });

    it('rejects missing template arguments', () => {
        expectError(`
            class Obj<T, U, V> { }

            void main() {
                Obj<int> obj;
            }
        `);
    });
});

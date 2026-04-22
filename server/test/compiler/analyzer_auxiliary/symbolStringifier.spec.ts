import {stringifySymbolObject} from '../../../src/compiler_analyzer/symbolStringifier';
import {inspectFileContents, makeFileContentList} from '../../inspectorUtils';
import type {SymbolGlobalScope} from '../../../src/compiler_analyzer/symbolScope';
import type {SymbolObjectHolder} from '../../../src/compiler_analyzer/symbolObject';

function expectStringifiedSymbol(
    content: string,
    lookup: (globalScope: SymbolGlobalScope) => SymbolObjectHolder | undefined,
    expected: string
) {
    const inspector = inspectFileContents(makeFileContentList(content));
    const globalScope = inspector.getRecord('file:///path/to/file.as').analyzerScope.globalScope;
    const symbol = lookup(globalScope);

    if (symbol === undefined) {
        throw new Error('Expected symbol, but got none.');
    }

    const actual = stringifySymbolObject(symbol.isFunctionHolder() ? symbol.first : symbol);
    if (actual !== expected) {
        throw new Error(`Incorrect symbol string.\nexpected: ${expected}\nactual  : ${actual}`);
    }
}

describe('analyzer/symbolStringifier', () => {
    it('stringifies types', () => {
        expectStringifiedSymbol(
            `
            class Obj {}
            `,
            globalScope => globalScope.lookupSymbol('Obj'),
            'Obj'
        );
    });

    it('stringifies template parameters', () => {
        expectStringifiedSymbol(
            `
            class Container<T> {}
            `,
            globalScope => globalScope.lookupSymbol('Container'),
            'Container<T>'
        );
    });

    it('stringifies variables', () => {
        expectStringifiedSymbol(
            `
            class Obj {}
            Obj@ value;
            `,
            globalScope => globalScope.lookupSymbol('value'),
            'Obj@ value'
        );
    });

    it('stringifies evaluated bool const variables', () => {
        expectStringifiedSymbol(
            `
            const bool enabled = true;
            `,
            globalScope => globalScope.lookupSymbol('enabled'),
            'bool enabled = true'
        );
    });

    it('stringifies bool const variables evaluated from expressions', () => {
        expectStringifiedSymbol(
            `
            const bool enabled = !(false || (1 > 2));
            `,
            globalScope => globalScope.lookupSymbol('enabled'),
            'bool enabled = true'
        );
    });

    it('stringifies variables with template arguments', () => {
        expectStringifiedSymbol(
            `
            class Container<T> {}
            class Obj {}

            Container<Obj> value;
            `,
            globalScope => globalScope.lookupSymbol('value'),
            'Container<Obj> value'
        );
    });

    it('stringifies nested template arguments with handles', () => {
        expectStringifiedSymbol(
            `
            class Container<T> {}
            class Pair<T, U> {}
            class Obj {}

            Pair<Container<Obj@>, Obj@> value;
            `,
            globalScope => globalScope.lookupSymbol('value'),
            'Pair<Container<Obj@>, Obj@> value'
        );
    });

    it('stringifies template function return and parameter types', () => {
        expectStringifiedSymbol(
            `
            class Container<T> {}
            class Obj {}

            Container<Obj@> make(const Container<Obj@>@const&in incoming) {
                Container<Obj@> result;
                return result;
            }
            `,
            globalScope => globalScope.lookupSymbol('make'),
            'Container<Obj@> make(const Container<Obj@>@const&in incoming)'
        );
    });

    it('stringifies function templates', () => {
        expectStringifiedSymbol(
            `
            T getValue<T>(T value) {
                return value;
            }
            `,
            globalScope => globalScope.lookupSymbol('getValue'),
            'T getValue<T>(T value)'
        );
    });

    it('stringifies function parameter modifiers, const, and handles', () => {
        expectStringifiedSymbol(
            `
            class Obj {}

            Obj@const make(const Obj@const&in incoming, Obj@&out outgoing, int&inout count) {
                return null;
            }
            `,
            globalScope => globalScope.lookupSymbol('make'),
            'Obj@const make(const Obj@const&in incoming, Obj@&out outgoing, int&inout count)'
        );
    });

    it('stringifies const instance methods', () => {
        expectStringifiedSymbol(
            `
            class Obj {}

            class Widget {
                void update(const Obj@const&in value) const {}
            }
            `,
            globalScope => globalScope.lookupScope('Widget')?.lookupSymbol('update'),
            'void update(const Obj@const&in value) const'
        );
    });

    it('keeps modifiers for unresolved parameter types', () => {
        expectStringifiedSymbol(
            `
            void consume(const Missing@const&in value) {}
            `,
            globalScope => globalScope.lookupSymbol('consume'),
            'void consume(const Missing@const&in value)'
        );
    });

    it('stringifies funcdef handle variables', () => {
        expectStringifiedSymbol(
            `
            class Obj { }
            funcdef Obj callback_f(int a, int b);
            callback_f@ c;
            `,
            globalScope => globalScope.lookupSymbol('c'),
            'callback_f@ c'
        );
    });

    it('stringifies auto variables initialized by funcdef handle calls', () => {
        expectStringifiedSymbol(
            `
            class Obj { }

            funcdef Obj@ callback_t(int);

            void f(callback_t@ cb) {
                auto o = cb(1);
            }
            `,
            globalScope => {
                // f
                // |-- (anonymous scope)
                //     |-- o
                const f = globalScope.lookupScope('f')?.childScopeTable?.values().next().value;
                return f ? f.lookupSymbol('o') : undefined;
            },
            'Obj@ o'
        );
    });

    it('preserves funcdef handle call return types when an argument is unresolved', () => {
        expectStringifiedSymbol(
            `
            class Obj { }

            funcdef Obj@ callback_t(int);

            void f(callback_t@ cb) {
                auto o = cb(UNDEFINED_VALUE);
            }
            `,
            globalScope => {
                // f
                // |-- (anonymous scope)
                //     |-- o
                const f = globalScope.lookupScope('f')?.childScopeTable?.values().next().value;
                return f ? f.lookupSymbol('o') : undefined;
            },
            'Obj@ o'
        );
    });
});

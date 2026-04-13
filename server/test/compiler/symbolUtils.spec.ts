import {stringifySymbolObject} from '../../src/compiler_analyzer/symbolUtils';
import {inspectFileContents, makeFileContentList} from '../inspectorUtils';
import type {SymbolGlobalScope} from '../../src/compiler_analyzer/symbolScope';
import type {SymbolObjectHolder} from '../../src/compiler_analyzer/symbolObject';

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

describe('compiler/symbolUtils', () => {
    it('stringifies types', () => {
        expectStringifiedSymbol(
            `
            class Obj {}
            `,
            globalScope => globalScope.lookupSymbol('Obj'),
            'Obj'
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
});

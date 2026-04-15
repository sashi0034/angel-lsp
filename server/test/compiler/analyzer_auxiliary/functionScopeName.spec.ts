import {inspectFileContents, makeFileContentList} from '../../inspectorUtils';
import type {SymbolGlobalScope, SymbolScope} from '../../../src/compiler_analyzer/symbolScope';

function expectFunctionScopeNames(
    content: string,
    lookup: (globalScope: SymbolGlobalScope) => SymbolScope | undefined,
    expected: string[]
) {
    const inspector = inspectFileContents(makeFileContentList(content));
    const globalScope = inspector.getRecord('file:///path/to/file.as').analyzerScope.globalScope;
    const functionHolderScope = lookup(globalScope);

    if (functionHolderScope === undefined) {
        throw new Error('Expected function holder scope, but got none.');
    }

    const actual = [...functionHolderScope.childScopeTable.keys()];
    const missing = expected.filter(scope => actual.includes(scope) === false);
    const unexpected = actual.filter(scope => expected.includes(scope) === false);
    if (missing.length > 0 || unexpected.length > 0) {
        throw new Error(
            [
                'Incorrect function scope names.',
                `expected: ${expected.join(', ')}`,
                `actual  : ${actual.join(', ')}`,
                `missing : ${missing.join(', ')}`,
                `extra   : ${unexpected.join(', ')}`
            ].join('\n')
        );
    }
}

describe('analyzer/functionScopeName', () => {
    it('names overloaded function scopes from parameter signatures', () => {
        expectFunctionScopeNames(
            `
            class Obj {}

            class Example {
                int fn(const Obj@ a, int b, array<int, int> c) { return 0; }
                int fn(const Obj@ a, int b, array<int, int> c) const { return 0; }
            }
            `,
            globalScope => globalScope.lookupScope('Example')?.lookupScope('fn'),
            ['~const Obj@,int,array<int,int>', '~const Obj@,int,array<int,int>,const']
        );
    });

    it('names class template parameter scopes from parameter signatures', () => {
        expectFunctionScopeNames(
            `
            class array<T> {
                void insertLast(const T&in value) {}
                void assign(const array<T>&in other) {}
            }
            `,
            globalScope => globalScope.lookupScope('array')?.lookupScope('insertLast'),
            ['~const T&in']
        );

        expectFunctionScopeNames(
            `
            class array<T> {
                void insertLast(const T&in value) {}
                void assign(const array<T>&in other) {}
            }
            `,
            globalScope => globalScope.lookupScope('array')?.lookupScope('assign'),
            ['~const array<T>&in']
        );
    });

    it('names function template parameter scopes from parameter signatures', () => {
        expectFunctionScopeNames(
            `
            class array<T> {}

            T fn<T>(T value) {
                return value;
            }

            array<T> makeArray<T>(array<T> value) {
                return value;
            }
            `,
            globalScope => globalScope.lookupScope('fn'),
            ['~T']
        );

        expectFunctionScopeNames(
            `
            class array<T> {}

            T fn<T>(T value) {
                return value;
            }

            array<T> makeArray<T>(array<T> value) {
                return value;
            }
            `,
            globalScope => globalScope.lookupScope('makeArray'),
            ['~array<T>']
        );
    });
});

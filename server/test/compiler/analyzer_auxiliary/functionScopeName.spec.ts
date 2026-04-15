import {inspectFileContents, makeFileContentList} from '../../inspectorUtils';
import type {SymbolGlobalScope, SymbolScope} from '../../../src/compiler_analyzer/symbolScope';

function lookupScopePath(globalScope: SymbolGlobalScope, scopePathText: string): SymbolScope | undefined {
    let scope: SymbolScope | undefined = globalScope;
    for (const scopeName of scopePathText.split('::')) {
        scope = scope?.lookupScope(scopeName);
    }

    return scope;
}

function expectFunctionScopeNames(content: string, expectedScopesByFunction: Record<string, string[]>) {
    const inspector = inspectFileContents(makeFileContentList(content));
    const globalScope = inspector.getRecord('file:///path/to/file.as').analyzerScope.globalScope;

    for (const [functionPath, expectedScopes] of Object.entries(expectedScopesByFunction)) {
        const functionHolderScope = lookupScopePath(globalScope, functionPath);
        if (functionHolderScope === undefined) {
            throw new Error(`Expected function holder scope "${functionPath}", but got none.`);
        }

        const actualScopes = [...functionHolderScope.childScopeTable.keys()];
        const missingScopes = expectedScopes.filter(scope => actualScopes.includes(scope) === false);
        const unexpectedScopes = actualScopes.filter(scope => expectedScopes.includes(scope) === false);
        if (missingScopes.length > 0 || unexpectedScopes.length > 0) {
            throw new Error(
                [
                    `Incorrect function scope names for "${functionPath}".`,
                    `expected: ${expectedScopes.join(', ')}`,
                    `actual  : ${actualScopes.join(', ')}`,
                    `missing : ${missingScopes.join(', ')}`,
                    `extra   : ${unexpectedScopes.join(', ')}`
                ].join('\n')
            );
        }
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
            {
                'Example::fn': ['~const Obj@,int,array<int,int>', '~const Obj@,int,array<int,int>,const']
            }
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
            {
                'array::insertLast': ['~const T&in'],
                'array::assign': ['~const array<T>&in']
            }
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
            {
                fn: ['~T'],
                makeArray: ['~array<T>']
            }
        );
    });
});

import {describe, it} from 'node:test';
import {expectError, expectSuccess} from './utils';

describe('analyzer/duplicateDefinition', () => {
    it('detects duplicate class definitions', () => {
        expectError(`// Detect duplicate class definitions
			class A { }

			class A { }
		`);
    });
});

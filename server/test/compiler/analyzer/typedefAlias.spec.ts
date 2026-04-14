import {expectSuccess} from './utils';

describe('analyzer/typedefAlias', () => {
    it('accepts: array of typedef primitive matches array of original primitive', () => {
        expectSuccess(`
            typedef uint8 byte;

            class array<T> { }

            void main() {
                array<byte> src;
                array<uint8> dst = src;
            }
        `);
    });
});

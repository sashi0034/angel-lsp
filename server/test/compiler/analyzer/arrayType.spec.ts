import {expectError, expectSuccess} from './utils';

const predefined = {
    uri: 'file:///path/to/as.predefined',
    content: `class array<T> {
        T& opIndex(uint index);
        uint length() const;
    }`
};

describe('analyzer/arrayType', () => {
    it('accepts: Single-dimensional array declaration and indexing.', () => {
        expectSuccess([
            predefined,
            {
                uri: 'file:///path/to/file.as',
                content: `
                void main() {
                    int[] arr;
                    auto v = arr[0];
                }`
            }
        ]);
    });

    it('accepts: Multi-dimensional array declaration resolves correct element type.', () => {
        expectSuccess([
            predefined,
            {
                uri: 'file:///path/to/file.as',
                content: `
                void main() {
                    int[][][] d3;
                    auto d2 = d3[0];
                    auto d1 = d2[0];
                    int v = d1[0];
                }`
            }
        ]);
    });

    it('accepts: Five-dimensional array indexing resolves to the correct element type.', () => {
        expectSuccess([
            predefined,
            {
                uri: 'file:///path/to/file.as',
                content: `
                void accepts_d3(int[][][] d3) { }
                
                void main() {
                    int[][][][][] d5;
                    auto d4 = d5[0];
                    auto d3 = d4[0];
                    auto d2 = d3[0];
                    auto d1 = d2[0];
                    int v = d1[0];
                    
                    accepts_d3(d5[0][0]);
                }`
            }
        ]);
    });

    it('accepts: Multi-dimensional array as function parameter.', () => {
        expectSuccess([
            predefined,
            {
                uri: 'file:///path/to/file.as',
                content: `
                void receive(int[][] matrix) { }

                void main() {
                    int[][] m;
                    receive(m);
                }`
            }
        ]);
    });

    it('rejects: Assigning deeply-indexed element to wrong type.', () => {
        expectError([
            predefined,
            {
                uri: 'file:///path/to/file.as',
                content: `
                class Other { }

                void main() {
                    int[][] d2;
                    Other v = d2[0];
                }`
            }
        ]);
    });
});

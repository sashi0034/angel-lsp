import {expectError, expectSuccess} from './utils';

describe('analyzer/foreachStatement', () => {
    it('accepts analyzer case 1', () => {
        expectSuccess([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class array<T>{
                    uint opForBegin() const;
                    bool opForEnd(uint) const;
                    uint opForNext(uint) const;
                    const T& opForValue0(uint index) const;
                    uint opForValue1(uint index) const;
                }`
            },
            {
                uri: 'file:///path/to/file.as',
                content: `// foreach statement is available.
                int iterate(array<bool> arr) {
                    int sum;
                    foreach (const auto f, const auto i : arr) {
                        sum += f ? i : 0;
                    }

                    foreach (const auto f : arr) {
                        sum += f ? 1 : 0;
                    }

                    return sum;
                }`
            }
        ]);
    });

    it('rejects analyzer case 2', () => {
        expectError([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class array<T>{
                    uint opForBegin() const;
                    bool opForEnd(uint) const;
                    uint opForNext(uint) const;
                    const T& opForValue0(uint index) const;
                    uint opForValue1(uint index) const;
                }`
            },
            {
                uri: 'file:///path/to/file.as',
                content: `// Cannot use foreach statement with too many variables.
                int iterate(array<bool> arr) {
                    int sum;
                    foreach (const auto f, const auto i, const auto unknown : arr) {
                        sum += f ? i : 0;
                    }

                    return sum;
                }`
            }
        ]);
    });

    it('rejects: Auto handles cannot be inferred from primitive foreach values.', () => {
        expectError([
            {
                uri: 'file:///path/to/as.predefined',
                content: `
                class array<T>{
                    uint opForBegin() const;
                    bool opForEnd(uint) const;
                    uint opForNext(uint) const;
                    const T& opForValue(uint index) const;
                }`
            },
            {
                uri: 'file:///path/to/file.as',
                content: `
                void iterate(array<int> arr) {
                    foreach (const auto@ value : arr) {
                    }
                }`
            }
        ]);
    });
});

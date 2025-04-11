import {expectSuccess} from "./utils";

describe('analyzer/foreachStatement', () => {
    expectSuccess([{
        uri: 'file:///path/to/as.predefined',
        content: `
            class array<T>{
                uint opForBegin() const;
                bool opForEnd(uint) const;
                uint opForNext(uint) const;
                const T& opForValue0(uint index) const;
                uint opForValue1(uint index) const;
            }`
    }, {
        uri: 'file:///path/to/file.as',
        content: `// foreach statement is available.
            int iterate(array<bool> arr) {
                int sum;
                foreach (const auto f, const auto i : arr) {
                    sum += f ? i : 0;
                }
                return sum;
            }`
    }]);
});
import {expectSuccess} from "./utils";

describe('analyzer/hoist', () => {
    expectSuccess(`// Function can use a type declared after it.
        Value get_value() { return Value(); }
        
        class Value { }
    `);
});

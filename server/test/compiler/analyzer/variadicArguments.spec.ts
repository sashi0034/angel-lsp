import {expectError, expectSuccess} from "./utils";

describe('analyzer/variadicArguments', () => {
    expectSuccess([
        {
            uri: 'file:///path/to/as.predefined',
            content: `
                class Str { }
                void format(const Str& in str, const Str& in ...);
            `
        },
        {
            uri: 'file:///path/to/file.as',
            content: `// Variadic arguments are supported.
                void main() {
                    Str str;
                    format(str, str);
                    format(str, str, str);
                    format(str, str, Str(), str);
                }
            `
        }
    ]);

    expectError([
        {
            uri: 'file:///path/to/as.predefined',
            content: `
                class Str { }
                void format(const Str& in str, const Str& in ...);
            `
        },
        {
            uri: 'file:///path/to/file.as',
            content: `// Variadic arguments need at least one argument.
                void main() {
                    Str str;
                    format(str);
                }
            `
        }
    ]);

    expectError([
        {
            uri: 'file:///path/to/as.predefined',
            content: `
                class Str { }
                void format(const Str& in str, const Str& in ...);
            `
        },
        {
            uri: 'file:///path/to/file.as',
            content: `// Variadic arguments need at least one argument.
                void main() {
                    Str str;
                    format(str);
                }
            `
        }
    ]);

    expectError([
        {
            uri: 'file:///path/to/as.predefined',
            content: `
                class Str { }
                void format(const Str& in str, const Str& in ...);
            `
        },
        {
            uri: 'file:///path/to/file.as',
            content: `// Type mismatch in variadic arguments.
                void main() {
                    Str str;
                    format(str, Str(), 1);
                }
            `
        }
    ]);
});


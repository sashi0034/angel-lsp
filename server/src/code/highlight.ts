// https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide

export enum HighlightForToken {
    Invalid,
    Namespace, // For identifiers that declare or reference a namespace, module, or package.
    Class, // For identifiers that declare or reference a class type.
    Enum, // For identifiers that declare or reference an enumeration type.
    Interface, // For identifiers that declare or reference an interface type.
    Struct, // For identifiers that declare or reference a struct type.
    TypeParameter, // For identifiers that declare or reference a type parameter.
    Type, // For identifiers that declare or reference a type that is not covered above.
    Parameter, // For identifiers that declare or reference a function or method parameters.
    Variable, // For identifiers that declare or reference a local or global variable.
    Property, // For identifiers that declare or reference a member property, member field, or member variable.
    EnumMember, // For identifiers that declare or reference an enumeration property, constant, or member.
    Decorator, // For identifiers that declare or reference decorators and annotations.
    Event, // For identifiers that declare an event property.
    Function, // For identifiers that declare a function.
    Method, // For identifiers that declare a member function or method.
    Macro, // For identifiers that declare a macro.
    Label, // For identifiers that declare a label.
    Comment, // For tokens that represent a comment.
    String, // For tokens that represent a string literal.
    Keyword, // For tokens that represent a language keyword.
    Number, // For tokens that represent a number literal.
    Regexp, // For tokens that represent a regular expression literal.
    Operator, // For tokens that represent an operator.
    // The following are specific to AngelScript Language Server:
    Builtin, // For tokens that represent a built-in type or function.
    Directive, // For tokens that represent a preprocessor directive.
}

export const highlightForTokenList = [
    '',
    'namespace',
    'class',
    'enum',
    'interface',
    'struct',
    'typeParameter',
    'type',
    'parameter',
    'variable',
    'property',
    'enumMember',
    'decorator',
    'event',
    'function',
    'method',
    'macro',
    'label',
    'comment',
    'string',
    'keyword',
    'number',
    'regexp',
    'operator',
    'builtin',
    'directive',
];

export enum HighlightForModifier {
    Declaration, // For declarations of symbols.
    Definition, // For definitions of symbols, for example, in header files.
    Readonly, // For readonly variables and member fields (constants).
    Static, // For class members (static members).
    Deprecated, // For symbols that should no longer be used.
    Abstract, // For types and member functions that are abstract.
    Async, // For functions that are marked async.
    Modification, // For variable references where the variable is assigned to.
    Documentation, // For occurrences of symbols in documentation.
    DefaultLibrary, // For symbols that are part of the standard library.
    Nothing,
}

export const highlightForModifierList = [
    'declaration',
    'definition',
    'readonly',
    'static',
    'deprecated',
    'abstract',
    'async',
    'modification',
    'documentation',
    'defaultLibrary',
    '',
];

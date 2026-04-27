import {Trie, TriePair} from '../utils/trie';
import {Mutable} from '../utils/utilities';
import assert = require('assert');

// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_reserved_keywords.html

// Non-alphanumeric reserved words are called punctuators in this context.
// A list of all punctuators.
const reservedPunctuatorArray = [
    '*',
    '**',
    '/',
    '%',
    '+',
    '-',
    '<=',
    '<',
    '>=',
    '>',
    '(',
    ')',
    '==',
    '!=',
    '?',
    ':',
    '=',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '**=',
    '++',
    '--',
    '&',
    ',',
    '{',
    '}',
    ';',
    '|',
    '^',
    '~',
    '<<',
    '>>',
    '>>>',
    '&=',
    '|=',
    '^=',
    '<<=',
    '>>=',
    '>>>=',
    '.',
    '...',
    '&&',
    '||',
    '!',
    '[',
    ']',
    '^^',
    '@',
    '!is',
    '::',
    '#' // Strictly speaking, '#' is not a punctuator, but is included here for use in preprocessing.
];

// Punctuators excluding context-dependent reserved words.
// We call these atomic punctuators.
// For example, in `array<array<int>>`, `>>` should be recognized as two `>` tokens.
// This should not include non-alphanumeric characters that are not punctuators.
const reservedAtomicPunctuatorArray = [
    '*',
    '**',
    '/',
    '%',
    '+',
    '-',
    '<=',
    '<',
    '>',
    '(',
    ')',
    '==',
    '!=',
    '?',
    ':',
    '=',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '**=',
    '++',
    '--',
    '&',
    ',',
    '{',
    '}',
    ';',
    '|',
    '^',
    '~',
    '<<',
    '&=',
    '|=',
    '^=',
    '<<=',
    '.',
    '...',
    '&&',
    '||',
    '!',
    '[',
    ']',
    '^^',
    '@',
    '::',
    // '>=', '>>', '>>>', '>>=', '>>>=', '!is' // These are context-dependent.
    '#' // For preprocessor
];

// Alphanumeric reserved words are referred to as "Keywords" in this context.
// A list of reserved keywords composed of alphanumeric characters.
const reservedKeywordArray = [
    'and',
    'auto',
    'bool',
    'break',
    'case',
    'cast',
    'catch',
    'class',
    'const',
    'continue',
    'default',
    'do',
    'double',
    'else',
    'enum',
    'false',
    'float',
    'for',
    'funcdef',
    'if',
    'import',
    'in',
    'inout',
    'int',
    'interface',
    'int8',
    'int16',
    'int32',
    'int64',
    'is',
    'mixin',
    'namespace',
    'not',
    'null',
    'or',
    'out',
    'override',
    'private',
    'protected',
    'return',
    'switch',
    'true',
    'try',
    'typedef',
    'uint',
    'uint8',
    'uint16',
    'uint32',
    'uint64',
    'void',
    'while',
    'xor',
    'using'
    // Not really a reserved keyword, but is recognized by the compiler as a built-in keyword.
    // 'abstract', 'explicit', 'external', 'function', 'final', 'from', 'get', 'set', 'shared', 'super', 'this',
];

const exprPreOpSet = new Set(['-', '+', '!', '++', '--', '~', '@', 'not']);

const bitOpSet = new Set(['&', '|', '^', '<<', '>>', '>>>']);

const mathOpSet = new Set(['+', '-', '*', '/', '%', '**']);

const compOpSet = new Set(['==', '!=', '<', '<=', '>', '>=', 'is', '!is']);

const logicOpSet = new Set(['&&', '||', '^^', 'and', 'or', 'xor']);

const assignOpSet = new Set(['=', '+=', '-=', '*=', '/=', '|=', '&=', '^=', '%=', '**=', '<<=', '>>=', '>>>=']);

export const numberTypeSet = new Set<string>([
    'int',
    'int8',
    'int16',
    'int32',
    'int64',
    'uint',
    'uint8',
    'uint16',
    'uint32',
    'uint64',
    'float',
    'double'
]);

const primitiveTypeSet = new Set<string>([
    'void',
    'int',
    'int8',
    'int16',
    'int32',
    'int64',
    'uint',
    'uint8',
    'uint16',
    'uint32',
    'uint64',
    'float',
    'double',
    'bool'
]);

const integerTypeSet = new Set<string>([
    'int',
    'int8',
    'int16',
    'int32',
    'int64',
    'uint',
    'uint8',
    'uint16',
    'uint32',
    'uint64'
]);

const signedIntegerTypeSet = new Set<string>(['int', 'int8', 'int16', 'int32', 'int64']);

const unsignedIntegerTypeSet = new Set<string>(['uint', 'uint8', 'uint16', 'uint32', 'uint64']);

const floatingPointSet = new Set<string>(['float', 'double']);

export interface ReservedWordProperty {
    readonly isPunctuator: boolean;
    readonly isExprPreOp: boolean;
    readonly isExprOp: boolean;
    readonly isBitOp: boolean;
    readonly isMathOp: boolean;
    readonly isCompOp: boolean;
    readonly isLogicOp: boolean;
    readonly isAssignOp: boolean;
    readonly isNumber: boolean;
    readonly isPrimitiveType: boolean;
    readonly isIntegerType: boolean;
    readonly isSignedInteger: boolean;
    readonly isUnsignedInteger: boolean;
    readonly isFloatingPoint: boolean;
}

function makeEmptyProperty(): ReservedWordProperty {
    return {
        isPunctuator: false,
        isExprPreOp: false,
        isExprOp: false,
        isBitOp: false,
        isMathOp: false,
        isCompOp: false,
        isLogicOp: false,
        isAssignOp: false,
        isNumber: false,
        isPrimitiveType: false,
        isIntegerType: false,
        isSignedInteger: false,
        isUnsignedInteger: false,
        isFloatingPoint: false
    };
}

const reservedWordProperties = createProperties();

function createProperties() {
    const properties = new Map<string, Mutable<ReservedWordProperty>>();
    for (const symbol of [...reservedPunctuatorArray, ...reservedKeywordArray]) {
        properties.set(symbol, makeEmptyProperty());
    }

    for (const symbol of reservedPunctuatorArray) {
        properties.get(symbol)!.isPunctuator = true;
    }

    for (const symbol of exprPreOpSet) {
        properties.get(symbol)!.isExprPreOp = true;
    }

    for (const symbol of bitOpSet) {
        properties.get(symbol)!.isExprOp = true;
        properties.get(symbol)!.isBitOp = true;
    }

    for (const symbol of mathOpSet) {
        properties.get(symbol)!.isExprOp = true;
        properties.get(symbol)!.isMathOp = true;
    }

    for (const symbol of compOpSet) {
        properties.get(symbol)!.isExprOp = true;
        properties.get(symbol)!.isCompOp = true;
    }

    for (const symbol of logicOpSet) {
        properties.get(symbol)!.isExprOp = true;
        properties.get(symbol)!.isLogicOp = true;
    }

    for (const symbol of assignOpSet) {
        properties.get(symbol)!.isAssignOp = true;
    }

    for (const symbol of numberTypeSet) {
        properties.get(symbol)!.isNumber = true;
    }

    for (const symbol of primitiveTypeSet) {
        properties.get(symbol)!.isPrimitiveType = true;
    }

    for (const symbol of integerTypeSet) {
        properties.get(symbol)!.isIntegerType = true;
    }

    for (const symbol of signedIntegerTypeSet) {
        properties.get(symbol)!.isSignedInteger = true;
    }

    for (const symbol of unsignedIntegerTypeSet) {
        properties.get(symbol)!.isUnsignedInteger = true;
    }

    for (const symbol of floatingPointSet) {
        properties.get(symbol)!.isFloatingPoint = true;
    }

    return properties;
}

const reservedAtomicPunctuatorProperties = createAtomicPunctuatorPropertyTrie();

function createAtomicPunctuatorPropertyTrie() {
    const punctuatorMap = new Trie<ReservedWordProperty>();
    for (const punctuator of reservedAtomicPunctuatorArray) {
        punctuatorMap.insert(punctuator, reservedWordProperties.get(punctuator)!);
    }

    return punctuatorMap;
}

/**
 * Searches for a reserved word property in the trie for punctuators with context-dependent reserved words removed.
 * @param str - The string to search within.
 * @param start - The starting position in the string to begin the search.
 * @returns A `TriePair<ReservedWordProperty>` if a match is found, or `undefined` if not.
 */
export function findReservedAtomicPunctuatorProperty(
    str: string,
    start: number
): TriePair<ReservedWordProperty> | undefined {
    return reservedAtomicPunctuatorProperties.find(str, start);
}

const reservedKeywordProperties = createKeywordPropertyMap();

function createKeywordPropertyMap() {
    const keywordMap = new Map<string, ReservedWordProperty>();
    for (const keyword of reservedKeywordArray) {
        keywordMap.set(keyword, reservedWordProperties.get(keyword)!);
    }

    return keywordMap;
}

/**
 * Searches for a reserved word property in the map for alphanumeric reserved words.
 * @param str
 */
export function findReservedKeywordProperty(str: string) {
    return reservedKeywordProperties.get(str);
}

/**
 * Searches for a reserved word property in the map for all reserved words.
 * @param str
 */
export function findAllReservedWordProperty(str: string) {
    const result = reservedWordProperties.get(str);
    if (result !== undefined) {
        return result;
    }

    assert(false);
}

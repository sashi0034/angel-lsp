import {Trie, TriePair} from "../utils/trie";
import {Mutable} from "../utils/utilities";
import assert = require("assert");

// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_reserved_keywords.html

// Symbols that are non-alphanumeric reserved words are referred to as "Marks" in this context.
// A list of all Marks
const reservedMarkArray = [
    '*', '**', '/', '%', '+', '-', '<=', '<', '>=', '>', '(', ')', '==', '!=', '?', ':', '=', '+=', '-=', '*=', '/=', '%=', '**=', '++', '--', '&', ',', '{', '}', ';', '|', '^', '~', '<<', '>>', '>>>', '&=', '|=', '^=', '<<=', '>>=', '>>>=', '.', '...', '&&', '||', '!', '[', ']', '^^', '@', '!is', '::',
    '#', // Strictly speaking, '#' is not a Mark, but is included here for use in preprocessing.
];

// A list of Marks with context-dependent reserved words removed. We call it Atomic Marks.
// For example, in "array<array<int>>", '>>' should be recognized as ['>', '>'].
// This should not include non-alphanumeric characters that are not Marks.
const reservedAtomicMarkArray = [
    '*', '**', '/', '%', '+', '-', '<=', '<', '>', '(', ')', '==', '!=', '?', ':', '=', '+=', '-=', '*=', '/=', '%=', '**=', '++', '--', '&', ',', '{', '}', ';', '|', '^', '~', '<<', '&=', '|=', '^=', '<<=', '.', '...', '&&', '||', '!', '[', ']', '^^', '@', '::',
    // '>=', '>>', '>>>', '>>=', '>>>=', '!is' // These are context-dependent.
    '#', // For preprocessor
];

// Alphanumeric reserved words are referred to as "Keywords" in this context.
// A list of reserved keywords composed of alphanumeric characters.
const reservedKeywordArray = [
    'and', 'auto', 'bool', 'break', 'case', 'cast', 'catch', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'false', 'float', 'for', 'funcdef', 'if', 'import', 'in', 'inout', 'int', 'interface', 'int8', 'int16', 'int32', 'int64', 'is', 'mixin', 'namespace', 'not', 'null', 'or', 'out', 'override', 'private', 'protected', 'return', 'switch', 'true', 'try', 'typedef', 'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'void', 'while', 'xor', 'using'
    // Not really a reserved keyword, but is recognized by the compiler as a built-in keyword.
    // 'abstract', 'explicit', 'external', 'function', 'final', 'from', 'get', 'set', 'shared', 'super', 'this',
];

const exprPreOpSet = new Set(['-', '+', '!', '++', '--', '~', '@', 'not']);

const bitOpSet = new Set(['&', '|', '^', '<<', '>>', '>>>']);

const mathOpSet = new Set(['+', '-', '*', '/', '%', '**']);

const compOpSet = new Set(['==', '!=', '<', '<=', '>', '>=', 'is', '!is']);

const logicOpSet = new Set(['&&', '||', '^^', 'and', 'or', 'xor']);

const assignOpSet = new Set(['=', '+=', '-=', '*=', '/=', '|=', '&=', '^=', '%=', '**=', '<<=', '>>=', '>>>=']);

export const numberTypeSet = new Set<string>(['int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'float', 'double']);

const primeTypeSet = new Set<string>(['void', 'int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'float', 'double', 'bool']);

const signedIntegerTypeSet = new Set<string>(['int', 'int8', 'int16', 'int32', 'int64']);

const unsignedIntegerTypeSet = new Set<string>(['uint', 'uint8', 'uint16', 'uint32', 'uint64']);

const floatTypeSet = new Set<string>(['float']);

const doubleTypeSet = new Set<string>(['double']);

export interface ReservedWordProperty {
    readonly isMark: boolean;
    readonly isExprPreOp: boolean;
    readonly isExprOp: boolean;
    readonly isBitOp: boolean;
    readonly isMathOp: boolean;
    readonly isCompOp: boolean;
    readonly isLogicOp: boolean;
    readonly isAssignOp: boolean;
    readonly isNumber: boolean;
    readonly isPrimeType: boolean;
    readonly isSignedInteger: boolean;
    readonly isUnsignedInteger: boolean;
    readonly isFloat: boolean;
    readonly isDouble: boolean;
}

function makeEmptyProperty(): ReservedWordProperty {
    return {
        isMark: false,
        isExprPreOp: false,
        isExprOp: false,
        isBitOp: false,
        isMathOp: false,
        isCompOp: false,
        isLogicOp: false,
        isAssignOp: false,
        isNumber: false,
        isPrimeType: false,
        isSignedInteger: false,
        isUnsignedInteger: false,
        isFloat: false,
        isDouble: false,
    };
}

const reservedWordProperties = createProperties();

function createProperties() {
    const properties = new Map<string, Mutable<ReservedWordProperty>>();
    for (const symbol of [...reservedMarkArray, ...reservedKeywordArray]) {
        properties.set(symbol, makeEmptyProperty());
    }

    for (const symbol of reservedMarkArray) {
        properties.get(symbol)!.isMark = true;
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

    for (const symbol of primeTypeSet) {
        properties.get(symbol)!.isPrimeType = true;
    }

    for (const symbol of signedIntegerTypeSet) {
        properties.get(symbol)!.isSignedInteger = true;
    }

    for (const symbol of unsignedIntegerTypeSet) {
        properties.get(symbol)!.isUnsignedInteger = true;
    }

    for (const symbol of floatTypeSet) {
        properties.get(symbol)!.isFloat = true;
    }

    for (const symbol of doubleTypeSet) {
        properties.get(symbol)!.isDouble = true;
    }

    return properties;
}

const reservedAtomicMarkProperties = createAtomicMarkPropertyTrie();

function createAtomicMarkPropertyTrie() {
    const markMap = new Trie<ReservedWordProperty>();
    for (const mark of reservedAtomicMarkArray) {
        markMap.insert(mark, reservedWordProperties.get(mark)!);
    }
    return markMap;
}

/**
 * Searches for a reserved word property in the trie for Marks with context-dependent reserved words removed.
 * @param str - The string to search within.
 * @param start - The starting position in the string to begin the search.
 * @returns A `TriePair<ReservedWordProperty>` if a match is found, or `undefined` if not.
 */
export function findReservedAtomicMarkProperty(str: string, start: number): TriePair<ReservedWordProperty> | undefined {
    return reservedAtomicMarkProperties.find(str, start);
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
    if (result !== undefined) return result;
    assert(false);
}

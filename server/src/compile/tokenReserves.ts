import {ReservedWordProperty} from "./tokens";
import {Trie} from "../utils/trie";
import assert = require("assert");

// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_reserved_keywords.html

// All marks | 全記号郡
const reservedMarkArray = [
    '*', '**', '/', '%', '+', '-', '<=', '<', '>=', '>', '(', ')', '==', '!=', '?', ':', '=', '+=', '-=', '*=', '/=', '%=', '**=', '++', '--', '&', ',', '{', '}', ';', '|', '^', '~', '<<', '>>', '>>>', '&=', '|=', '^=', '<<=', '>>=', '>>>=', '.', '&&', '||', '!', '[', ']', '^^', '@', '!is', '::',
    '#', // For preprocessor
];

// A group of marks with context-dependent elements removed. | 文脈依存の要素を取り除いた記号郡
const reservedWeakMarkArray = [
    '*', '**', '/', '%', '+', '-', '<=', '<', '>', '(', ')', '==', '!=', '?', ':', '=', '+=', '-=', '*=', '/=', '%=', '**=', '++', '--', '&', ',', '{', '}', ';', '|', '^', '~', '<<', '&=', '|=', '^=', '<<=', '.', '&&', '||', '!', '[', ']', '^^', '@', '::',
    // '>=', '>>', '>>>', '>>=', '>>>=', '!is'
    '#', // For preprocessor
];

// Reserved keywords consisting of alphanumeric characters | 英数字から構成される予約後郡
const reservedKeywordArray = [
    'and', 'auto', 'bool', 'break', 'case', 'cast', 'catch', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'false', 'float', 'for', 'funcdef', 'if', 'import', 'in', 'inout', 'int', 'interface', 'int8', 'int16', 'int32', 'int64', 'is', 'mixin', 'namespace', 'not', 'null', 'or', 'out', 'override', 'private', 'property', 'protected', 'return', 'switch', 'true', 'try', 'typedef', 'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'void', 'while', 'xor',
    // Not really a reserved keyword, but is recognized by the compiler as a built-in keyword.
    // 'abstract', 'explicit', 'external', 'function', 'final', 'from', 'get', 'set', 'shared', 'super', 'this',
];

const exprPreOpSet = new Set(['-', '+', '!', '++', '--', '~', '@']);

const bitOpSet = new Set(['&', '|', '^', '<<', '>>', '>>>']);

const mathOpSet = new Set(['+', '-', '*', '/', '%', '**']);

const compOpSet = new Set(['==', '!=', '<', '<=', '>', '>=', 'is', '!is']);

const logicOpSet = new Set(['&&', '||', '^^', 'and', 'or', 'xor']);

const assignOpSet = new Set(['=', '+=', '-=', '*=', '/=', '|=', '&=', '^=', '%=', '**=', '<<=', '>>=', '>>>=']);

export const numberTypeSet = new Set<string>(['int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'float', 'double']);

const primeTypeSet = new Set<string>(['void', 'int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'float', 'double', 'bool']);

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
    };
}

const reservedWordProperties = createProperties();

function createProperties() {
    const properties = new Map<string, ReservedWordProperty>();
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

    return properties;
}

const reservedWeakMarkProperties = createWeakMarkPropertyTrie();

function createWeakMarkPropertyTrie() {
    const markMap = new Trie<ReservedWordProperty>();
    for (const mark of reservedWeakMarkArray) {
        markMap.insert(mark, reservedWordProperties.get(mark)!);
    }
    return markMap;
}

// 記号の予約語をプロパティ検索
export function findReservedWeakMarkProperty(str: string, start: number) {
    return reservedWeakMarkProperties.find(str, start);
}

const reservedKeywordProperties = createKeywordPropertyMap();

function createKeywordPropertyMap() {
    const keywordMap = new Map<string, ReservedWordProperty>();
    for (const keyword of reservedKeywordArray) {
        keywordMap.set(keyword, reservedWordProperties.get(keyword)!);
    }
    return keywordMap;
}

// Search for reserved words of keywords | キーワードの予約語をプロパティ検索
export function findReservedKeywordProperty(str: string) {
    return reservedKeywordProperties.get(str);
}

// Search for all reserved words | 予約後全てからプロパティ検索
export function findAllReservedWordProperty(str: string) {
    const result = reservedWordProperties.get(str);
    if (result !== undefined) return result;
    assert(false);
}

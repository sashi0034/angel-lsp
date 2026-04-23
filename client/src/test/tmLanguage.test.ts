import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

type GrammarRule = {
    name?: string;
    scopeName?: string;
    match?: string;
    begin?: string;
    end?: string;
    captures?: Record<string, GrammarRule>;
    beginCaptures?: Record<string, GrammarRule>;
    endCaptures?: Record<string, GrammarRule>;
    patterns?: GrammarRule[];
    repository?: Record<string, GrammarRule>;
};

const grammarPath = path.resolve(__dirname, '../../../angelscript.tmLanguage.json');
const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8')) as GrammarRule;
const rules = flattenRules(grammar);

suite('AngelScript TextMate grammar', () => {
    test('declares the scopes used by both AngelScript language ids', () => {
        assert.equal(grammar.name, 'angelscript');
        assert.equal(grammar.scopeName, 'source.angelscript');
    });

    test('matches language keywords and access modifiers', () => {
        assertRuleMatches('keyword.declaration.angelscript', 'typedef');
        assertRuleMatches('storage.type.class', 'interface');
        assertRuleMatches('storage.type.namespace', 'namespace');
        assertRuleMatches('keyword.control.angelscript', 'fallthrough');
        assertRuleMatches('keyword.type.angelscript', 'mixin');
        assertRuleMatches('storage.access.angelscript', 'protected');
        assertRuleMatches('keyword.type.primitive.angelscript', 'uint64');
    });

    test('matches preprocessor directives with the expected scope name', () => {
        const rule = findRule('meta.preprocessor.angelscript');
        assert.ok(rule, 'Expected a preprocessor grammar rule.');
        assert.ok(rule.begin, 'Expected preprocessor rule to use begin/end.');
        assert.ok(toRegExp(rule.begin!).test('#include "shared.as"'));
    });

    test('matches comments, strings, and format-string interpolation', () => {
        assertBeginMatches('comment.line.double-slash.angelscript', '// comment');
        assertBeginMatches('comment.block.angelscript', '/* comment */');
        assertBeginMatches('string.quoted.triple.angelscript', '"""hello"""');
        assertBeginMatches('string.quoted.double.angelscript', '"hello"');
        assertBeginMatches('string.quoted.single.angelscript', "'c'");
        assertBeginMatches('string.quoted.double.angelscript', 'f"score {value:04d}"');
        assertOnigurumaRuleExists('constant.character.escape.angelscript', String.raw`\n`);
        assertRuleMatches('invalid.illegal.unknown-escape.angelscript', '\\q');
    });

    test('matches numeric literals and operators that often regress', () => {
        assertOnigurumaRuleExists('keyword.other.unit.binary.angelscript', "0b1010'0101");
        assertOnigurumaRuleExists('keyword.other.unit.hexadecimal.angelscript', "0xCAFE'BABE");
        assertRuleMatches('constant.numeric.decimal.angelscript', "1'000'000");
        assertRuleMatches('punctuation.separator.namespace.access.angelscript', 'Namespace::Symbol');
        assertRuleMatches('keyword.operator.assignment.compound.bitwise.angelscript', 'value >>= 1');
        assertOnigurumaRuleExists('keyword.operator.ternary.angelscript', 'ok ? a : b');
    });
});

function flattenRules(rule: GrammarRule): GrammarRule[] {
    const result: GrammarRule[] = [rule];
    for (const pattern of rule.patterns ?? []) {
        result.push(...flattenRules(pattern));
    }

    for (const capture of Object.values(rule.captures ?? {})) {
        result.push(...flattenRules(capture));
    }

    for (const capture of Object.values(rule.beginCaptures ?? {})) {
        result.push(...flattenRules(capture));
    }

    for (const capture of Object.values(rule.endCaptures ?? {})) {
        result.push(...flattenRules(capture));
    }

    for (const repositoryRule of Object.values(rule.repository ?? {})) {
        result.push(...flattenRules(repositoryRule));
    }

    return result;
}

function findRule(name: string): GrammarRule | undefined {
    return rules.find(rule => rule.name === name);
}

function assertRuleMatches(name: string, sample: string): void {
    const matchingRule = rules.find(
        rule => rule.name === name && rule.match !== undefined && toRegExp(rule.match).test(sample)
    );
    assert.ok(matchingRule, `Expected scope ${name} to match "${sample}".`);
}

function assertBeginMatches(name: string, sample: string): void {
    const matchingRule = rules.find(
        rule => rule.name === name && rule.begin !== undefined && toRegExp(rule.begin).test(sample)
    );
    assert.ok(matchingRule, `Expected begin scope ${name} to match "${sample}".`);
}

function assertOnigurumaRuleExists(name: string, sample: string): void {
    const matchingRule = rules.find(rule => rule.name === name);
    assert.ok(matchingRule, `Expected scope ${name} to have a grammar rule for "${sample}".`);
}

function toRegExp(pattern: string): RegExp {
    return new RegExp(pattern, 'm');
}

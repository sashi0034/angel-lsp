import {afterEach, describe, it} from 'mocha';
import {copyGlobalSettings, resetGlobalSettings} from '../../src/core/settings';
import {inspectFileContents} from '../inspectorUtils';
import {equal, ok} from 'node:assert';
import {DiagnosticTag} from 'vscode-languageserver-types';

const uri = 'file:///path/to/file.as';

function getPreprocessedTokenTexts(content: string): string[] {
    const inspector = inspectFileContents([{uri, content}]);
    return inspector.getRecord(uri).preprocessedOutput.preprocessedTokens.map(token => token.text);
}

function getPreprocessorDiagnostics(content: string) {
    const inspector = inspectFileContents([{uri, content}]);
    return inspector.getRecord(uri).diagnosticsInParser;
}

function getIncludePathTokenTexts(content: string): string[] {
    const inspector = inspectFileContents([{uri, content}]);
    return inspector.getRecord(uri).preprocessedOutput.includePathTokens.map(token => token.text);
}

describe('compiler/preprocessor', () => {
    afterEach(() => {
        resetGlobalSettings(undefined);
    });

    it('uses configured preprocessor defined symbols', () => {
        const content = `
#if ENABLE_SYMBOL
int featureEnabled;
#endif

int alwaysEnabled;
`;
        const settings = copyGlobalSettings();
        settings.definedSymbols = ['ENABLE_SYMBOL'];
        resetGlobalSettings(settings);

        const tokenTexts = getPreprocessedTokenTexts(content);

        ok(tokenTexts.includes('featureEnabled'));
        ok(tokenTexts.includes('alwaysEnabled'));
    });

    it('omits inactive #if blocks without configured symbols', () => {
        const content = `
#if ENABLE_SYMBOL
int featureEnabled;
#endif

int alwaysEnabled;
`;
        resetGlobalSettings(undefined);

        const tokenTexts = getPreprocessedTokenTexts(content);

        ok(!tokenTexts.includes('featureEnabled'));
        ok(tokenTexts.includes('alwaysEnabled'));
    });

    it('uses the first active #elif branch', () => {
        const content = `
#if DISABLED_SYMBOL
int disabledBranch;
#elif ENABLE_SYMBOL
int elifBranch;
#else
int elseBranch;
#endif
`;
        const settings = copyGlobalSettings();
        settings.definedSymbols = ['ENABLE_SYMBOL'];
        resetGlobalSettings(settings);

        const tokenTexts = getPreprocessedTokenTexts(content);

        ok(!tokenTexts.includes('disabledBranch'));
        ok(tokenTexts.includes('elifBranch'));
        ok(!tokenTexts.includes('elseBranch'));
    });

    it('uses #else when no previous branch is active', () => {
        const content = `
#if DISABLED_SYMBOL
int disabledBranch;
#elif ALSO_DISABLED
int elifBranch;
#else
int elseBranch;
#endif
`;

        const tokenTexts = getPreprocessedTokenTexts(content);

        ok(!tokenTexts.includes('disabledBranch'));
        ok(!tokenTexts.includes('elifBranch'));
        ok(tokenTexts.includes('elseBranch'));
    });

    it('marks only the inactive #else branch unnecessary', () => {
        const content = `
#if 1
int ifBranch;
#else
int elseBranch;
#endif
`;

        const tokenTexts = getPreprocessedTokenTexts(content);
        const diagnostics = getPreprocessorDiagnostics(content).filter(diagnostic =>
            diagnostic.tags?.includes(DiagnosticTag.Unnecessary)
        );

        ok(tokenTexts.includes('ifBranch'));
        ok(!tokenTexts.includes('elseBranch'));
        equal(diagnostics.length, 1);
        equal(diagnostics[0].range.start.line, 4);
    });

    it('evaluates numeric #if conditions', () => {
        const content = `
#if 0
int zeroBranch;
#endif

#if 1
int oneBranch;
#endif
`;

        const tokenTexts = getPreprocessedTokenTexts(content);

        ok(!tokenTexts.includes('zeroBranch'));
        ok(tokenTexts.includes('oneBranch'));
    });

    it('omits includes from inactive #if blocks', () => {
        const content = `
#if 0
#include "disabled.as"
#endif

#if 1
#include "enabled.as"
#endif
`;

        const includePathTexts = getIncludePathTokenTexts(content);

        ok(!includePathTexts.includes('"disabled.as"'));
        ok(includePathTexts.includes('"enabled.as"'));
    });

    it('omits defines from inactive #if blocks', () => {
        const content = `
#if 0
#define DISABLED_SYMBOL
#endif

#if DISABLED_SYMBOL
int disabledBranch;
#else
int elseBranch;
#endif
`;

        const tokenTexts = getPreprocessedTokenTexts(content);

        ok(!tokenTexts.includes('disabledBranch'));
        ok(tokenTexts.includes('elseBranch'));
    });

    it('evaluates prefixed numeric #if conditions', () => {
        const content = `
#if 0x0
int hexZeroBranch;
#endif

#if 0x2356
int hexBranch;
#endif

#if 0b0
int binaryZeroBranch;
#endif

#if 0b0101
int binaryBranch;
#endif

#if 0o0
int octalZeroBranch;
#endif

#if 0o123
int octalBranch;
#endif

#if 0d0
int decimalZeroBranch;
#endif

#if 0d2356
int decimalBranch;
#endif
`;

        const tokenTexts = getPreprocessedTokenTexts(content);

        ok(!tokenTexts.includes('hexZeroBranch'));
        ok(tokenTexts.includes('hexBranch'));
        ok(!tokenTexts.includes('binaryZeroBranch'));
        ok(tokenTexts.includes('binaryBranch'));
        ok(!tokenTexts.includes('octalZeroBranch'));
        ok(tokenTexts.includes('octalBranch'));
        ok(!tokenTexts.includes('decimalZeroBranch'));
        ok(tokenTexts.includes('decimalBranch'));
    });
});

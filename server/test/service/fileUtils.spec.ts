import {describe, it, afterEach, beforeEach} from "mocha";
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {pathToFileURL} from "node:url";
import {
    isAngelscriptFile,
    isAngelscriptPredefinedFile,
    resolveUri,
    resolveIncludeUri
} from "../../src/service/fileUtils";
import {copyGlobalSettings, resetGlobalSettings} from "../../src/core/settings";

describe('fileUtils', () => {
    let tempDir: string;
    let tempFile: string;

    beforeEach(() => {
        // Create a temporary directory and file for testing
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fileUtils-test-'));
        tempFile = path.join(tempDir, 'test.as');
        fs.writeFileSync(tempFile, '// test file');
    });

    afterEach(() => {
        // Clean up temporary files
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, {recursive: true, force: true});
        }
        resetGlobalSettings(undefined);
    });

    describe('isAngelscriptFile', () => {
        it('should return true for .as files', () => {
            resetGlobalSettings({
                ...copyGlobalSettings(),
                angelscriptFilePatterns: ['*.as']
            });
            assert.strictEqual(isAngelscriptFile('test.as'), true);
            assert.strictEqual(isAngelscriptFile('/path/to/file.as'), true);
            assert.strictEqual(isAngelscriptFile('file:///path/to/file.as'), true);
        });

        it('should return false for non-.as files', () => {
            resetGlobalSettings({
                ...copyGlobalSettings(),
                angelscriptFilePatterns: ['*.as']
            });
            assert.strictEqual(isAngelscriptFile('test.txt'), false);
            assert.strictEqual(isAngelscriptFile('test.js'), false);
        });

        it('should support multiple patterns', () => {
            resetGlobalSettings({
                ...copyGlobalSettings(),
                angelscriptFilePatterns: ['*.as', '*.angelscript']
            });
            assert.strictEqual(isAngelscriptFile('test.as'), true);
            assert.strictEqual(isAngelscriptFile('test.angelscript'), true);
            assert.strictEqual(isAngelscriptFile('test.txt'), false);
        });

        it('should match full URI paths', () => {
            resetGlobalSettings({
                ...copyGlobalSettings(),
                angelscriptFilePatterns: ['*.as']
            });
            assert.strictEqual(isAngelscriptFile('file:///C:/path/to/file.as'), true);
            assert.strictEqual(isAngelscriptFile('file:///path/to/file.as'), true);
        });
    });

    describe('isAngelscriptPredefinedFile', () => {
        it('should return true for as.predefined files', () => {
            resetGlobalSettings({
                ...copyGlobalSettings(),
                angelscriptPredefinedFilePatterns: ['as.predefined']
            });
            assert.strictEqual(isAngelscriptPredefinedFile('as.predefined'), true);
            assert.strictEqual(isAngelscriptPredefinedFile('/path/to/as.predefined'), true);
            assert.strictEqual(isAngelscriptPredefinedFile('file:///path/to/as.predefined'), true);
        });

        it('should return false for non-predefined files', () => {
            resetGlobalSettings({
                ...copyGlobalSettings(),
                angelscriptPredefinedFilePatterns: ['as.predefined']
            });
            assert.strictEqual(isAngelscriptPredefinedFile('test.as'), false);
            assert.strictEqual(isAngelscriptPredefinedFile('test.txt'), false);
        });

        it('should support multiple patterns', () => {
            resetGlobalSettings({
                ...copyGlobalSettings(),
                angelscriptPredefinedFilePatterns: ['as.predefined', '*.predefined']
            });
            assert.strictEqual(isAngelscriptPredefinedFile('as.predefined'), true);
            assert.strictEqual(isAngelscriptPredefinedFile('custom.predefined'), true);
            assert.strictEqual(isAngelscriptPredefinedFile('test.as'), false);
        });
    });

    describe('resolveUri', () => {
        it('should resolve relative paths against base URI', () => {
            const baseUri = 'file:///C:/project/main.as';
            const relativePath = 'src/utils.as';
            const result = resolveUri(baseUri, relativePath);
            assert(result.includes('src/utils.as'));
            assert(result.includes('c%3A/project'));
        });

        it('should normalize file URIs with uppercase drive letters', () => {
            const baseUri = 'file:///C:/project/main.as';
            const relativePath = 'src/utils.as';
            const result = resolveUri(baseUri, relativePath);
            // Drive letter should be normalized to lowercase
            assert.match(result, /file:\/\/\/[a-z]%3A/);
        });

        it('should handle absolute paths in relativePath parameter', () => {
            const baseUri = 'file:///C:/project/main.as';
            const absolutePath = '/other/path/file.as';
            const result = resolveUri(baseUri, absolutePath);
            assert(result.includes('/other/path/file.as'));
        });

        it('should return empty string for invalid URIs', () => {
            const baseUri = 'not-a-valid-uri';
            const relativePath = 'src/utils.as';
            const result = resolveUri(baseUri, relativePath);
            assert.strictEqual(result, '');
        });

        it('should handle root-only paths', () => {
            const baseUri = 'file:///C:/';
            const relativePath = 'file.as';
            const result = resolveUri(baseUri, relativePath);
            assert.match(result, /file:\/\/\/[a-z]%3A\/file\.as/);
        });
    });

    describe('resolveIncludeUri', () => {
        it('should resolve absolute paths', () => {
            const baseUri = 'file:///C:/project/main.as';
            const absolutePath = tempFile;
            const result = resolveIncludeUri(baseUri, absolutePath);
            assert(result.includes('test.as'));
        });

        it('should resolve relative paths against base URI', () => {
            const baseDir = path.dirname(tempFile);
            const baseUri = pathToFileURL(path.join(baseDir, 'main.as')).toString();
            const relativePath = 'test.as';
            const result = resolveIncludeUri(baseUri, relativePath);
            assert(result.includes('test.as'));
        });

        it('should append default extension for files without extension', () => {
            resetGlobalSettings({
                ...copyGlobalSettings(),
                angelscriptFilePatterns: ['*.as']
            });
            const baseDir = path.dirname(tempFile);
            const baseUri = pathToFileURL(path.join(baseDir, 'main.as')).toString();
            const relativePath = 'test';
            const result = resolveIncludeUri(baseUri, relativePath);
            assert(result.includes('test.as'));
        });

        it('should not append extension for files matching patterns', () => {
            resetGlobalSettings({
                ...copyGlobalSettings(),
                angelscriptFilePatterns: ['*.as']
            });
            const baseDir = path.dirname(tempFile);
            const baseUri = pathToFileURL(path.join(baseDir, 'main.as')).toString();
            const relativePath = 'test.as';
            const result = resolveIncludeUri(baseUri, relativePath);
            // Should not double-append .as
            assert(result.includes('test.as'));
            assert(!result.includes('test.as.as'));
        });

        it('should use include paths as fallback', () => {
            const includeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'include-test-'));
            const includeFile = path.join(includeDir, 'included.as');
            fs.writeFileSync(includeFile, '// included file');

            try {
                resetGlobalSettings({
                    ...copyGlobalSettings(),
                    includePath: [includeDir],
                    angelscriptFilePatterns: ['*.as']
                });

                const baseUri = 'file:///C:/project/main.as';
                const relativePath = 'included.as';
                const result = resolveIncludeUri(baseUri, relativePath);
                assert(result.includes('included.as'));
            } finally {
                fs.rmSync(includeDir, {recursive: true, force: true});
            }
        });

        it('should handle multiple include paths', () => {
            const includeDir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'include1-test-'));
            const includeDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'include2-test-'));
            const includeFile = path.join(includeDir2, 'included.as');
            fs.writeFileSync(includeFile, '// included file');

            try {
                resetGlobalSettings({
                    ...copyGlobalSettings(),
                    includePath: [includeDir1, includeDir2],
                    angelscriptFilePatterns: ['*.as']
                });

                const baseUri = 'file:///C:/project/main.as';
                const relativePath = 'included.as';
                const result = resolveIncludeUri(baseUri, relativePath);
                assert(result.includes('included.as'));
            } finally {
                fs.rmSync(includeDir1, {recursive: true, force: true});
                fs.rmSync(includeDir2, {recursive: true, force: true});
            }
        });

        it('should return primary URI if file not found in include paths', () => {
            resetGlobalSettings({
                ...copyGlobalSettings(),
                includePath: ['/nonexistent/path'],
                angelscriptFilePatterns: ['*.as']
            });

            const baseUri = 'file:///C:/project/main.as';
            const relativePath = 'nonexistent.as';
            const result = resolveIncludeUri(baseUri, relativePath);
            // Should return the resolved URI even if file doesn't exist
            assert(result.includes('nonexistent.as'));
        });

        it('should support alternative file extensions', () => {
            resetGlobalSettings({
                ...copyGlobalSettings(),
                angelscriptFilePatterns: ['*.as', '*.angelscript']
            });
            const baseUri = 'file:///C:/project/main.as';
            const relativePath = 'test.angelscript';
            const result = resolveIncludeUri(baseUri, relativePath);
            assert(result.includes('test.angelscript'));
        });

        it('should handle predefined file patterns', () => {
            const predefinedFile = path.join(tempDir, 'as.predefined');
            fs.writeFileSync(predefinedFile, '// predefined');

            resetGlobalSettings({
                ...copyGlobalSettings(),
                angelscriptPredefinedFilePatterns: ['as.predefined']
            });

            const baseDir = tempDir;
            const baseUri = pathToFileURL(path.join(baseDir, 'main.as')).toString();
            const relativePath = 'as.predefined';
            const result = resolveIncludeUri(baseUri, relativePath);
            assert(result.includes('as.predefined'));
        });
    });
});

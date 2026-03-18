import {describe, it, afterEach, beforeEach} from "mocha";
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {pathToFileURL} from "node:url";
import {
    isAngelScriptFile,
    resolveUri,
    resolveIncludeUri,
    shouldExcludeFile
} from "../../src/service/fileUtils";
import {copyGlobalSettings, resetGlobalSettings} from "../../src/core/settings";
import {getEditorState} from "../../src/core/editorState";

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
        getEditorState().workspaceFolderUris = [];
    });

    describe('isAngelscriptFile', () => {
        it('should return true for .as files', () => {
            resetGlobalSettings({
                ...copyGlobalSettings(),
                files: {angelScript: ['*.as']}
            });
            assert.strictEqual(isAngelScriptFile('test.as'), true);
            assert.strictEqual(isAngelScriptFile('/path/to/file.as'), true);
            assert.strictEqual(isAngelScriptFile('file:///path/to/file.as'), true);
        });

        it('should return false for non-.as files', () => {
            resetGlobalSettings({
                ...copyGlobalSettings(),
                files: {angelScript: ['*.as']}
            });
            assert.strictEqual(isAngelScriptFile('test.txt'), false);
            assert.strictEqual(isAngelScriptFile('test.js'), false);
        });

        it('should support multiple patterns', () => {
            resetGlobalSettings({
                ...copyGlobalSettings(),
                files: {angelScript: ['*.as', '*.angelscript']}
            });
            assert.strictEqual(isAngelScriptFile('test.as'), true);
            assert.strictEqual(isAngelScriptFile('test.angelscript'), true);
            assert.strictEqual(isAngelScriptFile('test.txt'), false);
        });

        it('should match full URI paths', () => {
            resetGlobalSettings({
                ...copyGlobalSettings(),
                files: {angelScript: ['*.as']}
            });
            assert.strictEqual(isAngelScriptFile('file:///C:/path/to/file.as'), true);
            assert.strictEqual(isAngelScriptFile('file:///path/to/file.as'), true);
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
                files: {angelScript: ['*.as']}
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
                files: {angelScript: ['*.as']}
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
                    files: {angelScript: ['*.as']}
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
                    files: {angelScript: ['*.as']}
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
                files: {angelScript: ['*.as']}
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
                files: {angelScript: ['*.as', '*.angelscript']}
            });
            const baseUri = 'file:///C:/project/main.as';
            const relativePath = 'test.angelscript';
            const result = resolveIncludeUri(baseUri, relativePath);
            assert(result.includes('test.angelscript'));
        });
    });

    describe('shouldExcludeFile', () => {
        it('should return true if file matches exclude pattern', () => {
            resetGlobalSettings({
                ...copyGlobalSettings(),
                files: {
                    exclude: ['**/ignored.as']
                }
            });
            assert.strictEqual(shouldExcludeFile('file:///path/to/ignored.as'), true);
            assert.strictEqual(shouldExcludeFile('file:///path/to/normal.as'), false);
        });

        it('should resolve patterns against workspace root', () => {
            getEditorState().workspaceFolderUris = ['file:///C:/project'];
            resetGlobalSettings({
                ...copyGlobalSettings(),
                files: {
                    exclude: ['build/*.as']
                }
            });

            // shouldExcludeFile checks:
            // 1. minimatch('file:///c%3A/project/build/test.as', 'build/*.as') -> false
            // 2. minimatch('file:///c%3A/project/build/test.as', resolveUri('file:///C:/project/', 'build/*.as'))
            //    resolveUri('file:///C:/project/', 'build/*.as') -> 'file:///c%3A/project/build/*.as'
            //    minimatch('file:///c%3A/project/build/test.as', 'file:///c%3A/project/build/*.as') -> true

            assert.strictEqual(shouldExcludeFile('file:///c%3A/project/build/test.as'), true);
        });

        it('should return false if no exclude patterns are set', () => {
            resetGlobalSettings({
                ...copyGlobalSettings(),
                files: {
                    exclude: []
                }
            });
            assert.strictEqual(shouldExcludeFile('file:///path/to/file.as'), false);
        });
    });
});

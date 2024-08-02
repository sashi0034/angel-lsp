import {isVirtualToken, TokenizingToken, TokenKind} from "../compile/tokens";
import {Profiler} from "../code/profiler";
import {tokenize} from "../compile/tokenizer";
import {parseFromTokenized} from "../compile/parser";
import {analyzeFromParsed} from "../compile/analyzer";
import {diagnostic} from '../code/diagnostic';
import {Diagnostic} from "vscode-languageserver/node";
import {AnalyzedScope, createSymbolScope} from "../compile/scope";
import {tracer} from "../code/tracer";
import {NodeScript} from "../compile/nodes";
import {URI} from "vscode-languageserver";
import * as url from "url";
import * as path from "node:path";
import * as fs from "fs";
import {fileURLToPath} from "node:url";
import {URL} from 'url';
import {preprocessTokensForParser} from "../compile/parsingPreprocess";
import {getGlobalSettings} from "../code/settings";
import {createVirtualToken} from "../compile/parsingToken";

interface InspectResult {
    content: string;
    diagnostics: Diagnostic[];
    tokenizedTokens: TokenizingToken[];
    parsedAst: NodeScript;
    analyzedScope: AnalyzedScope;
}

const s_inspectedResults: { [uri: string]: InspectResult } = {};

function createEmptyResult(): InspectResult {
    return {
        content: '',
        diagnostics: [],
        tokenizedTokens: [],
        parsedAst: [],
        analyzedScope: new AnalyzedScope('', createSymbolScope(undefined, undefined, ''))
    } as const;
}

/**
 * Get the analyzed result of the specified file.
 */
export function getInspectedResult(uri: URI): InspectResult {
    const result = s_inspectedResults[uri];
    if (result === undefined) return createEmptyResult();
    return result;
}

/**
 * Get the list of all analyzed results as a list.
 */
export function getInspectedResultList(): InspectResult[] {
    return Object.values(s_inspectedResults);
}

/**
 * Compile the specified file and cache the result.
 */
export function inspectFile(content: string, targetUri: URI) {
    // Load as.predefined file
    const predefinedUri = checkInspectPredefined(targetUri);

    // Cache the inspected result
    s_inspectedResults[targetUri] = inspectInternal(content, targetUri, predefinedUri);
}

function checkInspectPredefined(targetUri: URI) {
    const dirs = splitUriIntoDirectories(targetUri);

    // If as.predefined has already been analyzed, return its URI | as.predefined が解析済みの場合、その URI を返す
    for (const dir of dirs) {
        const predefinedUri = dir + '/as.predefined';

        const predefinedResult = s_inspectedResults[predefinedUri];
        if (predefinedResult !== undefined) return predefinedUri;
    }

    // If as.predefined has not been analyzed, search for the file and start analyzing.
    for (const dir of dirs) {
        const predefinedUri = dir + '/as.predefined';

        const content = readFileFromUri(predefinedUri);
        if (content === undefined) continue;

        // Inspect found as.predefined
        s_inspectedResults[predefinedUri] = inspectInternal(content, predefinedUri, undefined);

        // Inspect all files under the directory where as.predefined is located, as we may need to reference them.
        if (predefinedUri !== undefined) {
            inspectAllFilesUnderDirectory(resolveUri(predefinedUri, '.'));
        }

        return predefinedUri;
    }

    return undefined;
}

function inspectAllFilesUnderDirectory(dirUri: string) {
    const entries = fs.readdirSync(fileURLToPath(dirUri), {withFileTypes: true});
    for (const entry of entries) {
        const fileUri = resolveUri(dirUri, entry.name);
        if (entry.isDirectory()) {
            inspectAllFilesUnderDirectory(fileUri);
        } else if (entry.isFile() && fileUri.endsWith('.as')) {
            const content = readFileFromUri(fileUri);
            if (content !== undefined) inspectFile(content, fileUri);
        }
    }
}

function readFileFromUri(uri: string): string | undefined {
    try {
        const path = fileURLToPath(uri);
        if (fs.existsSync(path) === false) return undefined;

        return fs.readFileSync(path, 'utf8');
    } catch (error) {
        return undefined;
    }
}

function splitUriIntoDirectories(fileUri: string): string[] {
    const parsedUrl = url.parse(fileUri);
    const currentPath = parsedUrl.pathname;
    if (currentPath === null) return [];

    const directories: string[] = [];
    let parentPath = currentPath;

    // Repeat until the directory reaches the root
    while (parentPath !== path.dirname(parentPath)) {
        parentPath = path.dirname(parentPath);
        directories.push(url.format({
            protocol: parsedUrl.protocol,
            slashes: true,
            hostname: parsedUrl.hostname,
            pathname: parentPath
        }));
    }

    return directories;
}

function inspectInternal(content: string, targetUri: URI, predefinedUri: URI | undefined): InspectResult {
    tracer.message(`🔬 Inspect "${targetUri}"`);

    diagnostic.launchSession();

    const profiler = new Profiler("Inspector");

    // Tokenizer-phase
    const tokenizedTokens = tokenize(content, targetUri);
    profiler.stamp("Tokenizer");

    // Preprocess tokens for parser
    const preprocessedTokens = preprocessTokensForParser(tokenizedTokens);
    profiler.stamp("Preprocess");

    // Parser-phase
    const parsedAst = parseFromTokenized(preprocessedTokens.parsingTokens);
    profiler.stamp("Parser");

    // Collect scopes in included files
    let includeFiles = preprocessedTokens.includeFiles;
    if (getGlobalSettings().implicitMutualInclusion && predefinedUri !== undefined) {
        // If implicit mutual inclusion is enabled, include all files under the directory where as.predefined is located.
        includeFiles = listPathsOfInspectedFilesUnder(resolveUri(predefinedUri, '.'))
            // Here we create an array of dummy tokens for the next function.
            .map(uri => createVirtualToken(TokenKind.String, `'${uri}'`));
    }
    const includedScopes = collectIncludedScope(targetUri, predefinedUri, includeFiles);

    // Analyzer-phase
    const analyzedScope = analyzeFromParsed(parsedAst, targetUri, includedScopes);
    profiler.stamp("Analyzer");

    return {
        content: content,
        diagnostics: diagnostic.completeSession(),
        tokenizedTokens: tokenizedTokens,
        parsedAst: parsedAst,
        analyzedScope: analyzedScope
    };
}

function resolveUri(dir: string, relativeUri: string): string {
    const u = new URL(dir);
    return url.format(new URL(relativeUri, u));
}

function listPathsOfInspectedFilesUnder(dirUri: string): string[] {
    return Object.keys(s_inspectedResults).filter(uri => uri.startsWith(dirUri));
}

function collectIncludedScope(target: URI, predefinedUri: URI | undefined, includedUris: TokenizingToken[]) {
    const includedScopes = [];

    // Load as.predefined
    if (target !== predefinedUri && predefinedUri !== undefined) {
        const predefinedResult = s_inspectedResults[predefinedUri];
        if (predefinedResult !== undefined) includedScopes.push(predefinedResult.analyzedScope);
    }

    // Get the analyzed scope of included files
    for (const includeToken of includedUris) {
        const relativeUri = includeToken.text.substring(1, includeToken.text.length - 1);
        const uri = resolveUri(target, relativeUri);

        if (s_inspectedResults[uri] === undefined) {
            const content = readFileFromUri(uri);
            if (content === undefined) {
                if (isVirtualToken(includeToken) === false) {
                    diagnostic.addError(includeToken.location, `File not found: "${fileURLToPath(uri)}"`);
                }
                continue;
            }

            // Store an empty result temporarily to avoid loops caused by circular references
            s_inspectedResults[uri] = createEmptyResult();

            s_inspectedResults[uri] = inspectInternal(content, uri, predefinedUri);
        }

        const result = s_inspectedResults[uri];
        if (result !== undefined) includedScopes.push(result.analyzedScope);
    }

    return includedScopes;
}

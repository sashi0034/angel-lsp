import {fileURLToPath, pathToFileURL} from "node:url";
import * as url from "url";
import * as fs from "fs";
import * as path from "path";
import {getGlobalSettings} from "../core/settings";

/**
 * Resolves a relative file path against a base file URI and returns the resulting URI as a string.
 *
 * @param baseUri - The base file or directory URI as a string (e.g., "file:///path/to/file.as").
 * @param relativePath - A relative path from the base URI (e.g., "src/index.as").
 * @returns The resolved file URI as a string, or an empty string if resolution fails.
 */
export function resolveUri(baseUri: string, relativePath: string): string {
    try {
        const base = new URL(baseUri);
        const u = new URL(relativePath, base);

        let href: string = u.href;

        if (u.protocol === 'file:') {
            href = normalizeFileUri(href);
        }

        return href;
    } catch (error) {
        return '';
    }
}

function normalizeFileUri(uri: string) {
    // Case 1: Normalize drive letter to "c%3A"
    // Example: file:///C:/... --> file:///c%3A/...
    uri = uri.replace(
        /^file:\/\/\/([A-Za-z]):/,
        (_m, d: string) => `file:///${d.toLowerCase()}%3A`
    );

    // Case 2: Special handling for root-only paths
    // Example: file:///c%3A/ --> file:///c%3A
    uri = uri.replace(
        /^file:\/\/\/([a-z])%3A\/(?=[?#]|$)/,
        'file:///$1%3A'
    );

    return uri;
}

export function resolveIncludeUri(baseUri: string, relativeOrAbsolute: string): string {
    if (path.isAbsolute(relativeOrAbsolute)) {
        return normalizeFileUri(url.pathToFileURL(relativeOrAbsolute).toString());
    }

    if (!relativeOrAbsolute.endsWith('.as') && !relativeOrAbsolute.endsWith('.predefined')) {
        // If the file does not have an extension, assume it is an ActionScript file.
        relativeOrAbsolute = relativeOrAbsolute + '.as';
    }

    const primaryUri = resolveUri(baseUri, relativeOrAbsolute);
    if (isFileUri(primaryUri)) {
        return primaryUri;
    }

    for (const includePath of getGlobalSettings().includePath) {
        const includeUri = pathToFileURL(toAbsolutePath(includePath)).toString() + '/';
        const fallbackUri = resolveUri(includeUri, relativeOrAbsolute);
        if (isFileUri(fallbackUri)) {
            return fallbackUri;
        }
    }

    return primaryUri;
}

export function getIncludeUriList(): { path: string, uri: string }[] {
    const list: { path: string, uri: string }[] = [];
    for (const includePath of getGlobalSettings().includePath) {
        const includeUri = pathToFileURL(toAbsolutePath(includePath)).toString() + '/';
        list.push({path: includePath, uri: includeUri});
    }

    return list;
}

function toAbsolutePath(inputPath: string, baseDir: string = process.cwd()): string {
    return path.isAbsolute(inputPath)
        ? inputPath
        : path.resolve(baseDir, inputPath);
}

export function isFileUri(uri: string): boolean {
    try {
        const path = fileURLToPath(uri);
        return fs.statSync(path).isFile();
    } catch (error) {
        return false;
    }
}

export function readFileContent(uri: string): string | undefined {
    try {
        const path = fileURLToPath(uri);
        if (fs.existsSync(path) === false) return undefined;

        return fs.readFileSync(path, 'utf8');
    } catch (error) {
        return undefined;
    }
}

export function getParentDirectoryList(uri: string): string[] {
    const parsedUrl = url.parse(uri);
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
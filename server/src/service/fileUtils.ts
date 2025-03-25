import {fileURLToPath} from "node:url";
import * as url from "url";
import * as fs from "fs";
import * as path from "path";

export function resolveUri(dirOrFile: string, relativeOrAbsolute: string): string {
    const u = new URL(dirOrFile);
    return url.format(new URL(relativeOrAbsolute, u));
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

export function getParentDirectoryList(fileUri: string): string[] {
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
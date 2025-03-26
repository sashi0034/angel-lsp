import {findTokenContainingPosition} from "./utils";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {TextPosition} from "../compiler_tokenizer/textLocation";
import {CompletionItem, CompletionItemKind} from "vscode-languageserver/node";
import * as path from "node:path";
import * as fs from "node:fs";
import {fileURLToPath} from "node:url";
import {getIncludeUriList} from "../service/fileUtils";

/**
 * Returns the completion candidates in tokens like string literals for the specified position.
 */
export function provideCompletionOfToken(rawTokens: TokenObject[], caret: TextPosition): CompletionItem[] | undefined {
    const tokenOnCaret = findTokenContainingPosition(rawTokens, caret);
    if (tokenOnCaret === undefined) return undefined;

    const uri = tokenOnCaret.token.location.path;

    if (tokenOnCaret.token.isStringToken()) {
        if (canAutocompleteFilepath(rawTokens, tokenOnCaret.index)) {
            return provideFilepathCompletion(tokenOnCaret.token.getStringContent(), uri);
        }
    }

    return undefined;
}

// -----------------------------------------------

function provideFilepathCompletion(currentInput: string, uri: string): CompletionItem[] {
    const result: CompletionItem[] = [];

    result.push(...autocompleteFilepath(uri, currentInput).map(name => {
        return {label: name, kind: CompletionItemKind.File,};
    }));

    for (const includeUri of getIncludeUriList()) {
        result.push(...autocompleteFilepath(includeUri.uri, currentInput).map(name => {
            return {
                label: name,
                kind: CompletionItemKind.File,
                detail: '(include path) ' + includeUri.path,
                sortText: '|' + name // '|' is a lower priority than normal characters
            };
        }));
    }

    return result;
}

function canAutocompleteFilepath(rawTokens: TokenObject[], caretTokenIndex: number): boolean {
    const stringToken = rawTokens[caretTokenIndex];
    if (stringToken.isStringToken() === false) return false;

    if (caretTokenIndex >= 2) {
        // Check if the previous tokens are '#', 'include'.
        const prev = rawTokens.slice(caretTokenIndex - 2, caretTokenIndex).map(token => token.text).join('');
        if (prev === '#include') return true;
    }

    // Check if the string token starts with './' or '../'.
    const stringContent = stringToken.getStringContent();
    return stringContent.startsWith('./') || stringContent.startsWith('../');
}

function autocompleteFilepath(uri: string, start: string): string[] {
    const filePath = fileURLToPath(uri);

    // Extract the base directory from the URI.
    const baseDir = fs.statSync(filePath).isFile() ? path.dirname(filePath) : filePath;

    // Trim off the trailing incomplete segment from the 'start' input.
    // If 'start' ends with a slash, we assume it's already a complete relative path.
    // Otherwise, we remove the last part (after the last slash).
    const trimmedStart = start.endsWith('/') ? start : start.substring(0, start.lastIndexOf('/') + 1);

    // Resolve the trimmed relative path against the base directory.
    const targetDir = path.resolve(baseDir, trimmedStart);

    // Try to read the directory contents and return the list of file/directory names.
    try {
        return fs.readdirSync(targetDir);
    } catch (error) {
        // If the directory does not exist or cannot be read, return an empty array.
        return [];
    }
}
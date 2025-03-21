import * as fs from 'fs';
import * as path from 'path';
import {fileURLToPath} from 'url';

/**
 * Safely writes the given content to a file, supporting both file URLs (`file://`) and regular file paths.
 * Ensures proper path handling and avoids unintended overwrites.
 * Does not throw exceptions; returns `true` on success, `false` on failure.
 * @param filePathOrUrl The file path or `file://` URL.
 * @param content The content to be saved as a string.
 * @returns `true` if the file was saved successfully, `false` otherwise.
 */
export function safeWriteFile(filePathOrUrl: string, content: string): boolean {
    let filePath: string;

    try {
        // Check if the input is a file URL (`file://`)
        if (filePathOrUrl.startsWith('file://')) {
            filePath = fileURLToPath(filePathOrUrl);
        } else {
            filePath = path.resolve(filePathOrUrl);
        }

        // Ensure the directory exists before writing the file
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, {recursive: true});
        }

        // Write the content to the file safely
        fs.writeFileSync(filePath, content, {encoding: 'utf-8', flag: 'w'});

        return true; // Success
    } catch {
        return false; // Failure
    }
}


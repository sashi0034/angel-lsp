import * as fs from 'fs';
import * as path from 'path';

export interface FineContent {
    content: string;
    fullPath: string;
}

// 現在のディレクトリから指定されたファイルを探索
export function findFileInCurrentDirectory(filename: string): FineContent | undefined {
    const entries = fs.readdirSync('.', {withFileTypes: true});

    for (const entry of entries) {
        if (entry.isFile() && entry.name === filename) {
            const fullPath = path.resolve(entry.name);
            const content = fs.readFileSync(fullPath, 'utf-8');
            return {content: content, fullPath: fullPath};
        }
    }

    return undefined;
}

// ファイルを探索し、見つかった場合にそのパスと内容を返す関数
export function findFileWithSubDirectories(filename: string, dir: string = '.'): FineContent | undefined {
    const entries = fs.readdirSync(dir, {withFileTypes: true});

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            const result = findFileWithSubDirectories(filename, fullPath);
            if (result) return result;
        } else if (entry.isFile() && entry.name === filename) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            return {content: content, fullPath: fullPath};
        }
    }

    return undefined;
}


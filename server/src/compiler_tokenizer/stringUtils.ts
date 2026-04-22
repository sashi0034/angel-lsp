export function normalizeHeredocStringContent(content: string): string {
    // This removes:
    // - indentation-only characters followed by the first line break
    // - the final line break followed by indentation-only characters
    let start = 0;
    while (start < content.length && isHeredocBoundaryWhitespace(content[start])) {
        start++;
    }

    if (content[start] === '\r' && content[start + 1] === '\n') {
        start += 2;
    } else if (content[start] === '\n') {
        start++;
    } else {
        start = 0;
    }

    let end = content.length;
    let whitespaceStart = end;
    while (whitespaceStart > start && isHeredocBoundaryWhitespace(content[whitespaceStart - 1])) {
        whitespaceStart--;
    }

    if (whitespaceStart > start && content[whitespaceStart - 1] === '\n') {
        end = content[whitespaceStart - 2] === '\r' ? whitespaceStart - 2 : whitespaceStart - 1;
    }

    return content.slice(start, end);
}

function isHeredocBoundaryWhitespace(char: string): boolean {
    return char === ' ' || char === '\t' || char === '\f' || char === '\v';
}

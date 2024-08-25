class TrieNode<T> {
    value: T | undefined;
    children: Map<string, TrieNode<T>>;

    constructor(value: T | undefined) {
        this.value = value;
        this.children = new Map<string, TrieNode<T>>();
    }
}

export type TriePair<T> = { key: string, value: T };

export class Trie<T> {
    root: TrieNode<T>;

    constructor() {
        this.root = new TrieNode<T>(undefined);
    }

    insert(word: string, value: T) {
        let node = this.root;
        for (const char of word) {
            if (node.children.has(char) === false) {
                node.children.set(char, new TrieNode<T>(undefined));
            }
            node = node.children.get(char)!;
        }
        node.value = value;
    }

    find(str: string, start: number): TriePair<T> | undefined {
        let node = this.root;
        let prefix = '';

        for (let i = start; i < str.length; ++i) {
            const char = str[i];
            if (node.children.has(char)) {
                prefix += char;
                node = node.children.get(char)!;
            } else {
                break;
            }
        }

        if (node.value === undefined) return undefined;
        return {key: prefix, value: node.value};
    }
}

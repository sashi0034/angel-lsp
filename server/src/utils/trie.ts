class TrieNode {
    children: Map<string, TrieNode>;

    constructor() {
        this.children = new Map<string, TrieNode>();
    }
}

export class Trie {
    root: TrieNode;

    constructor() {
        this.root = new TrieNode();
    }

    static fromArray(allSymbols: string[]) {
        const trie = new Trie();
        for (const symbol of allSymbols) {
            trie.insert(symbol);
        }
        return trie;
    }

    insert(word: string) {
        let node = this.root;
        for (const char of word) {
            if (!node.children.has(char)) {
                node.children.set(char, new TrieNode());
            }
            node = node.children.get(char)!;
        }
    }

    find(str: string, start: number): string {
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
        return prefix;
    }
}

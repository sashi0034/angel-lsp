import {TokenHighlight} from '../../src/core/highlight';
import {inspectFileContents, makeFileContentList} from '../inspectorUtils';
import {CaretMap} from './caretMap';

function expectHighlights(rawContent: string, expected: TokenHighlight[]) {
    const fileContentList = makeFileContentList(rawContent);

    const caretMap = new CaretMap();
    caretMap.processFiles(fileContentList);

    const inspector = inspectFileContents(fileContentList);

    for (let i = 0; i < expected.length; i++) {
        const caret = caretMap.get(i);
        const token = inspector
            .getRecord(caret.uri)
            .rawTokens.find(token => token.location.start.equals(caret.position));
        if (token === undefined) {
            throw new Error(`No token found at caret ${i}.`);
        }

        const actual = token.highlight.tokenHighlight;
        if (actual !== expected[i]) {
            throw new Error(
                `Expected '${token.text}' to be ${TokenHighlight[expected[i]]}, but got ${TokenHighlight[actual]}.`
            );
        }
    }
}

describe('services/semanticTokens', () => {
    it('highlights identifiers by their resolved symbols', () => {
        expectHighlights(
            `
            class Vector {
                float $C0$x;
                Vector(float x, float y) { this.x = x + y; }
                float $C1$length() const { return x; }
            }

            enum Color { $C2$Red }

            void main(int $C3$count) {
                $C4$Vector v = $C5$Vector(1, 2);
                float l = v.$C6$length();
                v.$C7$x = $C8$count;
                $C9$Color c = Color::$C10$Red;
            }
            `,
            [
                TokenHighlight.Property,
                TokenHighlight.Method,
                TokenHighlight.EnumMember,
                TokenHighlight.Parameter,
                TokenHighlight.Class,
                TokenHighlight.Class,
                TokenHighlight.Method,
                TokenHighlight.Property,
                TokenHighlight.Parameter,
                TokenHighlight.Enum,
                TokenHighlight.EnumMember
            ]
        );
    });
});

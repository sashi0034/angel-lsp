import {Node_Script} from '../../compiler_parser/nodeObject';
import {findNearestNode, NearestNode} from '../../compiler_parser/nearestNode';
import {TextPosition} from '../../compiler_tokenizer/textLocation';
import {TokenObject} from '../../compiler_tokenizer/tokenObject';
import {findNearestToken, NearestToken} from '../utils';

export class CaretContext {
    private nearestRawToken: NearestToken | undefined;
    private nearestToken: NearestToken | undefined;
    private nearestNode: NearestNode[] | undefined;

    public constructor(
        public readonly rawTokens: TokenObject[],
        public readonly tokens: TokenObject[],
        public readonly ast: Node_Script,
        public readonly caret: TextPosition
    ) {}

    public getNearestRawToken(): NearestToken {
        this.nearestRawToken ??= findNearestToken(this.rawTokens, this.caret);
        return this.nearestRawToken;
    }

    public getNearestToken(): NearestToken {
        this.nearestToken ??= findNearestToken(this.tokens, this.caret);
        return this.nearestToken;
    }

    public getNearestNode(): NearestNode[] {
        this.nearestNode ??= findNearestNode(this.ast, this.caret);
        return this.nearestNode;
    }
}

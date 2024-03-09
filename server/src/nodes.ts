import {Token} from "./tokenizer";

interface NodeAssign {
    lhs: NodeObject | null;
    rhs: NodeObject | null;
}

interface NodeIf {
    condition: NodeObject | null;
    t: NodeObject | null;
    f: NodeObject | null;
}

interface NodeObject {
    headToken: Token;
    tailToken: Token;
    assign: NodeAssign | undefined;
    condition: NodeIf | undefined;
}

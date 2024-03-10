import {TokenObject} from "./tokenizer";

export interface NodeBase {
    headToken(): TokenObject;

    tailToken(): TokenObject;
}

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
export class NodeType_ implements NodeBase {
    headToken(): TokenObject {
        throw Error("Not Implemented");
    }

    tailToken(): TokenObject {
        throw Error("Not Implemented");
    }
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export interface NodeExprterm extends NodeBase {
}

export class NodeExprterm1 implements NodeExprterm {
    public constructor(
        public type: NodeType_ | null,
        public eq: TokenObject,
    ) {
    }

    headToken(): TokenObject {
        throw Error("Not Implemented");
    }

    tailToken(): TokenObject {
        throw Error("Not Implemented");
    }
}

export class NodeExprTerm2 implements NodeExprterm {
    public constructor(
        public preop: TokenObject | null,
        public value: NodeExprvalue,
        public stopop: TokenObject | null
    ) {
    }

    headToken(): TokenObject {
        return this.preop ?? this.value.headToken();
    }

    tailToken(): TokenObject {
        return this.stopop ?? this.value.tailToken();
    }
}

// EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
export interface NodeExprvalue extends NodeBase {
}

export class NodeLiteral implements NodeExprvalue {
    public constructor(
        public literal: TokenObject
    ) {
    }

    headToken(): TokenObject {
        return this.literal;
    }

    tailToken(): TokenObject {
        return this.literal;
    }
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
export class NodeExpr implements NodeBase {
    public constructor(
        public head: NodeExprterm,
        public op: TokenObject | null,
        public tail: NodeExpr | null
    ) {
    }

    headToken(): TokenObject {
        return this.head.headToken();
    }

    tailToken(): TokenObject {
        return this.tail?.tailToken() ?? this.op ?? this.head.tailToken();
    }
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
export class NodeAssign implements NodeBase {
    public constructor(
        public condition: NodeCondition,
        public op: TokenObject | null,
        public assign: NodeAssign | null
    ) {
    }

    headToken(): TokenObject {
        return this.condition.headToken();
    }

    tailToken(): TokenObject {
        return this.assign?.tailToken() ?? this.op ?? this.condition.headToken();
    }
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
export class NodeCondition implements NodeBase {
    public constructor(
        public expr: NodeExpr,
        public q: TokenObject | null,
        public ta: NodeExpr | null,
        public c: TokenObject | null,
        public fa: NodeExpr | null
    ) {
    }

    headToken(): TokenObject {
        return this.expr.headToken();
    }

    tailToken(): TokenObject {
        return this.fa?.tailToken() ?? this.c ?? this.ta?.tailToken() ?? this.q ?? this.expr.tailToken();
    }
}

export interface NodeObject {
    headToken: TokenObject;
    tailToken: TokenObject;
    assign: NodeAssign | undefined;

}
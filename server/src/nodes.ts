import {TokenObject} from "./tokenizer";
import * as punycode from "punycode";

export interface NodeBase {
    headToken(): TokenObject;

    tailToken(): TokenObject;
}

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
export class NodeFunc implements NodeBase {
    public constructor(
        public entity: [TokenObject],
        public accessor: TokenObject | null,
        public type: NodeType_ | null,
        public ref: TokenObject | null,
        public identifier: TokenObject,
        public paramlist: NodeParamlist,
        public const_: boolean,
        public funcattr: TokenObject | null,
        public statblock: [NodeStatement]
    ) {
    }

    headToken(): TokenObject {
        return this.entity.length > 0 ? this.entity[0] : (this.accessor ?? this.type?.headToken() ?? this.ref ?? this.identifier);
    }

    tailToken(): TokenObject {
        return this.statblock[this.statblock.length - 1].tailToken();
    }
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
export class NodeParamlist implements NodeBase {
    public constructor(
        public type: [NodeType_],
    ) {
    }

    headToken(): TokenObject {
        return this.type[0].headToken();
    }

    tailToken(): TokenObject {
        return this.type[this.type.length - 1].tailToken();
    }
}

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
export class NodeType_ implements NodeBase {
    public constructor(
        public const_: boolean,
        public scope: TokenObject | null, // TODO
        public datatype: NodeDatatype,
        public type: NodeType_[] | null,
        public array: boolean,
        public ref: boolean,
    ) {
    }

    public headToken(): TokenObject {
        return this.const_ ? this.datatype.headToken() : this.scope ?? this.datatype.headToken();
    }

    public tailToken(): TokenObject {
        return this.ref ? this.datatype.tailToken() : this.type?.[this.type.length - 1].tailToken() ?? this.datatype.tailToken();

    }
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
export class NodeDatatype implements NodeBase {
    public constructor(
        public identifier: TokenObject
    ) {
    }

    headToken(): TokenObject {
        return this.identifier;
    }

    tailToken(): TokenObject {
        return this.identifier;
    }
}

// STATEMENT     ::= (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
export interface NodeStatement extends NodeBase {

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
        public ta: NodeExpr | null,
        public fa: NodeExpr | null
    ) {
    }

    headToken(): TokenObject {
        return this.expr.headToken();
    }

    tailToken(): TokenObject {
        return this.fa?.tailToken() ?? this.ta?.tailToken() ?? this.expr.tailToken();
    }
}

export interface NodeObject {
    headToken: TokenObject;
    tailToken: TokenObject;
    assign: NodeAssign | undefined;

}
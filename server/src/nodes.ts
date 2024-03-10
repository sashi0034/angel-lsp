import {TokenObject} from "./tokenizer";
import * as punycode from "punycode";

export interface NodeBase {
}

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
export class NodeScript implements NodeBase {
    public constructor(
        public statements: NodeFunc[]
    ) {
    }
}

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
export class NodeFunc implements NodeBase {
    public constructor(
        public entity: [TokenObject],
        public accessor: TokenObject | null,
        public type: NodeType_ | null,
        public ref: TokenObject | null,
        public identifier: TokenObject,
        public paramlist: NodePARAMLIST,
        public const_: boolean,
        public funcattr: TokenObject | null,
        public statblock: [NodeStatement]
    ) {
    }
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
export class NodePARAMLIST implements NodeBase {
    public constructor(
        public types: NodeType_[],
        public identifiers: TokenObject[],
    ) {
    }
}

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
export class NodeType_ implements NodeBase {
    public constructor(
        public const_: boolean,
        public scope: TokenObject | null, // TODO
        public datatype: NodeDATATYPE,
        public generics: NodeType_[],
        public array: boolean,
        public ref: boolean,
    ) {
    }
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
export class NodeDATATYPE implements NodeBase {
    public constructor(
        public identifier: TokenObject
    ) {
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
}

export class NodeExprTerm2 implements NodeExprterm {
    public constructor(
        public preop: TokenObject | null,
        public value: NodeExprvalue,
        public stopop: TokenObject | null
    ) {
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
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
export class NodeAssign implements NodeBase {
    public constructor(
        public condition: NodeCondition,
        public op: TokenObject | null,
        public assign: NodeAssign | null
    ) {
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
}

export interface NodeObject {
    headToken: TokenObject;
    tailToken: TokenObject;
    assign: NodeAssign | undefined;

}
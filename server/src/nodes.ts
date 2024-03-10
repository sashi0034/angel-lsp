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

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

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

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))
// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST]} ';'
// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
// MIXIN         ::= 'mixin' CLASS
// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
export class NodePARAMLIST implements NodeBase {
    public constructor(
        public types: NodeType_[],
        public identifiers: TokenObject[],
    ) {
    }
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]

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

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
export class NodeDATATYPE implements NodeBase {
    public constructor(
        public identifier: TokenObject
    ) {
    }
}

// PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
// FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property'}

// STATEMENT     ::= (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
export interface NodeStatement extends NodeBase {

}

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
// BREAK         ::= 'break' ';'
// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
// CONTINUE      ::= 'continue' ';'
// EXPRSTAT      ::= [ASSIGN] ';'
// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK
// RETURN        ::= 'return' [ASSIGN] ';'
// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
export class NodeExpr implements NodeBase {
    public constructor(
        public head: NodeExprterm,
        public op: TokenObject | null,
        public tail: NodeExpr | null
    ) {
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

// CONSTRUCTCALL ::= TYPE ARGLIST
// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK

// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
export class NodeLITERAL implements NodeExprvalue {
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

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
// VARACCESS     ::= SCOPE IDENTIFIER
// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'

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
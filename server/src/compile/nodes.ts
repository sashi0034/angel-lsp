import {TokenObject} from "./token";
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
        public entity: TokenObject[],
        public accessor: TokenObject | null,
        public ret: NodeTYPE | null,
        public ref: TokenObject | null,
        public identifier: TokenObject,
        public paramlist: NodePARAMLIST,
        public const_: boolean,
        public funcattr: TokenObject | null,
        public statblock: NodeSTATBLOCK
    ) {
    }
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST]} ';'
export class NodeVAR implements NodeBase {
    public constructor(
        public type: NodeTYPE,
        public identifier: TokenObject | null,
        public expr: NodeEXPR
    ) {
    }
}

// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
// MIXIN         ::= 'mixin' CLASS
// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
export type NodeSTATBLOCK = (NodeVAR | NodeSTATEMENT)[];

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
export type NodePARAMLIST = [type: NodeTYPE, identifier: TokenObject | null][];

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
export class NodeTYPE implements NodeBase {
    public constructor(
        public const_: boolean,
        public scope: TokenObject | null,
        public datatype: NodeDATATYPE,
        public generics: NodeTYPE[],
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
export type NodeSTATEMENT =
    NodeIF
    | NodeFOR
    | NodeWHILE
    | NodeRETURN
    | NodeSTATBLOCK
    | 'break'
    | 'continue'
    | NodeDOWHILE
    | NodeSWITCH
    | NodeEXPRSTAT;

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
export class NodeSWITCH implements NodeBase {
    public constructor(
        public assign: NodeASSIGN,
        public cases: NodeCASE[]
    ) {
    }

}

// BREAK         ::= 'break' ';'

// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
export class NodeFOR implements NodeBase {
    public constructor(
        public initial: NodeVAR | NodeEXPRSTAT,
        public condition: NodeEXPRSTAT,
        public increment: NodeASSIGN[],
        public statement: NodeSTATEMENT
    ) {
    }
}

// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
export class NodeWHILE implements NodeBase {
    public constructor(
        public assign: NodeASSIGN,
        public statement: NodeSTATEMENT
    ) {
    }
}

// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
export class NodeDOWHILE implements NodeBase {
    public constructor(
        public statement: NodeSTATEMENT,
        public assign: NodeASSIGN
    ) {
    }
}

// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
export class NodeIF implements NodeBase {
    public constructor(
        public condition: NodeASSIGN,
        public ts: NodeSTATEMENT,
        public fs: NodeSTATEMENT | null
    ) {
    }
}

// CONTINUE      ::= 'continue' ';'

// EXPRSTAT      ::= [ASSIGN] ';'
export type NodeEXPRSTAT = NodeASSIGN | 'empty';

// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK

// RETURN        ::= 'return' [ASSIGN] ';'
export class NodeRETURN implements NodeBase {
    public constructor(
        public assign: NodeASSIGN
    ) {
    }
}

// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
export class NodeCASE implements NodeBase {
    public constructor(
        public expr: NodeEXPR | null,
        public statement: NodeSTATEMENT[]
    ) {
    }
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
export class NodeEXPR implements NodeBase {
    public constructor(
        public head: NodeEXPRTERM,
        public op: TokenObject | null,
        public tail: NodeEXPR | null
    ) {
    }
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export type NodeEXPRTERM = NodeEXPRTERM1 | NodeEXPRTERM2;

export class NodeEXPRTERM1 implements NodeBase {
    public constructor(
        public type: NodeTYPE,
        public eq: TokenObject | null,
    ) {
    }
}

export class NodeEXPRTERM2 implements NodeBase {
    public constructor(
        public preop: TokenObject | null,
        public value: NodeEXPRVALUE,
        public stopop: TokenObject | null
    ) {
    }
}

// EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
export type  NodeEXPRVALUE = NodeVARACCESS | TokenObject

// CONSTRUCTCALL ::= TYPE ARGLIST
// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK

// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST

// VARACCESS     ::= SCOPE IDENTIFIER
export class NodeVARACCESS implements NodeBase {
    public constructor(
        public identifier: TokenObject
    ) {
    }
}

// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
export class NodeASSIGN implements NodeBase {
    public constructor(
        public condition: NodeCONDITION,
        public op: TokenObject | null,
        public assign: NodeASSIGN | null
    ) {
    }
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
export class NodeCONDITION implements NodeBase {
    public constructor(
        public expr: NodeEXPR,
        public ta: NodeASSIGN | null,
        public fa: NodeASSIGN | null
    ) {
    }
}

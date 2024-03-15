import {TokenObject} from "./token";
import * as punycode from "punycode";

export type AccessModifier = 'public' | 'private' | 'protected';

export interface NodeBase {
    nodeName: 'SCRIPT' | 'NAMESPACE' | 'ENUM' | 'CLASS' | 'TYPEDEF' | 'FUNC' | 'INTERFACE' | 'VAR' | 'IMPORT' | 'FUNCDEF' | 'VIRTPROP' | 'MIXIN' | 'INTFMTHD' | 'STATBLOCK' | 'PARAMLIST' | 'TYPEMOD' | 'TYPE' | 'INITLIST' | 'SCOPE' | 'DATATYPE' | 'PRIMTYPE' | 'FUNCATTR' | 'STATEMENT' | 'SWITCH' | 'BREAK' | 'FOR' | 'WHILE' | 'DOWHILE' | 'IF' | 'CONTINUE' | 'EXPRSTAT' | 'TRY' | 'RETURN' | 'CASE' | 'EXPR' | 'EXPRTERM' | 'EXPRVALUE' | 'CONSTRUCTCALL' | 'EXPRPREOP' | 'EXPRPOSTOP' | 'CAST' | 'LAMBDA' | 'LITERAL' | 'FUNCCALL' | 'VARACCESS' | 'ARGLIST' | 'ASSIGN' | 'CONDITION' | 'EXPROP' | 'BITOP' | 'MATHOP' | 'COMPOP' | 'LOGICOP' | 'ASSIGNOP' | 'IDENTIFIER' | 'NUMBER' | 'STRING' | 'BITS' | 'COMMENT' | 'WHITESPACE';
}

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
export type NodeSCRIPT = (NodeCLASS | NodeVAR | NodeFUNC)[];

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
export interface NodeCLASS extends NodeBase {
    nodeName: 'CLASS'
    identifier: TokenObject,
    bases: TokenObject[],
    members: (NodeVIRTPROP | NodeVAR | NodeFUNC | NodeFUNCDEF)[]
}

// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
export interface NodeFUNC extends NodeBase {
    nodeName: 'FUNC';
    entity: TokenObject[];
    accessor: AccessModifier;
    returnType: NodeTYPE | null;
    ref: TokenObject | null;
    identifier: TokenObject;
    paramList: NodePARAMLIST;
    isConst: boolean;
    funcAttr: TokenObject | null;
    statBlock: NodeSTATBLOCK;
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST]} ';'
export interface NodeVAR extends NodeBase {
    nodeName: 'VAR'
    accessor: AccessModifier,
    type: NodeTYPE,
    variables: {
        identifier: TokenObject,
        initializer: NodeEXPR | NodeARGLIST | null
    }[];
}

// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'

// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
export interface NodeFUNCDEF extends NodeBase {

}

// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
export interface NodeVIRTPROP extends NodeBase {
    nodeName: 'VIRTPROP'
    modifier: 'private' | 'protected | null',
    type: NodeTYPE,
    isRef: boolean,
    identifier: TokenObject,
    getter: [isConst: boolean, NodeSTATBLOCK | null] | null,
    setter: NodeFUNC | null
}

// MIXIN         ::= 'mixin' CLASS
// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
export type NodeSTATBLOCK = {
    nodeName: 'STATBLOCK',
    statements: (NodeVAR | NodeSTATEMENT)[]
};

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
export type NodePARAMLIST = [type: NodeTYPE, identifier: TokenObject | null][];

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
export interface NodeTYPE extends NodeBase {
    nodeName: 'TYPE'
    isConst: boolean,
    scope: NodeSCOPE | null,
    datatype: NodeDATATYPE,
    generics: NodeTYPE[],
    array: boolean,
    ref: boolean,
}

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'

// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
export interface NodeSCOPE extends NodeBase {
    nodeName: 'SCOPE'
    isGlobal: boolean,
    namespaces: TokenObject[],
    generic: {
        className: TokenObject,
        types: NodeTYPE[]
    } | null
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
export interface NodeDATATYPE extends NodeBase {
    nodeName: 'DATATYPE';
    identifier: TokenObject;
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
    | NodeBREAK
    | NodeCONTINUE
    | NodeDOWHILE
    | NodeSWITCH
    | NodeEXPRSTAT;

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
export interface NodeSWITCH extends NodeBase {
    nodeName: 'SWITCH'
    assign: NodeASSIGN,
    cases: NodeCASE[]
}

// BREAK         ::= 'break' ';'
export interface NodeBREAK extends NodeBase {
    nodeName: 'BREAK';
}

// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
export interface NodeFOR extends NodeBase {
    nodeName: 'FOR'
    initial: NodeVAR | NodeEXPRSTAT,
    condition: NodeEXPRSTAT,
    increment: NodeASSIGN[],
    statement: NodeSTATEMENT
}

// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
export interface NodeWHILE extends NodeBase {
    nodeName: 'WHILE'
    assign: NodeASSIGN,
    statement: NodeSTATEMENT
}

// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
export interface NodeDOWHILE extends NodeBase {
    nodeName: 'DOWHILE'
    statement: NodeSTATEMENT,
    assign: NodeASSIGN
}

// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
export interface NodeIF extends NodeBase {
    nodeName: 'IF'
    condition: NodeASSIGN,
    ts: NodeSTATEMENT,
    fs: NodeSTATEMENT | null
}

// CONTINUE      ::= 'continue' ';'
export interface NodeCONTINUE extends NodeBase {
    nodeName: 'CONTINUE';
}

// EXPRSTAT      ::= [ASSIGN] ';'
export type NodeEXPRSTAT = {
    nodeName: 'EXPRSTAT',
    assign: NodeASSIGN | null
};

// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK

// RETURN        ::= 'return' [ASSIGN] ';'
export interface NodeRETURN extends NodeBase {
    nodeName: 'RETURN';
    assign: NodeASSIGN;
}

// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
export interface NodeCASE extends NodeBase {
    nodeName: 'CASE'
    expr: NodeEXPR | null,
    statement: NodeSTATEMENT[]
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
export interface NodeEXPR extends NodeBase {
    nodeName: 'EXPR'
    head: NodeEXPRTERM,
    op: TokenObject | null,
    tail: NodeEXPR | null
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export type NodeEXPRTERM = NodeEXPRTERM1 | NodeEXPRTERM2;

export interface NodeEXPRTERM1 extends NodeBase {
    nodeName: 'EXPRTERM'
    exprTerm: 1
    type: NodeTYPE,
    eq: TokenObject | null,
}

export interface NodeEXPRTERM2 extends NodeBase {
    nodeName: 'EXPRTERM'
    exprTerm: 2,
    preOp: TokenObject | null,
    value: NodeEXPRVALUE,
    postOp: NodeEXPRPOSTOP | null
}

// EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
export type  NodeEXPRVALUE = NodeFUNCCALL | NodeVARACCESS | NodeLITERAL | NodeASSIGN

// CONSTRUCTCALL ::= TYPE ARGLIST
// EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']') | ARGLIST | '++' | '--'
export type NodeEXPRPOSTOP = NodeEXPRPOSTOP1 | NodeEXPRPOSTOP2 | NodeEXPRPOSTOP3 | NodeEXPRPOSTOP4;

// ('.' (FUNCCALL | IDENTIFIER))
export interface NodeEXPRPOSTOP1 extends NodeBase {
    nodeName: 'EXPRPOSTOP';
    postOp: 1;
    member: NodeFUNCCALL | TokenObject;
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
export interface NodeEXPRPOSTOP2 extends NodeBase {
    nodeName: 'EXPRPOSTOP';
    postOp: 2;
    indexes: { identifier: TokenObject | null, assign: NodeASSIGN }[];
}

// ARGLIST
export interface NodeEXPRPOSTOP3 extends NodeBase {
    nodeName: 'EXPRPOSTOP';
    postOp: 3;
    args: NodeARGLIST;
}

// ++ | --
export interface NodeEXPRPOSTOP4 extends NodeBase {
    nodeName: 'EXPRPOSTOP';
    postOp: 4;
    operator: '++' | '--';
}

// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK

// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
export interface NodeLITERAL extends NodeBase {
    nodeName: 'LITERAL';
    value: TokenObject;
}

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
export interface NodeFUNCCALL extends NodeBase {
    nodeName: 'FUNCCALL'
    scope: NodeSCOPE | null,
    identifier: TokenObject,
    argList: NodeARGLIST
}

// VARACCESS     ::= SCOPE IDENTIFIER
export interface NodeVARACCESS extends NodeBase {
    nodeName: 'VARACCESS';
    scope: NodeSCOPE | null,
    identifier: TokenObject;
}

// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
export interface NodeARGLIST extends NodeBase {
    nodeName: 'ARGLIST';
    args: { identifier: TokenObject | null, assign: NodeASSIGN }[];
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
export interface NodeASSIGN extends NodeBase {
    nodeName: 'ASSIGN'
    condition: NodeCONDITION,
    op: TokenObject | null,
    assign: NodeASSIGN | null
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
export interface NodeCONDITION extends NodeBase {
    nodeName: 'CONDITION'
    expr: NodeEXPR,
    ta: NodeASSIGN | null,
    fa: NodeASSIGN | null
}

import {EssentialToken} from "./token";

export type AccessModifier = 'public' | 'private' | 'protected';

export type TypeModifier = 'in' | 'out' | 'inout';

export interface ParsedRange {
    start: EssentialToken,
    end: EssentialToken
}

export interface EntityModifier {
    isShared: boolean,
    isExternal: boolean
}

export interface ClassModifier {
    isShared: boolean,
    isAbstract: boolean,
    isFinal: boolean,
    isExternal: boolean
}

export interface OperatedExpression {
    operator: EssentialToken,
    expression: NodeEXPR
}

export interface NodeBase {
    nodeName: 'SCRIPT' | 'NAMESPACE' | 'ENUM' | 'CLASS' | 'TYPEDEF' | 'FUNC' | 'INTERFACE' | 'VAR' | 'IMPORT' | 'FUNCDEF' | 'VIRTPROP' | 'MIXIN' | 'INTFMTHD' | 'STATBLOCK' | 'PARAMLIST' | 'TYPEMOD' | 'TYPE' | 'INITLIST' | 'SCOPE' | 'DATATYPE' | 'PRIMTYPE' | 'FUNCATTR' | 'STATEMENT' | 'SWITCH' | 'BREAK' | 'FOR' | 'WHILE' | 'DOWHILE' | 'IF' | 'CONTINUE' | 'EXPRSTAT' | 'TRY' | 'RETURN' | 'CASE' | 'EXPR' | 'EXPRTERM' | 'EXPRVALUE' | 'CONSTRUCTCALL' | 'EXPRPREOP' | 'EXPRPOSTOP' | 'CAST' | 'LAMBDA' | 'LITERAL' | 'FUNCCALL' | 'VARACCESS' | 'ARGLIST' | 'ASSIGN' | 'CONDITION' | 'EXPROP' | 'BITOP' | 'MATHOP' | 'COMPOP' | 'LOGICOP' | 'ASSIGNOP' | 'IDENTIFIER' | 'NUMBER' | 'STRING' | 'BITS' | 'COMMENT' | 'WHITESPACE';
    nodeRange: ParsedRange;
}

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
export type NodeSCRIPT = (NodeCLASS | NodeVAR | NodeFUNC | NodeNAMESPACE)[];

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
export interface NodeNAMESPACE extends NodeBase {
    nodeName: 'NAMESPACE'
    namespaceList: EssentialToken[],
    script: NodeSCRIPT
}

// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
export interface NodeENUM extends NodeBase {
    nodeName: 'ENUM'
    identifier: EssentialToken,
}

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
export interface NodeCLASS extends NodeBase {
    nodeName: 'CLASS'
    identifier: EssentialToken,
    baseList: EssentialToken[],
    memberList: (NodeVIRTPROP | NodeVAR | NodeFUNC | NodeFUNCDEF)[]
}

// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
export interface NodeFUNC extends NodeBase {
    nodeName: 'FUNC';
    entity: EntityModifier | undefined;
    accessor: AccessModifier;
    head: { returnType: NodeTYPE; isRef: boolean; } | '~';
    identifier: EssentialToken;
    paramList: NodePARAMLIST;
    isConst: boolean;
    funcAttr: EssentialToken | undefined;
    statBlock: NodeSTATBLOCK;
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST]} ';'
export interface NodeVAR extends NodeBase {
    nodeName: 'VAR'
    accessor: AccessModifier,
    type: NodeTYPE,
    variables: {
        identifier: EssentialToken,
        initializer: NodeEXPR | NodeARGLIST | undefined
    }[];
}

// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'

// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
export interface NodeFUNCDEF extends NodeBase {
    nodeName: 'FUNCDEF';
}

// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
export interface NodeVIRTPROP extends NodeBase {
    nodeName: 'VIRTPROP'
    modifier: 'private' | 'protected' | 'null',
    type: NodeTYPE,
    isRef: boolean,
    identifier: EssentialToken,
    getter: [isConst: boolean, NodeSTATBLOCK | undefined] | undefined,
    setter: NodeFUNC | undefined
}

// MIXIN         ::= 'mixin' CLASS
// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
export type NodeSTATBLOCK = {
    nodeName: 'STATBLOCK',
    statements: (NodeVAR | NodeSTATEMENT)[]
};

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
export type NodePARAMLIST = { type: NodeTYPE, identifier: EssentialToken | undefined }[];

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
export interface NodeTYPE extends NodeBase {
    nodeName: 'TYPE'
    isConst: boolean,
    scope: NodeSCOPE | undefined,
    datatype: NodeDATATYPE,
    genericList: NodeTYPE[],
    isArray: boolean,
    isRef: boolean,
}

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'

// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
export interface NodeSCOPE extends NodeBase {
    nodeName: 'SCOPE'
    isGlobal: boolean,
    namespaceList: EssentialToken[],
    generic: {
        className: EssentialToken,
        types: NodeTYPE[]
    } | undefined
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
export interface NodeDATATYPE extends NodeBase {
    nodeName: 'DATATYPE';
    identifier: EssentialToken;
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
    incrementList: NodeASSIGN[],
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
    fs: NodeSTATEMENT | undefined
}

// CONTINUE      ::= 'continue' ';'
export interface NodeCONTINUE extends NodeBase {
    nodeName: 'CONTINUE';
}

// EXPRSTAT      ::= [ASSIGN] ';'
export type NodeEXPRSTAT = {
    nodeName: 'EXPRSTAT',
    assign: NodeASSIGN | undefined
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
    expr: NodeEXPR | undefined,
    statementList: NodeSTATEMENT[]
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
export interface NodeEXPR extends NodeBase {
    nodeName: 'EXPR'
    head: NodeEXPRTERM,
    tail: OperatedExpression | undefined
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export type NodeEXPRTERM = NodeEXPRTERM1 | NodeEXPRTERM2;

export interface NodeEXPRTERM1 extends NodeBase {
    nodeName: 'EXPRTERM'
    exprTerm: 1
    type: NodeTYPE,
    eq: EssentialToken | undefined,
}

// ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export interface NodeEXPRTERM2 extends NodeBase {
    nodeName: 'EXPRTERM'
    exprTerm: 2,
    preOp: EssentialToken | undefined,
    value: NodeEXPRVALUE,
    postOp: NodeEXPRPOSTOP | undefined
}

// EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
export type  NodeEXPRVALUE =
    NodeCONSTRUCTCALL
    | NodeFUNCCALL
    | NodeVARACCESS
    | NodeCAST
    | NodeLITERAL
    | NodeASSIGN
    | NodeLAMBDA;

// CONSTRUCTCALL ::= TYPE ARGLIST
export interface NodeCONSTRUCTCALL extends NodeBase {
    nodeName: 'CONSTRUCTCALL';
    type: NodeTYPE;
    argList: NodeARGLIST;
}

// EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']') | ARGLIST | '++' | '--'
export type NodeEXPRPOSTOP = NodeEXPRPOSTOP1 | NodeEXPRPOSTOP2 | NodeEXPRPOSTOP3 | NodeEXPRPOSTOP4;

// ('.' (FUNCCALL | IDENTIFIER))
export interface NodeEXPRPOSTOP1 extends NodeBase {
    nodeName: 'EXPRPOSTOP';
    postOp: 1;
    member: NodeFUNCCALL | EssentialToken;
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
export interface NodeEXPRPOSTOP2 extends NodeBase {
    nodeName: 'EXPRPOSTOP';
    postOp: 2;
    indexes: { identifier: EssentialToken | undefined, assign: NodeASSIGN }[];
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
export interface NodeCAST extends NodeBase {
    nodeName: 'CAST';
    type: NodeTYPE;
    assign: NodeASSIGN;
}

// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
export interface NodeLAMBDA extends NodeBase {
    nodeName: 'LAMBDA';
    params: { type: NodeTYPE | undefined, typeMod: TypeModifier | undefined, identifier: EssentialToken | undefined }[],
    statBlock: NodeSTATBLOCK
}

// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
export interface NodeLITERAL extends NodeBase {
    nodeName: 'LITERAL';
    value: EssentialToken;
}

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
export interface NodeFUNCCALL extends NodeBase {
    nodeName: 'FUNCCALL'
    scope: NodeSCOPE | undefined,
    identifier: EssentialToken,
    argList: NodeARGLIST
}

// VARACCESS     ::= SCOPE IDENTIFIER
export interface NodeVARACCESS extends NodeBase {
    nodeName: 'VARACCESS';
    scope: NodeSCOPE | undefined,
    identifier: EssentialToken;
}

// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
export interface NodeARGLIST extends NodeBase {
    nodeName: 'ARGLIST';
    args: { identifier: EssentialToken | undefined, assign: NodeASSIGN }[];
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
export interface NodeASSIGN extends NodeBase {
    nodeName: 'ASSIGN';
    condition: NodeCONDITION;
    tail: {
        op: EssentialToken
        assign: NodeASSIGN
    } | undefined;
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
export interface NodeCONDITION extends NodeBase {
    nodeName: 'CONDITION'
    expr: NodeEXPR,
    ternary: {
        ta: NodeASSIGN,
        fa: NodeASSIGN
    } | undefined
}

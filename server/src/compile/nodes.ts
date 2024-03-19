import {EssentialToken, LocationInfo} from "./token";

export type AccessModifier = 'public' | 'private' | 'protected';

export type TypeModifier = 'in' | 'out' | 'inout';

export interface NodesRange {
    start: EssentialToken,
    end: EssentialToken
}

export function getRangeLocation(range: NodesRange): LocationInfo {
    return {
        uri: range.start.location.uri,
        start: range.start.location.start,
        end: range.end.location.end
    };
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

export interface NodesBase {
    nodeName: 'SCRIPT' | 'NAMESPACE' | 'ENUM' | 'CLASS' | 'TYPEDEF' | 'FUNC' | 'INTERFACE' | 'VAR' | 'IMPORT' | 'FUNCDEF' | 'VIRTPROP' | 'MIXIN' | 'INTFMTHD' | 'STATBLOCK' | 'PARAMLIST' | 'TYPEMOD' | 'TYPE' | 'INITLIST' | 'SCOPE' | 'DATATYPE' | 'PRIMTYPE' | 'FUNCATTR' | 'STATEMENT' | 'SWITCH' | 'BREAK' | 'FOR' | 'WHILE' | 'DOWHILE' | 'IF' | 'CONTINUE' | 'EXPRSTAT' | 'TRY' | 'RETURN' | 'CASE' | 'EXPR' | 'EXPRTERM' | 'EXPRVALUE' | 'CONSTRUCTCALL' | 'EXPRPREOP' | 'EXPRPOSTOP' | 'CAST' | 'LAMBDA' | 'LITERAL' | 'FUNCCALL' | 'VARACCESS' | 'ARGLIST' | 'ASSIGN' | 'CONDITION' | 'EXPROP' | 'BITOP' | 'MATHOP' | 'COMPOP' | 'LOGICOP' | 'ASSIGNOP' | 'IDENTIFIER' | 'NUMBER' | 'STRING' | 'BITS' | 'COMMENT' | 'WHITESPACE';
    nodeRange: NodesRange;
}

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
export type NodeScript = (NodeCLASS | NodeVar | NodeFunc | NodeNamespace)[];

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
export interface NodeNamespace extends NodesBase {
    nodeName: 'NAMESPACE'
    namespaceList: EssentialToken[],
    script: NodeScript
}

// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
export interface NodeEnum extends NodesBase {
    nodeName: 'ENUM'
    identifier: EssentialToken,
}

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
export interface NodeCLASS extends NodesBase {
    nodeName: 'CLASS'
    identifier: EssentialToken,
    baseList: EssentialToken[],
    memberList: (NodeVirtProp | NodeVar | NodeFunc | NodeFuncDef)[]
}

// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
export interface NodeFunc extends NodesBase {
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
export interface NodeVar extends NodesBase {
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
export interface NodeFuncDef extends NodesBase {
    nodeName: 'FUNCDEF';
}

// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
export interface NodeVirtProp extends NodesBase {
    nodeName: 'VIRTPROP'
    modifier: 'private' | 'protected' | 'null',
    type: NodeTYPE,
    isRef: boolean,
    identifier: EssentialToken,
    getter: [isConst: boolean, NodeSTATBLOCK | undefined] | undefined,
    setter: NodeFunc | undefined
}

// MIXIN         ::= 'mixin' CLASS
// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
export type NodeSTATBLOCK = {
    nodeName: 'STATBLOCK',
    statements: (NodeVar | NodeStatement)[]
};

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
export type NodePARAMLIST = DeclaredTypeIdentifier[];

export interface DeclaredTypeIdentifier {
    type: NodeTYPE,
    identifier: EssentialToken | undefined
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
export interface NodeTYPE extends NodesBase {
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
export interface NodeSCOPE extends NodesBase {
    nodeName: 'SCOPE'
    isGlobal: boolean,
    namespaceList: EssentialToken[],
    generic: {
        className: EssentialToken,
        types: NodeTYPE[]
    } | undefined
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
export interface NodeDATATYPE extends NodesBase {
    nodeName: 'DATATYPE';
    identifier: EssentialToken;
}

// PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
// FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property'}

// STATEMENT     ::= (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
export type NodeStatement =
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
export interface NodeSWITCH extends NodesBase {
    nodeName: 'SWITCH'
    assign: NodeASSIGN,
    cases: NodeCASE[]
}

// BREAK         ::= 'break' ';'
export interface NodeBREAK extends NodesBase {
    nodeName: 'BREAK';
}

// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
export interface NodeFOR extends NodesBase {
    nodeName: 'FOR'
    initial: NodeVar | NodeEXPRSTAT,
    condition: NodeEXPRSTAT,
    incrementList: NodeASSIGN[],
    statement: NodeStatement
}

// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
export interface NodeWHILE extends NodesBase {
    nodeName: 'WHILE'
    assign: NodeASSIGN,
    statement: NodeStatement
}

// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
export interface NodeDOWHILE extends NodesBase {
    nodeName: 'DOWHILE'
    statement: NodeStatement,
    assign: NodeASSIGN
}

// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
export interface NodeIF extends NodesBase {
    nodeName: 'IF'
    condition: NodeASSIGN,
    ts: NodeStatement,
    fs: NodeStatement | undefined
}

// CONTINUE      ::= 'continue' ';'
export interface NodeCONTINUE extends NodesBase {
    nodeName: 'CONTINUE';
}

// EXPRSTAT      ::= [ASSIGN] ';'
export type NodeEXPRSTAT = {
    nodeName: 'EXPRSTAT',
    assign: NodeASSIGN | undefined
};

// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK

// RETURN        ::= 'return' [ASSIGN] ';'
export interface NodeRETURN extends NodesBase {
    nodeName: 'RETURN';
    assign: NodeASSIGN;
}

// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
export interface NodeCASE extends NodesBase {
    nodeName: 'CASE'
    expr: NodeEXPR | undefined,
    statementList: NodeStatement[]
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
export interface NodeEXPR extends NodesBase {
    nodeName: 'EXPR'
    head: NodeEXPRTERM,
    tail: DeclaredOpExpr | undefined
}

export interface DeclaredOpExpr {
    operator: EssentialToken,
    expression: NodeEXPR
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export type NodeEXPRTERM = NodeEXPRTERM1 | NodeEXPRTERM2;

export interface NodeEXPRTERM1 extends NodesBase {
    nodeName: 'EXPRTERM'
    exprTerm: 1
    type: NodeTYPE,
    eq: EssentialToken | undefined,
}

// ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export interface NodeEXPRTERM2 extends NodesBase {
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
export interface NodeCONSTRUCTCALL extends NodesBase {
    nodeName: 'CONSTRUCTCALL';
    type: NodeTYPE;
    argList: NodeARGLIST;
}

// EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']') | ARGLIST | '++' | '--'
export type NodeEXPRPOSTOP = NodeEXPRPOSTOP1 | NodeEXPRPOSTOP2 | NodeEXPRPOSTOP3 | NodeEXPRPOSTOP4;

// ('.' (FUNCCALL | IDENTIFIER))
export interface NodeEXPRPOSTOP1 extends NodesBase {
    nodeName: 'EXPRPOSTOP';
    postOp: 1;
    member: NodeFUNCCALL | EssentialToken;
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
export interface NodeEXPRPOSTOP2 extends NodesBase {
    nodeName: 'EXPRPOSTOP';
    postOp: 2;
    indexes: { identifier: EssentialToken | undefined, assign: NodeASSIGN }[];
}

// ARGLIST
export interface NodeEXPRPOSTOP3 extends NodesBase {
    nodeName: 'EXPRPOSTOP';
    postOp: 3;
    args: NodeARGLIST;
}

// ++ | --
export interface NodeEXPRPOSTOP4 extends NodesBase {
    nodeName: 'EXPRPOSTOP';
    postOp: 4;
    operator: '++' | '--';
}

// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
export interface NodeCAST extends NodesBase {
    nodeName: 'CAST';
    type: NodeTYPE;
    assign: NodeASSIGN;
}

// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
export interface NodeLAMBDA extends NodesBase {
    nodeName: 'LAMBDA';
    params: { type: NodeTYPE | undefined, typeMod: TypeModifier | undefined, identifier: EssentialToken | undefined }[],
    statBlock: NodeSTATBLOCK
}

// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
export interface NodeLITERAL extends NodesBase {
    nodeName: 'LITERAL';
    value: EssentialToken;
}

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
export interface NodeFUNCCALL extends NodesBase {
    nodeName: 'FUNCCALL'
    scope: NodeSCOPE | undefined,
    identifier: EssentialToken,
    argList: NodeARGLIST
}

// VARACCESS     ::= SCOPE IDENTIFIER
export interface NodeVARACCESS extends NodesBase {
    nodeName: 'VARACCESS';
    scope: NodeSCOPE | undefined,
    identifier: EssentialToken;
}

// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
export interface NodeARGLIST extends NodesBase {
    nodeName: 'ARGLIST';
    args: DeclaredArgument[];
}

export interface DeclaredArgument {
    identifier: EssentialToken | undefined,
    assign: NodeASSIGN
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
export interface NodeASSIGN extends NodesBase {
    nodeName: 'ASSIGN';
    condition: NodeCONDITION;
    tail: {
        op: EssentialToken
        assign: NodeASSIGN
    } | undefined;
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
export interface NodeCONDITION extends NodesBase {
    nodeName: 'CONDITION'
    expr: NodeEXPR,
    ternary: {
        ta: NodeASSIGN,
        fa: NodeASSIGN
    } | undefined
}

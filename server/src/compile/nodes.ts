import {EssentialToken, LocationInfo} from "./token";
import {ParsingToken} from "./parsing";

export type AccessModifier = 'public' | 'private' | 'protected';

export type TypeModifier = 'in' | 'out' | 'inout';

export interface NodesRange {
    start: EssentialToken | ParsingToken;
    end: EssentialToken | ParsingToken;
}

export function getNodeLocation(range: NodesRange): LocationInfo {
    return {
        uri: range.start.location.uri,
        start: range.start.location.start,
        end: range.end.location.end
    };
}

// export interface MissingIdentifier {
//     missingRange: NodesRange;
// }

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
export type NodeScript = (NodeClass | NodeVar | NodeFunc | NodeNamespace)[];

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
export interface NodeClass extends NodesBase {
    nodeName: 'CLASS';
    scopeRange: NodesRange;
    identifier: EssentialToken;
    baseList: EssentialToken[];
    memberList: (NodeVirtProp | NodeVar | NodeFunc | NodeFuncDef)[];
}

// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
export interface NodeFunc extends NodesBase {
    nodeName: 'FUNC';
    scopeRange: NodesRange;
    entity: EntityModifier | undefined;
    accessor: AccessModifier;
    head: { returnType: NodeType; isRef: boolean; } | '~';
    identifier: EssentialToken;
    paramList: NodeParamList;
    isConst: boolean;
    funcAttr: EssentialToken | undefined;
    statBlock: NodeStatBlock;
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST]} ';'
export interface NodeVar extends NodesBase {
    nodeName: 'VAR'
    accessor: AccessModifier,
    type: NodeType,
    variables: {
        identifier: EssentialToken,
        initializer: NodeEXPR | NodeArgList | undefined
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
    type: NodeType,
    isRef: boolean,
    identifier: EssentialToken,
    getter: [isConst: boolean, NodeStatBlock | undefined] | undefined,
    setter: NodeFunc | undefined
}

// MIXIN         ::= 'mixin' CLASS
// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
export interface NodeStatBlock extends NodesBase {
    nodeName: 'STATBLOCK';
    statements: (NodeVar | NodeStatement)[];
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
export type NodeParamList = DeclaredTypeIdentifier[];

export interface DeclaredTypeIdentifier {
    type: NodeType,
    identifier: EssentialToken | undefined
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
export interface NodeType extends NodesBase {
    nodeName: 'TYPE'
    isConst: boolean,
    scope: NodeScope | undefined,
    datatype: NodeDATATYPE,
    genericList: NodeType[],
    isArray: boolean,
    isRef: boolean,
}

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'

// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
export interface NodeScope extends NodesBase {
    nodeName: 'SCOPE'
    isGlobal: boolean,
    namespaceList: EssentialToken[],
    generic: {
        className: EssentialToken,
        types: NodeType[]
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
    | NodeStatBlock
    | NodeBREAK
    | NodeCONTINUE
    | NodeDOWHILE
    | NodeSWITCH
    | NodeEXPRSTAT;

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
export interface NodeSWITCH extends NodesBase {
    nodeName: 'SWITCH'
    assign: NodeAssign,
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
    incrementList: NodeAssign[],
    statement: NodeStatement
}

// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
export interface NodeWHILE extends NodesBase {
    nodeName: 'WHILE'
    assign: NodeAssign,
    statement: NodeStatement
}

// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
export interface NodeDOWHILE extends NodesBase {
    nodeName: 'DOWHILE'
    statement: NodeStatement,
    assign: NodeAssign
}

// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
export interface NodeIF extends NodesBase {
    nodeName: 'IF'
    condition: NodeAssign,
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
    assign: NodeAssign | undefined
};

// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK

// RETURN        ::= 'return' [ASSIGN] ';'
export interface NodeRETURN extends NodesBase {
    nodeName: 'RETURN';
    assign: NodeAssign;
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
    type: NodeType,
    eq: EssentialToken | undefined,
}

// ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export interface NodeEXPRTERM2 extends NodesBase {
    nodeName: 'EXPRTERM'
    exprTerm: 2,
    preOp: EssentialToken | undefined,
    value: NodeExprValue,
    postOp: NodeExprPostOp | undefined
}

// EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
export type  NodeExprValue =
    NodeConstructCall
    | NodeFuncCall
    | NodeVarAccess
    | NodeCast
    | NodeLiteral
    | NodeAssign
    | NodeLambda;

// CONSTRUCTCALL ::= TYPE ARGLIST
export interface NodeConstructCall extends NodesBase {
    nodeName: 'CONSTRUCTCALL';
    type: NodeType;
    argList: NodeArgList;
}

// EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']') | ARGLIST | '++' | '--'
export type NodeExprPostOp = NodeExprPostOp1 | NodeExprPostOp2 | NodeExprPostOp3 | NodeExprPostOp4;

// ('.' (FUNCCALL | IDENTIFIER))
export interface NodeExprPostOp1 extends NodesBase {
    nodeName: 'EXPRPOSTOP';
    postOp: 1;
    member: NodeFuncCall | EssentialToken | undefined;
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
export interface NodeExprPostOp2 extends NodesBase {
    nodeName: 'EXPRPOSTOP';
    postOp: 2;
    indexes: { identifier: EssentialToken | undefined, assign: NodeAssign }[];
}

// ARGLIST
export interface NodeExprPostOp3 extends NodesBase {
    nodeName: 'EXPRPOSTOP';
    postOp: 3;
    args: NodeArgList;
}

// ++ | --
export interface NodeExprPostOp4 extends NodesBase {
    nodeName: 'EXPRPOSTOP';
    postOp: 4;
    operator: '++' | '--';
}

// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
export interface NodeCast extends NodesBase {
    nodeName: 'CAST';
    type: NodeType;
    assign: NodeAssign;
}

// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
export interface NodeLambda extends NodesBase {
    nodeName: 'LAMBDA';
    params: { type: NodeType | undefined, typeMod: TypeModifier | undefined, identifier: EssentialToken | undefined }[],
    statBlock: NodeStatBlock
}

// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
export interface NodeLiteral extends NodesBase {
    nodeName: 'LITERAL';
    value: EssentialToken;
}

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
export interface NodeFuncCall extends NodesBase {
    nodeName: 'FUNCCALL'
    scope: NodeScope | undefined,
    identifier: EssentialToken,
    argList: NodeArgList
}

// VARACCESS     ::= SCOPE IDENTIFIER
export interface NodeVarAccess extends NodesBase {
    nodeName: 'VARACCESS';
    scope: NodeScope | undefined,
    identifier: EssentialToken;
}

// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
export interface NodeArgList extends NodesBase {
    nodeName: 'ARGLIST';
    args: DeclaredArgument[];
}

export interface DeclaredArgument {
    identifier: EssentialToken | undefined,
    assign: NodeAssign
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
export interface NodeAssign extends NodesBase {
    nodeName: 'ASSIGN';
    condition: NodeCondition;
    tail: {
        op: EssentialToken
        assign: NodeAssign
    } | undefined;
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
export interface NodeCondition extends NodesBase {
    nodeName: 'CONDITION'
    expr: NodeEXPR,
    ternary: {
        ta: NodeAssign,
        fa: NodeAssign
    } | undefined
}

import {LocationInfo} from "./token";
import {ParsingToken} from "./parsing";

export type AccessModifier = 'public' | 'private' | 'protected';

export type TypeModifier = 'in' | 'out' | 'inout';

export interface ParsedRange {
    start: ParsingToken;
    end: ParsingToken;
}

export function getNextTokenIfExist(token: ParsingToken): ParsingToken {
    if (token.next !== undefined) return token.next;
    return token;
}

export function getNodeLocation(range: ParsedRange): LocationInfo {
    return {
        path: range.start.location.path,
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

export type NodeNames =
    'Script'
    | 'Namespace'
    | 'Enum'
    | 'Class'
    | 'Typedef'
    | 'Func'
    | 'Interface'
    | 'Var'
    | 'Import'
    | 'Funcdef'
    | 'VirtProp'
    | 'Mixin'
    | 'IntfMthd'
    | 'StatBlock'
    | 'ParamList'
    | 'TypeMod'
    | 'Type'
    | 'InitList'
    | 'Scope'
    | 'DataType'
    | 'PrimType'
    | 'FuncAttr'
    | 'Statement'
    | 'Switch'
    | 'Break'
    | 'For'
    | 'While'
    | 'DoWhile'
    | 'If'
    | 'Continue'
    | 'ExprStat'
    | 'Try'
    | 'Return'
    | 'Case'
    | 'Expr'
    | 'ExprTerm'
    | 'ExprValue'
    | 'ConstructCall'
    | 'ExprPreOp'
    | 'ExprPostOp'
    | 'Cast'
    | 'Lambda'
    | 'Literal'
    | 'FuncCall'
    | 'VarAccess'
    | 'ArgList'
    | 'Assign'
    | 'Condition'
    | 'ExprOp'
    | 'BitOp'
    | 'MathOp'
    | 'CompOp'
    | 'LogicOp'
    | 'AssignOp'
    | 'Identifier'
    | 'Number'
    | 'String'
    | 'Bits'
    | 'Comment'
    | 'Whitespace';

export interface NodesBase {
    nodeName: NodeNames;
    nodeRange: ParsedRange;
}

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
export type NodeScript = (NodeClass | NodeVar | NodeFunc | NodeNamespace)[];

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
export interface NodeNamespace extends NodesBase {
    nodeName: 'Namespace'
    namespaceList: ParsingToken[],
    script: NodeScript
}

// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
export interface NodeEnum extends NodesBase {
    nodeName: 'Enum'
    identifier: ParsingToken,
}

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
export interface NodeClass extends NodesBase {
    nodeName: 'Class';
    scopeRange: ParsedRange;
    identifier: ParsingToken;
    baseList: ParsingToken[];
    memberList: (NodeVirtProp | NodeVar | NodeFunc | NodeFuncDef)[];
}

// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
export interface NodeFunc extends NodesBase {
    nodeName: 'Func';
    scopeRange: ParsedRange;
    entity: EntityModifier | undefined;
    accessor: AccessModifier;
    head: { returnType: NodeType; isRef: boolean; } | '~';
    identifier: ParsingToken;
    paramList: NodeParamList;
    isConst: boolean;
    funcAttr: ParsingToken | undefined;
    statBlock: NodeStatBlock;
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST]} ';'
export interface NodeVar extends NodesBase {
    nodeName: 'Var'
    accessor: AccessModifier,
    type: NodeType,
    variables: {
        identifier: ParsingToken,
        initializer: NodeEXPR | NodeArgList | undefined
    }[];
}

// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'

// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
export interface NodeFuncDef extends NodesBase {
    nodeName: 'Funcdef';
}

// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
export interface NodeVirtProp extends NodesBase {
    nodeName: 'VirtProp'
    modifier: 'private' | 'protected' | 'null',
    type: NodeType,
    isRef: boolean,
    identifier: ParsingToken,
    getter: [isConst: boolean, NodeStatBlock | undefined] | undefined,
    setter: NodeFunc | undefined
}

// MIXIN         ::= 'mixin' CLASS
// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
export interface NodeStatBlock extends NodesBase {
    nodeName: 'StatBlock';
    statements: (NodeVar | NodeStatement)[];
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
export type NodeParamList = DeclaredTypeIdentifier[];

export interface DeclaredTypeIdentifier {
    type: NodeType,
    identifier: ParsingToken | undefined
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
export interface NodeType extends NodesBase {
    nodeName: 'Type'
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
    nodeName: 'Scope'
    isGlobal: boolean,
    namespaceList: ParsingToken[],
    generic: {
        className: ParsingToken,
        types: NodeType[]
    } | undefined
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
export interface NodeDATATYPE extends NodesBase {
    nodeName: 'DataType';
    identifier: ParsingToken;
}

// PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
// FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property'}

// STATEMENT     ::= (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
export type NodeStatement =
    NodeIf
    | NodeFor
    | NodeWhile
    | NodeReturn
    | NodeStatBlock
    | NodeBreak
    | NodeContinue
    | NodeDoWhile
    | NodeSwitch
    | NodeExprStat;

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
export interface NodeSwitch extends NodesBase {
    nodeName: 'Switch'
    assign: NodeAssign,
    cases: NodeCASE[]
}

// BREAK         ::= 'break' ';'
export interface NodeBreak extends NodesBase {
    nodeName: 'Break';
}

// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
export interface NodeFor extends NodesBase {
    nodeName: 'For'
    initial: NodeVar | NodeExprStat,
    condition: NodeExprStat,
    incrementList: NodeAssign[],
    statement: NodeStatement
}

// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
export interface NodeWhile extends NodesBase {
    nodeName: 'While'
    assign: NodeAssign,
    statement: NodeStatement
}

// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
export interface NodeDoWhile extends NodesBase {
    nodeName: 'DoWhile'
    statement: NodeStatement,
    assign: NodeAssign
}

// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
export interface NodeIf extends NodesBase {
    nodeName: 'If'
    condition: NodeAssign,
    ts: NodeStatement,
    fs: NodeStatement | undefined
}

// CONTINUE      ::= 'continue' ';'
export interface NodeContinue extends NodesBase {
    nodeName: 'Continue';
}

// EXPRSTAT      ::= [ASSIGN] ';'
export type NodeExprStat = {
    nodeName: 'ExprStat',
    assign: NodeAssign | undefined
};

// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK

// RETURN        ::= 'return' [ASSIGN] ';'
export interface NodeReturn extends NodesBase {
    nodeName: 'Return';
    assign: NodeAssign;
}

// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
export interface NodeCASE extends NodesBase {
    nodeName: 'Case'
    expr: NodeEXPR | undefined,
    statementList: NodeStatement[]
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
export interface NodeEXPR extends NodesBase {
    nodeName: 'Expr'
    head: NodeEXPRTERM,
    tail: DeclaredOpExpr | undefined
}

export interface DeclaredOpExpr {
    operator: ParsingToken,
    expression: NodeEXPR
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export type NodeEXPRTERM = NodeEXPRTERM1 | NodeEXPRTERM2;

export interface NodeEXPRTERM1 extends NodesBase {
    nodeName: 'ExprTerm'
    exprTerm: 1
    type: NodeType,
    eq: ParsingToken | undefined,
}

// ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export interface NodeEXPRTERM2 extends NodesBase {
    nodeName: 'ExprTerm'
    exprTerm: 2,
    preOp: ParsingToken | undefined,
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
    nodeName: 'ConstructCall';
    type: NodeType;
    argList: NodeArgList;
}

// EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']') | ARGLIST | '++' | '--'
export type NodeExprPostOp = NodeExprPostOp1 | NodeExprPostOp2 | NodeExprPostOp3 | NodeExprPostOp4;

// ('.' (FUNCCALL | IDENTIFIER))
export interface NodeExprPostOp1 extends NodesBase {
    nodeName: 'ExprPostOp';
    postOp: 1;
    member: NodeFuncCall | ParsingToken | undefined;
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
export interface NodeExprPostOp2 extends NodesBase {
    nodeName: 'ExprPostOp';
    postOp: 2;
    indexes: { identifier: ParsingToken | undefined, assign: NodeAssign }[];
}

// ARGLIST
export interface NodeExprPostOp3 extends NodesBase {
    nodeName: 'ExprPostOp';
    postOp: 3;
    args: NodeArgList;
}

// ++ | --
export interface NodeExprPostOp4 extends NodesBase {
    nodeName: 'ExprPostOp';
    postOp: 4;
    operator: '++' | '--';
}

// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
export interface NodeCast extends NodesBase {
    nodeName: 'Cast';
    type: NodeType;
    assign: NodeAssign;
}

// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
export interface NodeLambda extends NodesBase {
    nodeName: 'Lambda';
    params: { type: NodeType | undefined, typeMod: TypeModifier | undefined, identifier: ParsingToken | undefined }[],
    statBlock: NodeStatBlock
}

// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
export interface NodeLiteral extends NodesBase {
    nodeName: 'Literal';
    value: ParsingToken;
}

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
export interface NodeFuncCall extends NodesBase {
    nodeName: 'FuncCall'
    scope: NodeScope | undefined,
    identifier: ParsingToken,
    argList: NodeArgList
}

// VARACCESS     ::= SCOPE IDENTIFIER
export interface NodeVarAccess extends NodesBase {
    nodeName: 'VarAccess';
    scope: NodeScope | undefined;
    identifier: ParsingToken | undefined;
}

// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
export interface NodeArgList extends NodesBase {
    nodeName: 'ArgList';
    args: DeclaredArgument[];
}

export interface DeclaredArgument {
    identifier: ParsingToken | undefined,
    assign: NodeAssign
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
export interface NodeAssign extends NodesBase {
    nodeName: 'Assign';
    condition: NodeCondition;
    tail: {
        op: ParsingToken
        assign: NodeAssign
    } | undefined;
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
export interface NodeCondition extends NodesBase {
    nodeName: 'Condition'
    expr: NodeEXPR,
    ternary: {
        ta: NodeAssign,
        fa: NodeAssign
    } | undefined
}

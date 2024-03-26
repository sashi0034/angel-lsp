import {LocationInfo} from "./token";
import {ParsingToken} from "./parsing";

export enum AccessModifier {
    Private = 'private',
    Protected = 'protected',
}

export enum TypeModifier {
    In = 'in',
    Out = 'out',
    InOut = 'inout',
}

export enum ReferenceModifier {
    At = '@',
    AtConst = '@const',
}

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

export interface EntityModifier {
    isShared: boolean,
    isExternal: boolean,
    isAbstract: boolean,
    isFinal: boolean,
}

export function setEntityModifier(modifier: EntityModifier, token: string) {
    switch (token) {
    case 'shared':
        modifier.isShared = true;
        break;
    case 'external':
        modifier.isExternal = true;
        break;
    case 'abstract':
        modifier.isAbstract = true;
        break;
    case 'final':
        modifier.isFinal = true;
        break;
    }
}

export function isEntityModifierForClass(modifier: EntityModifier) {
    return modifier.isAbstract || modifier.isFinal;
}

export enum NodeName {
    NodeName = 'NodeName',
    Namespace = 'Namespace',
    Enum = 'Enum',
    Class = 'Class',
    Typedef = 'Typedef',
    Func = 'Func',
    Interface = 'Interface',
    Var = 'Var',
    Import = 'Import',
    Funcdef = 'Funcdef',
    VirtProp = 'VirtProp',
    Mixin = 'Mixin',
    IntfMthd = 'IntfMthd',
    StatBlock = 'StatBlock',
    ParamList = 'ParamList',
    TypeMod = 'TypeMod',
    Type = 'Type',
    InitList = 'InitList',
    Scope = 'Scope',
    DataType = 'DataType',
    PrimType = 'PrimType',
    FuncAttr = 'FuncAttr',
    Statement = 'Statement',
    Switch = 'Switch',
    Break = 'Break',
    For = 'For',
    While = 'While',
    DoWhile = 'DoWhile',
    If = 'If',
    Continue = 'Continue',
    ExprStat = 'ExprStat',
    Try = 'Try',
    Return = 'Return',
    Case = 'Case',
    Expr = 'Expr',
    ExprTerm = 'ExprTerm',
    ExprValue = 'ExprValue',
    ConstructCall = 'ConstructCall',
    ExprPreOp = 'ExprPreOp',
    ExprPostOp = 'ExprPostOp',
    Cast = 'Cast',
    Lambda = 'Lambda',
    Literal = 'Literal',
    FuncCall = 'FuncCall',
    VarAccess = 'VarAccess',
    ArgList = 'ArgList',
    Assign = 'Assign',
    Condition = 'Condition',
    ExprOp = 'ExprOp',
    BitOp = 'BitOp',
    MathOp = 'MathOp',
    CompOp = 'CompOp',
    LogicOp = 'LogicOp',
    AssignOp = 'AssignOp',
    Identifier = 'Identifier',
    Number = 'Number',
    String = 'String',
    Bits = 'Bits',
    Comment = 'Comment',
    Whitespace = 'Whitespace',
}

export interface NodesBase {
    nodeName: NodeName;
    nodeRange: ParsedRange;
}

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
export type NodeScript = (NodeEnum | NodeClass | NodeVar | NodeFunc | NodeNamespace)[];

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
export interface NodeNamespace extends NodesBase {
    nodeName: NodeName.Namespace
    namespaceList: ParsingToken[],
    script: NodeScript
}

// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
export interface NodeEnum extends NodesBase {
    nodeName: NodeName.Enum;
    scopeRange: ParsedRange;
    entity: EntityModifier | undefined;
    identifier: ParsingToken;
    members: DeclaredEnumMember[];
}

export interface DeclaredEnumMember {
    identifier: ParsingToken,
    expr: NodeExpr | undefined
}

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
export interface NodeClass extends NodesBase {
    nodeName: NodeName.Class;
    scopeRange: ParsedRange;
    entity: EntityModifier | undefined;
    identifier: ParsingToken;
    typeParameters: NodeType[] | undefined;
    baseList: ParsingToken[];
    memberList: (NodeVirtProp | NodeVar | NodeFunc | NodeFuncDef)[];
}

// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
export interface FunctionReturns {
    returnType: NodeType;
    isRef: boolean;
}

export const functionDestructor = Symbol();
export type FunctionDestructor = typeof functionDestructor;

export interface NodeFunc extends NodesBase {
    nodeName: NodeName.Func;
    scopeRange: ParsedRange;
    entity: EntityModifier | undefined;
    accessor: AccessModifier | undefined;
    head: FunctionReturns | FunctionDestructor;
    identifier: ParsingToken;
    paramList: NodeParamList;
    isConst: boolean;
    funcAttr: ParsingToken | undefined;
    statBlock: NodeStatBlock;
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST]} ';'
export interface NodeVar extends NodesBase {
    nodeName: NodeName.Var
    accessor: AccessModifier | undefined,
    type: NodeType,
    variables: {
        identifier: ParsingToken,
        initializer: NodeExpr | NodeArgList | undefined
    }[];
}

// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'

// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
export interface NodeFuncDef extends NodesBase {
    nodeName: NodeName.Funcdef;
}

// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
export interface NodeVirtProp extends NodesBase {
    nodeName: NodeName.VirtProp
    modifier: AccessModifier | undefined,
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
    nodeName: NodeName.StatBlock;
    statements: (NodeVar | NodeStatement)[];
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
export type NodeParamList = DeclaredTypeIdentifier[];

export interface DeclaredTypeIdentifier {
    type: NodeType,
    modifier: TypeModifier | undefined,
    identifier: ParsingToken | undefined
    defaultExpr: NodeExpr | undefined
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
export interface NodeType extends NodesBase {
    nodeName: NodeName.Type
    isConst: boolean,
    scope: NodeScope | undefined,
    datatype: NodeDataType,
    typeParameters: NodeType[],
    isArray: boolean,
    refModifier: ReferenceModifier | undefined,
}

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'

// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
export interface NodeScope extends NodesBase {
    nodeName: NodeName.Scope
    isGlobal: boolean,
    namespaceList: ParsingToken[],
    typeParameters: NodeType[]
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
export interface NodeDataType extends NodesBase {
    nodeName: NodeName.DataType;
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
    nodeName: NodeName.Switch
    assign: NodeAssign,
    cases: NodeCASE[]
}

// BREAK         ::= 'break' ';'
export interface NodeBreak extends NodesBase {
    nodeName: NodeName.Break;
}

// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
export interface NodeFor extends NodesBase {
    nodeName: NodeName.For
    initial: NodeVar | NodeExprStat,
    condition: NodeExprStat,
    incrementList: NodeAssign[],
    statement: NodeStatement
}

// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
export interface NodeWhile extends NodesBase {
    nodeName: NodeName.While
    assign: NodeAssign,
    statement: NodeStatement
}

// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
export interface NodeDoWhile extends NodesBase {
    nodeName: NodeName.DoWhile
    statement: NodeStatement,
    assign: NodeAssign
}

// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
export interface NodeIf extends NodesBase {
    nodeName: NodeName.If
    condition: NodeAssign,
    ts: NodeStatement,
    fs: NodeStatement | undefined
}

// CONTINUE      ::= 'continue' ';'
export interface NodeContinue extends NodesBase {
    nodeName: NodeName.Continue;
}

// EXPRSTAT      ::= [ASSIGN] ';'
export type NodeExprStat = {
    nodeName: NodeName.ExprStat,
    assign: NodeAssign | undefined
};

// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK

// RETURN        ::= 'return' [ASSIGN] ';'
export interface NodeReturn extends NodesBase {
    nodeName: NodeName.Return;
    assign: NodeAssign;
}

// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
export interface NodeCASE extends NodesBase {
    nodeName: NodeName.Case
    expr: NodeExpr | undefined,
    statementList: NodeStatement[]
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
export interface NodeExpr extends NodesBase {
    nodeName: NodeName.Expr
    head: NodeEXPRTERM,
    tail: DeclaredOpExpr | undefined
}

export interface DeclaredOpExpr {
    operator: ParsingToken,
    expression: NodeExpr
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export type NodeEXPRTERM = NodeEXPRTERM1 | NodeEXPRTERM2;

export interface NodeEXPRTERM1 extends NodesBase {
    nodeName: NodeName.ExprTerm
    exprTerm: 1
    type: NodeType,
    eq: ParsingToken | undefined,
}

// ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export interface NodeEXPRTERM2 extends NodesBase {
    nodeName: NodeName.ExprTerm
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
    nodeName: NodeName.ConstructCall;
    type: NodeType;
    argList: NodeArgList;
}

// EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']') | ARGLIST | '++' | '--'
export type NodeExprPostOp = NodeExprPostOp1 | NodeExprPostOp2 | NodeExprPostOp3 | NodeExprPostOp4;

// ('.' (FUNCCALL | IDENTIFIER))
export interface NodeExprPostOp1 extends NodesBase {
    nodeName: NodeName.ExprPostOp;
    postOp: 1;
    member: NodeFuncCall | ParsingToken | undefined;
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
export interface NodeExprPostOp2 extends NodesBase {
    nodeName: NodeName.ExprPostOp;
    postOp: 2;
    indexes: { identifier: ParsingToken | undefined, assign: NodeAssign }[];
}

// ARGLIST
export interface NodeExprPostOp3 extends NodesBase {
    nodeName: NodeName.ExprPostOp;
    postOp: 3;
    args: NodeArgList;
}

// ++ | --
export interface NodeExprPostOp4 extends NodesBase {
    nodeName: NodeName.ExprPostOp;
    postOp: 4;
    operator: '++' | '--';
}

// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
export interface NodeCast extends NodesBase {
    nodeName: NodeName.Cast;
    type: NodeType;
    assign: NodeAssign;
}

// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
export interface NodeLambda extends NodesBase {
    nodeName: NodeName.Lambda;
    params: { type: NodeType | undefined, typeMod: TypeModifier | undefined, identifier: ParsingToken | undefined }[],
    statBlock: NodeStatBlock
}

// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
export interface NodeLiteral extends NodesBase {
    nodeName: NodeName.Literal;
    value: ParsingToken;
}

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
export interface NodeFuncCall extends NodesBase {
    nodeName: NodeName.FuncCall
    scope: NodeScope | undefined,
    identifier: ParsingToken,
    argList: NodeArgList
}

// VARACCESS     ::= SCOPE IDENTIFIER
export interface NodeVarAccess extends NodesBase {
    nodeName: NodeName.VarAccess;
    scope: NodeScope | undefined;
    identifier: ParsingToken | undefined;
}

// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
export interface NodeArgList extends NodesBase {
    nodeName: NodeName.ArgList;
    argList: DeclaredArgument[];
}

export interface DeclaredArgument {
    identifier: ParsingToken | undefined,
    assign: NodeAssign
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
export interface NodeAssign extends NodesBase {
    nodeName: NodeName.Assign;
    condition: NodeCondition;
    tail: {
        op: ParsingToken
        assign: NodeAssign
    } | undefined;
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
export interface NodeCondition extends NodesBase {
    nodeName: NodeName.Condition
    expr: NodeExpr,
    ternary: {
        ta: NodeAssign,
        fa: NodeAssign
    } | undefined
}

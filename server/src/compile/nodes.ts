import {ParsedToken} from "./parsedToken";

export enum AccessModifier {
    Private = 'Private',
    Protected = 'Protected',
}

export enum TypeModifier {
    In = 'In',
    Out = 'Out',
    InOut = 'InOut',
}

export enum ReferenceModifier {
    At = 'At',
    AtConst = 'AtConst',
}

export interface ParsedRange {
    readonly start: ParsedToken;
    readonly end: ParsedToken;
}

export function makeParsedRange(start: ParsedToken, end: ParsedToken): ParsedRange {
    return {
        start: start,
        end: end
    };
}

export interface EntityAttribute {
    readonly isShared: boolean,
    readonly isExternal: boolean,
    readonly isAbstract: boolean,
    readonly isFinal: boolean,
}

export interface FunctionAttribute {
    readonly isOverride: boolean,
    readonly isFinal: boolean,
    readonly isExplicit: boolean,
    readonly isProperty: boolean
}

export enum NodeName {
    NodeName = 'NodeName',
    Namespace = 'Namespace',
    Enum = 'Enum',
    Class = 'Class',
    TypeDef = 'TypeDef',
    Func = 'Func',
    Interface = 'Interface',
    Var = 'Var',
    Import = 'Import',
    FuncDef = 'FuncDef',
    VirtualProp = 'VirtualProp',
    Mixin = 'Mixin',
    IntfMethod = 'IntfMethod',
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
    readonly nodeName: NodeName;
    readonly nodeRange: ParsedRange;
}

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
export type NodeScript = NodeScriptMember[];

export type NodeScriptMember =
    NodeImport
    | NodeEnum
    | NodeTypeDef
    | NodeClass
    | NodeMixin
    | NodeInterface
    | NodeFuncDef
    | NodeVirtualProp
    | NodeVar
    | NodeFunc
    | NodeNamespace;

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
export interface NodeNamespace extends NodesBase {
    nodeName: NodeName.Namespace
    namespaceList: ParsedToken[],
    script: NodeScript
}

// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
export interface NodeEnum extends NodesBase {
    readonly nodeName: NodeName.Enum;
    readonly scopeRange: ParsedRange;
    readonly entity: EntityAttribute | undefined;
    readonly identifier: ParsedToken;
    readonly memberList: ParsedEnumMember[];
}

export interface ParsedEnumMember {
    readonly identifier: ParsedToken,
    readonly expr: NodeExpr | undefined
}

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
export interface NodeClass extends NodesBase {
    readonly nodeName: NodeName.Class;
    readonly scopeRange: ParsedRange;
    readonly entity: EntityAttribute | undefined;
    readonly identifier: ParsedToken;
    readonly typeTemplates: NodeType[] | undefined;
    readonly baseList: ParsedToken[];
    readonly memberList: (NodeVirtualProp | NodeVar | NodeFunc | NodeFuncDef)[];
}

// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'
export interface NodeTypeDef extends NodesBase {
    readonly nodeName: NodeName.TypeDef;
    readonly type: ParsedToken;
    readonly identifier: ParsedToken;
}

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
export interface NodeFunc extends NodesBase {
    readonly nodeName: NodeName.Func;
    readonly entity: EntityAttribute | undefined;
    readonly accessor: AccessModifier | undefined;
    readonly head: FuncHeads;
    readonly identifier: ParsedToken;
    readonly paramList: NodeParamList;
    readonly isConst: boolean;
    readonly funcAttr: FunctionAttribute | undefined;
    readonly statBlock: NodeStatBlock;
}

export interface FuncHeadReturnValue {
    readonly returnType: NodeType;
    readonly isRef: boolean;
}

export const funcHeadDestructor = Symbol();
export type FuncHeadDestructor = typeof funcHeadDestructor;

export const funcHeadConstructor = Symbol();
export type FuncHeadConstructor = typeof funcHeadConstructor;

export type FuncHeads = FuncHeadReturnValue | FuncHeadDestructor | FuncHeadConstructor;

export function isFunctionHeadReturnValue(head: FuncHeads): head is FuncHeadReturnValue {
    return head !== funcHeadDestructor && head !== funcHeadConstructor;
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))
export interface NodeInterface extends NodesBase {
    readonly nodeName: NodeName.Interface;
    readonly entity: EntityAttribute | undefined;
    readonly identifier: ParsedToken;
    readonly baseList: ParsedToken[];
    readonly memberList: (NodeVirtualProp | NodeIntfMethod)[];
}

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
export interface NodeVar extends NodesBase {
    readonly nodeName: NodeName.Var
    readonly accessor: AccessModifier | undefined,
    readonly type: NodeType,
    readonly variables: ParsedVariableInit[];
}

export interface ParsedVariableInit {
    readonly identifier: ParsedToken;
    readonly initializer: NodeInitList | NodeAssign | NodeArgList | undefined;
}

// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
export interface NodeImport extends NodesBase {
    readonly nodeName: NodeName.Import;
    readonly type: NodeType;
    readonly isRef: boolean;
    readonly identifier: ParsedToken;
    readonly paramList: NodeParamList;
    readonly funcAttr: FunctionAttribute | undefined;
    readonly path: ParsedToken;
}

// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
export interface NodeFuncDef extends NodesBase {
    readonly nodeName: NodeName.FuncDef;
    readonly entity: EntityAttribute | undefined;
    readonly returnType: NodeType;
    readonly isRef: boolean;
    readonly identifier: ParsedToken;
    readonly paramList: NodeParamList;
}

// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
export interface NodeVirtualProp extends NodesBase {
    readonly nodeName: NodeName.VirtualProp
    readonly accessor: AccessModifier | undefined,
    readonly type: NodeType,
    readonly isRef: boolean,
    readonly identifier: ParsedToken,
    readonly getter: ParsedGetterSetter | undefined,
    readonly setter: ParsedGetterSetter | undefined
}

export interface ParsedGetterSetter {
    readonly isConst: boolean,
    readonly funcAttr: FunctionAttribute | undefined,
    readonly statBlock: NodeStatBlock | undefined
}

// MIXIN         ::= 'mixin' CLASS
export interface NodeMixin extends NodesBase {
    readonly nodeName: NodeName.Mixin;
    readonly mixinClass: NodeClass;
}

// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'
export interface NodeIntfMethod extends NodesBase {
    readonly nodeName: NodeName.IntfMethod;
    readonly returnType: NodeType;
    readonly isRef: boolean;
    readonly identifier: ParsedToken;
    readonly paramList: NodeParamList;
    readonly isConst: boolean;
}

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
export interface NodeStatBlock extends NodesBase {
    readonly nodeName: NodeName.StatBlock;
    readonly statementList: (NodeVar | NodeStatement)[];
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
export type NodeParamList = ParsedTypeIdentifier[];

export interface ParsedTypeIdentifier {
    readonly type: NodeType,
    readonly modifier: TypeModifier | undefined,
    readonly identifier: ParsedToken | undefined
    readonly defaultExpr: NodeExpr | undefined
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
export interface NodeType extends NodesBase {
    readonly nodeName: NodeName.Type
    readonly isConst: boolean,
    readonly scope: NodeScope | undefined,
    readonly dataType: NodeDataType,
    readonly typeTemplates: NodeType[],
    readonly isArray: boolean,
    readonly refModifier: ReferenceModifier | undefined,
}

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
export interface NodeInitList extends NodesBase {
    readonly nodeName: NodeName.InitList;
    readonly initList: (NodeAssign | NodeInitList)[];
}

// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
export interface NodeScope extends NodesBase {
    readonly nodeName: NodeName.Scope
    readonly isGlobal: boolean,
    readonly scopeList: ParsedToken[],
    readonly typeTemplates: NodeType[]
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
export interface NodeDataType extends NodesBase {
    readonly nodeName: NodeName.DataType;
    readonly identifier: ParsedToken;
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
    | NodeExprStat
    | NodeTry;

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
export interface NodeSwitch extends NodesBase {
    readonly nodeName: NodeName.Switch
    readonly assign: NodeAssign,
    readonly caseList: NodeCase[]
}

// BREAK         ::= 'break' ';'
export interface NodeBreak extends NodesBase {
    readonly nodeName: NodeName.Break;
}

// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
export interface NodeFor extends NodesBase {
    readonly nodeName: NodeName.For
    readonly initial: NodeVar | NodeExprStat,
    readonly condition: NodeExprStat | undefined
    readonly incrementList: NodeAssign[],
    readonly statement: NodeStatement | undefined
}

// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
export interface NodeWhile extends NodesBase {
    readonly nodeName: NodeName.While
    readonly assign: NodeAssign,
    readonly statement: NodeStatement | undefined
}

// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
export interface NodeDoWhile extends NodesBase {
    readonly nodeName: NodeName.DoWhile
    readonly statement: NodeStatement,
    readonly assign: NodeAssign | undefined
}

// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
export interface NodeIf extends NodesBase {
    readonly nodeName: NodeName.If
    readonly condition: NodeAssign,
    readonly thenStat: NodeStatement | undefined,
    readonly elseStat: NodeStatement | undefined
}

// CONTINUE      ::= 'continue' ';'
export interface NodeContinue extends NodesBase {
    readonly nodeName: NodeName.Continue;
}

// EXPRSTAT      ::= [ASSIGN] ';'
export interface NodeExprStat extends NodesBase {
    readonly nodeName: NodeName.ExprStat,
    readonly assign: NodeAssign | undefined
}

// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK
export interface NodeTry extends NodesBase {
    readonly nodeName: NodeName.Try;
    readonly tryBlock: NodeStatBlock,
    readonly catchBlock: NodeStatBlock | undefined
}

// RETURN        ::= 'return' [ASSIGN] ';'
export interface NodeReturn extends NodesBase {
    readonly nodeName: NodeName.Return;
    readonly assign: NodeAssign | undefined;
}

// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
export interface NodeCase extends NodesBase {
    readonly nodeName: NodeName.Case
    readonly expr: NodeExpr | undefined,
    readonly statementList: NodeStatement[]
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
export interface NodeExpr extends NodesBase {
    readonly nodeName: NodeName.Expr
    readonly head: NodeExprTerm,
    readonly tail: ParsedOpExpr | undefined
}

export interface ParsedOpExpr {
    readonly operator: ParsedToken,
    readonly expression: NodeExpr
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export type NodeExprTerm = NodeExprTerm1 | NodeExprTerm2;

// ([TYPE '='] INITLIST)
export interface NodeExprTerm1 extends NodesBase {
    readonly nodeName: NodeName.ExprTerm
    readonly exprTerm: 1
    readonly type: NodeType | undefined,
    readonly initList: NodeInitList
}

// ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export interface NodeExprTerm2 extends NodesBase {
    readonly nodeName: NodeName.ExprTerm
    readonly exprTerm: 2,
    readonly preOps: ParsedToken[],
    readonly value: NodeExprValue,
    readonly postOps: NodeExprPostOp[]
}

// EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
export type NodeExprValue =
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
    readonly nodeName: NodeName.ExprPostOp;
    readonly postOp: 1;
    readonly member: NodeFuncCall | ParsedToken | undefined;
}

export function isMemberMethodInPostOp(member: NodeFuncCall | ParsedToken | undefined): member is NodeFuncCall {
    return member !== undefined && 'nodeName' in member;
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
export interface NodeExprPostOp2 extends NodesBase {
    readonly nodeName: NodeName.ExprPostOp;
    readonly postOp: 2;
    readonly indexerList: ParsedPostIndexer[];
}

export interface ParsedPostIndexer {
    readonly identifier: ParsedToken | undefined,
    readonly assign: NodeAssign
}

// ARGLIST
export interface NodeExprPostOp3 extends NodesBase {
    readonly nodeName: NodeName.ExprPostOp;
    readonly postOp: 3;
    readonly args: NodeArgList;
}

// ++ | --
export interface NodeExprPostOp4 extends NodesBase {
    readonly nodeName: NodeName.ExprPostOp;
    readonly postOp: 4;
    readonly operator: '++' | '--';
}

// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
export interface NodeCast extends NodesBase {
    readonly nodeName: NodeName.Cast;
    readonly type: NodeType;
    readonly assign: NodeAssign;
}

// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
export interface NodeLambda extends NodesBase {
    readonly nodeName: NodeName.Lambda;
    readonly paramList: ParsedLambdaParams[],
    readonly statBlock: NodeStatBlock | undefined
}

export interface ParsedLambdaParams {
    readonly type: NodeType | undefined,
    readonly typeMod: TypeModifier | undefined,
    readonly identifier: ParsedToken | undefined
}

// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
export interface NodeLiteral extends NodesBase {
    readonly nodeName: NodeName.Literal;
    readonly value: ParsedToken;
}

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
export interface NodeFuncCall extends NodesBase {
    readonly nodeName: NodeName.FuncCall
    readonly scope: NodeScope | undefined,
    readonly identifier: ParsedToken,
    readonly argList: NodeArgList
}

// VARACCESS     ::= SCOPE IDENTIFIER
export interface NodeVarAccess extends NodesBase {
    readonly nodeName: NodeName.VarAccess;
    readonly scope: NodeScope | undefined;
    readonly identifier: ParsedToken | undefined;
}

// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
export interface NodeArgList extends NodesBase {
    readonly nodeName: NodeName.ArgList;
    readonly argList: ParsedArgument[];
}

export interface ParsedArgument {
    readonly identifier: ParsedToken | undefined,
    readonly assign: NodeAssign
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
export interface NodeAssign extends NodesBase {
    readonly nodeName: NodeName.Assign;
    readonly condition: NodeCondition;
    readonly tail: ParsedAssignTail | undefined;
}

export interface ParsedAssignTail {
    readonly operator: ParsedToken,
    readonly assign: NodeAssign
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
export interface NodeCondition extends NodesBase {
    readonly nodeName: NodeName.Condition
    readonly expr: NodeExpr,
    readonly ternary: ParsedTernary | undefined
}

export interface ParsedTernary {
    readonly trueAssign: NodeAssign,
    readonly falseAssign: NodeAssign
}

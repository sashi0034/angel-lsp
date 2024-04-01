import {LocationInfo, TokenReserved} from "./tokens";
import {ParsingToken} from "./parsingToken";

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
    start: ParsingToken;
    end: ParsingToken;
}

export function getNextTokenIfExist(token: ParsingToken): ParsingToken {
    if (token.next !== undefined) return token.next;
    return token;
}

export function getRangedLocation(start: ParsingToken, end: ParsingToken): LocationInfo {
    return {
        path: start.location.path,
        start: start.location.start,
        end: end.location.end
    };
}

export function getNodeLocation(range: ParsedRange): LocationInfo {
    return getRangedLocation(range.start, range.end);
}

export interface EntityAttribute {
    isShared: boolean,
    isExternal: boolean,
    isAbstract: boolean,
    isFinal: boolean,
}

export function setEntityAttribute(attribute: EntityAttribute, token: 'shared' | 'external' | 'abstract' | 'final') {
    if (token === 'shared') attribute.isShared = true;
    else if (token === 'external') attribute.isExternal = true;
    else if (token === 'abstract') attribute.isAbstract = true;
    else if (token === 'final') attribute.isFinal = true;
}

export function isEntityModifierForClass(modifier: EntityAttribute) {
    return modifier.isAbstract || modifier.isFinal;
}

export interface FunctionAttribute {
    isOverride: boolean,
    isFinal: boolean,
    isExplicit: boolean,
    isProperty: boolean
}

export function setFunctionAttribute(attribute: FunctionAttribute, token: 'override' | 'final' | 'explicit' | 'property') {
    if (token === 'override') attribute.isOverride = true;
    else if (token === 'final') attribute.isFinal = true;
    else if (token === 'explicit') attribute.isExplicit = true;
    else if (token === 'property') attribute.isProperty = true;
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
    nodeName: NodeName;
    nodeRange: ParsedRange;
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
    namespaceList: ParsingToken[],
    script: NodeScript
}

// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
export interface NodeEnum extends NodesBase {
    nodeName: NodeName.Enum;
    scopeRange: ParsedRange;
    entity: EntityAttribute | undefined;
    identifier: ParsingToken;
    memberList: ParsedEnumMember[];
}

export interface ParsedEnumMember {
    identifier: ParsingToken,
    expr: NodeExpr | undefined
}

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
export interface NodeClass extends NodesBase {
    nodeName: NodeName.Class;
    scopeRange: ParsedRange;
    entity: EntityAttribute | undefined;
    identifier: ParsingToken;
    typeTemplates: NodeType[] | undefined;
    baseList: ParsingToken[];
    memberList: (NodeVirtualProp | NodeVar | NodeFunc | NodeFuncDef)[];
}

// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'
export interface NodeTypeDef extends NodesBase {
    nodeName: NodeName.TypeDef;
    type: TokenReserved;
    identifier: ParsingToken;
}

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
export interface NodeFunc extends NodesBase {
    nodeName: NodeName.Func;
    entity: EntityAttribute | undefined;
    accessor: AccessModifier | undefined;
    head: FuncHeads;
    identifier: ParsingToken;
    paramList: NodeParamList;
    isConst: boolean;
    funcAttr: FunctionAttribute | undefined;
    statBlock: NodeStatBlock;
}

export interface FuncHeadReturns {
    returnType: NodeType;
    isRef: boolean;
}

export const funcHeadDestructor = Symbol();
export type FuncHeadDestructor = typeof funcHeadDestructor;

export const funcHeadConstructor = Symbol();
export type FuncHeadConstructor = typeof funcHeadConstructor;

export type FuncHeads = FuncHeadReturns | FuncHeadDestructor | FuncHeadConstructor;

export function isFunctionHeadReturns(head: FuncHeads): head is FuncHeadReturns {
    return head !== funcHeadDestructor && head !== funcHeadConstructor;
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))
export interface NodeInterface extends NodesBase {
    nodeName: NodeName.Interface;
    entity: EntityAttribute | undefined;
    identifier: ParsingToken;
    baseList: ParsingToken[];
    memberList: (NodeVirtualProp | NodeIntfMethod)[];
}

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST]} ';'
export interface NodeVar extends NodesBase {
    nodeName: NodeName.Var
    accessor: AccessModifier | undefined,
    type: NodeType,
    variables: ParsedVariableInit[];
}

export interface ParsedVariableInit {
    identifier: ParsingToken;
    initializer: NodeInitList | NodeExpr | NodeArgList | undefined;
}

// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
export interface NodeImport extends NodesBase {
    nodeName: NodeName.Import;
    type: NodeType;
    isRef: boolean;
    identifier: ParsingToken;
    paramList: NodeParamList;
    funcAttr: FunctionAttribute | undefined;
    path: ParsingToken;
}

// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
export interface NodeFuncDef extends NodesBase {
    nodeName: NodeName.FuncDef;
    entity: EntityAttribute | undefined;
    returnType: NodeType;
    isRef: boolean;
    identifier: ParsingToken;
    paramList: NodeParamList;
}

// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
export interface NodeVirtualProp extends NodesBase {
    nodeName: NodeName.VirtualProp
    accessor: AccessModifier | undefined,
    type: NodeType,
    isRef: boolean,
    identifier: ParsingToken,
    getter: ParsedGetterSetter | undefined,
    setter: ParsedGetterSetter | undefined
}

export interface ParsedGetterSetter {
    isConst: boolean,
    funcAttr: FunctionAttribute | undefined,
    statBlock: NodeStatBlock | undefined
}

// MIXIN         ::= 'mixin' CLASS
export interface NodeMixin extends NodesBase {
    nodeName: NodeName.Mixin;
    mixinClass: NodeClass;
}

// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'
export interface NodeIntfMethod extends NodesBase {
    nodeName: NodeName.IntfMethod;
    returnType: NodeType;
    isRef: boolean;
    identifier: ParsingToken;
    paramList: NodeParamList;
    isConst: boolean;
}

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
export interface NodeStatBlock extends NodesBase {
    nodeName: NodeName.StatBlock;
    statementList: (NodeVar | NodeStatement)[];
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
export type NodeParamList = ParsedTypeIdentifier[];

export interface ParsedTypeIdentifier {
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
    dataType: NodeDataType,
    typeTemplates: NodeType[],
    isArray: boolean,
    refModifier: ReferenceModifier | undefined,
}

export function stringifyNodeType(type: NodeType): string {
    let str = type.isConst ? 'const ' : '';
    str += type.dataType.identifier.text;
    if (type.typeTemplates.length > 0) {
        str += '<' + type.typeTemplates.map(stringifyNodeType).join(', ') + '>';
    }
    if (type.isArray) {
        str += '[]';
    }
    if (type.refModifier !== undefined) {
        str += (type.refModifier === ReferenceModifier.AtConst ? '@const' : '@');
    }
    return str;
}

export function getIdentifierInType(type: NodeType): ParsingToken {
    return type.dataType.identifier;
}

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
export interface NodeInitList extends NodesBase {
    nodeName: NodeName.InitList;
    initList: (NodeAssign | NodeInitList)[];
}

// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
export interface NodeScope extends NodesBase {
    nodeName: NodeName.Scope
    isGlobal: boolean,
    scopeList: ParsingToken[],
    typeTemplates: NodeType[]
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
    | NodeExprStat
    | NodeTry;

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
export interface NodeSwitch extends NodesBase {
    nodeName: NodeName.Switch
    assign: NodeAssign,
    cases: NodeCase[]
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
    thenStat: NodeStatement,
    elseStat: NodeStatement | undefined
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
export interface NodeTry extends NodesBase {
    nodeName: NodeName.Try;
    tryBlock: NodeStatBlock,
    catchBlock: NodeStatBlock | undefined
}

// RETURN        ::= 'return' [ASSIGN] ';'
export interface NodeReturn extends NodesBase {
    nodeName: NodeName.Return;
    assign: NodeAssign;
}

// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
export interface NodeCase extends NodesBase {
    nodeName: NodeName.Case
    expr: NodeExpr | undefined,
    statementList: NodeStatement[]
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
export interface NodeExpr extends NodesBase {
    nodeName: NodeName.Expr
    head: NodeExprTerm,
    tail: ParsedOpExpr | undefined
}

export interface ParsedOpExpr {
    operator: ParsingToken,
    expression: NodeExpr
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export type NodeExprTerm = NodeExprTerm1 | NodeExprTerm2;

// ([TYPE '='] INITLIST)
export interface NodeExprTerm1 extends NodesBase {
    nodeName: NodeName.ExprTerm
    exprTerm: 1
    type: NodeType | undefined,
    initList: NodeInitList
}

// ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export interface NodeExprTerm2 extends NodesBase {
    nodeName: NodeName.ExprTerm
    exprTerm: 2,
    preOps: ParsingToken[],
    value: NodeExprValue,
    postOps: NodeExprPostOp[]
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

export function isMethodMemberInPostOp(member: NodeFuncCall | ParsingToken | undefined): member is NodeFuncCall {
    return member !== undefined && 'nodeName' in member;
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
export interface NodeExprPostOp2 extends NodesBase {
    nodeName: NodeName.ExprPostOp;
    postOp: 2;
    indexerList: ParsedPostIndexer[];
}

export interface ParsedPostIndexer {
    identifier: ParsingToken | undefined,
    assign: NodeAssign
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
    paramList: ParsedLambdaParams[],
    statBlock: NodeStatBlock
}

export interface ParsedLambdaParams {
    type: NodeType | undefined,
    typeMod: TypeModifier | undefined,
    identifier: ParsingToken | undefined
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
    argList: ParsedArgument[];
}

export interface ParsedArgument {
    identifier: ParsingToken | undefined,
    assign: NodeAssign
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
export interface NodeAssign extends NodesBase {
    nodeName: NodeName.Assign;
    condition: NodeCondition;
    tail: ParsedAssignTail | undefined;
}

export interface ParsedAssignTail {
    op: ParsingToken,
    assign: NodeAssign
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
export interface NodeCondition extends NodesBase {
    nodeName: NodeName.Condition
    expr: NodeExpr,
    ternary: ParsedTernary | undefined
}

export interface ParsedTernary {
    trueAssign: NodeAssign,
    falseAssign: NodeAssign
}

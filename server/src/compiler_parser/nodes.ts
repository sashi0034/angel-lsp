import {TokenObject, TokenReserved} from "../compiler_tokenizer/tokenObject";
import {TokenRange} from "../compiler_tokenizer/tokenRange";

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
    readonly isProperty: boolean,
    readonly isDeleted: boolean,
    readonly isNoDiscard: boolean
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
    ForEach = 'ForEach',
    ForEachVar = 'ForEachVar',
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
    ExprVoid = 'ExprVoid',
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
    ListPattern = 'ListPattern'
}

export interface NodesBase {
    readonly nodeName: NodeName;
    readonly nodeRange: TokenRange;
}

// BNF: SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
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

// BNF: NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
export interface NodeNamespace extends NodesBase {
    readonly nodeName: NodeName.Namespace
    readonly namespaceList: TokenObject[],
    readonly script: NodeScript
}

// BNF: ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER [ ':' ('int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64') ] (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
export interface NodeEnum extends NodesBase {
    readonly nodeName: NodeName.Enum;
    readonly scopeRange: TokenRange;
    readonly entity: EntityAttribute | undefined;
    readonly identifier: TokenObject;
    readonly memberList: ParsedEnumMember[];
    readonly enumType: TokenReserved;
}

export interface ParsedEnumMember {
    readonly identifier: TokenObject,
    readonly expr: NodeExpr | undefined
}

// BNF: CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
export interface NodeClass extends NodesBase {
    readonly nodeName: NodeName.Class;
    readonly scopeRange: TokenRange;
    readonly metadata: TokenObject[][];
    readonly entity: EntityAttribute | undefined;
    readonly identifier: TokenObject;
    readonly typeTemplates: NodeType[] | undefined;
    readonly baseList: TokenObject[];
    readonly memberList: (NodeVirtualProp | NodeVar | NodeFunc | NodeFuncDef)[];
}

// BNF: TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'
export interface NodeTypeDef extends NodesBase {
    readonly nodeName: NodeName.TypeDef;
    readonly type: TokenObject;
    readonly identifier: TokenObject;
}

// BNF: FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
export interface NodeFunc extends NodesBase {
    readonly nodeName: NodeName.Func;
    readonly entity: EntityAttribute | undefined;
    readonly accessor: AccessModifier | undefined;
    readonly head: FuncHead;
    readonly identifier: TokenObject;
    readonly paramList: NodeParamList;
    readonly isConst: boolean;
    readonly funcAttr: FunctionAttribute | undefined;
    readonly statBlock: NodeStatBlock;
    readonly typeTemplates: NodeType[];
    readonly listPattern: NodeListPattern | undefined
}

export interface FuncHeadReturnValue {
    readonly returnType: NodeType;
    readonly isRef: boolean;
}

export const funcHeadDestructor = Symbol();
export type FuncHeadDestructor = typeof funcHeadDestructor;

export const funcHeadConstructor = Symbol();
export type FuncHeadConstructor = typeof funcHeadConstructor;

export type FuncHead = FuncHeadReturnValue | FuncHeadDestructor | FuncHeadConstructor;

export function isFuncHeadReturnValue(head: FuncHead): head is FuncHeadReturnValue {
    return head !== funcHeadDestructor && head !== funcHeadConstructor;
}

// BNF: INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))
export interface NodeInterface extends NodesBase {
    readonly nodeName: NodeName.Interface;
    readonly entity: EntityAttribute | undefined;
    readonly identifier: TokenObject;
    readonly baseList: TokenObject[];
    readonly memberList: (NodeVirtualProp | NodeIntfMethod)[];
}

// BNF: VAR           ::= ['private' | 'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
export interface NodeVar extends NodesBase {
    readonly nodeName: NodeName.Var
    readonly accessor: AccessModifier | undefined,
    readonly type: NodeType,
    readonly variables: ParsedVariableInit[];
}

export interface ParsedVariableInit {
    readonly identifier: TokenObject;
    readonly initializer: NodeInitList | NodeAssign | NodeArgList | undefined;
}

// BNF: IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
export interface NodeImport extends NodesBase {
    readonly nodeName: NodeName.Import;
    readonly type: NodeType;
    readonly isRef: boolean;
    readonly identifier: TokenObject;
    readonly paramList: NodeParamList;
    readonly funcAttr: FunctionAttribute | undefined;
    readonly path: TokenObject;
}

// BNF: FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
export interface NodeFuncDef extends NodesBase {
    readonly nodeName: NodeName.FuncDef;
    readonly entity: EntityAttribute | undefined;
    readonly returnType: NodeType;
    readonly isRef: boolean;
    readonly identifier: TokenObject;
    readonly paramList: NodeParamList;
}

// BNF: VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
export interface NodeVirtualProp extends NodesBase {
    readonly nodeName: NodeName.VirtualProp
    readonly accessor: AccessModifier | undefined,
    readonly type: NodeType,
    readonly isRef: boolean,
    readonly identifier: TokenObject,
    readonly getter: ParsedGetterSetter | undefined,
    readonly setter: ParsedGetterSetter | undefined
}

export interface ParsedGetterSetter {
    readonly isConst: boolean,
    readonly funcAttr: FunctionAttribute | undefined,
    readonly statBlock: NodeStatBlock | undefined
}

// BNF: MIXIN         ::= 'mixin' CLASS
export interface NodeMixin extends NodesBase {
    readonly nodeName: NodeName.Mixin;
    readonly mixinClass: NodeClass;
}

// BNF: INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'
export interface NodeIntfMethod extends NodesBase {
    readonly nodeName: NodeName.IntfMethod;
    readonly returnType: NodeType;
    readonly isRef: boolean;
    readonly identifier: TokenObject;
    readonly paramList: NodeParamList;
    readonly isConst: boolean;
}

// BNF: STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
export interface NodeStatBlock extends NodesBase {
    readonly nodeName: NodeName.StatBlock;
    readonly statementList: (NodeVar | NodeStatement)[];
}

export enum NodeListOp {
    StartList = 'StartList',
    EndList = 'EndList',
    Repeat = 'Repeat',
    RepeatSame = 'RepeatSame',
    Type = 'Type'
}

export interface NodeListOperator {
    readonly operator: NodeListOp
}

export interface NodeListOperatorStartList extends NodeListOperator {
    readonly operator: NodeListOp.StartList
}

export interface NodeListOperatorEndList extends NodeListOperator {
    readonly operator: NodeListOp.EndList
}

export interface NodeListOperatorRepeat extends NodeListOperator {
    readonly operator: NodeListOp.Repeat
}

export interface NodeListOperatorRepeatSame extends NodeListOperator {
    readonly operator: NodeListOp.RepeatSame
}

export interface NodeListOperatorType extends NodeListOperator {
    readonly operator: NodeListOp.Type,
    readonly type: NodeType
}

export type NodeListValidOperators = NodeListOperatorType | NodeListOperatorRepeatSame | NodeListOperatorRepeat | NodeListOperatorEndList | NodeListOperatorStartList;

// BNF: LISTENTRY     ::= (['repeat' | 'repeat_same'] (('{' LISTENTRY '}') | TYPE)) | TYPE {',' TYPE}
// BNF: LISTPATTERN   ::= '{' LISTENTRY {',' LISTENTRY} '}'
export interface NodeListPattern extends NodesBase {
    readonly nodeName: NodeName.ListPattern;
    readonly operators: NodeListValidOperators[]
}

// BNF: PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' [EXPR | 'void']] {',' TYPE TYPEMOD [IDENTIFIER] ['...' | ('=' [EXPR | 'void']])})] ')'
export type NodeParamList = ParsedTypeIdentifier[];

export interface ParsedTypeIdentifier {
    readonly type: NodeType,
    readonly modifier: TypeModifier | undefined,
    readonly identifier: TokenObject | undefined
    readonly defaultExpr: NodeExpr | NodeExprVoid | undefined
    readonly isVariadic: boolean
}

// BNF: TYPEMOD       ::= ['&' ['in' | 'out' | 'inout'] ['+'] ['if_handle_then_const']]

// BNF: TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
export interface NodeType extends NodesBase {
    readonly nodeName: NodeName.Type
    readonly isConst: boolean,
    readonly scope: NodeScope | undefined,
    readonly dataType: NodeDataType,
    readonly typeTemplates: NodeType[],
    readonly isArray: boolean,
    readonly refModifier: ReferenceModifier | undefined,
}

// BNF: INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
export interface NodeInitList extends NodesBase {
    readonly nodeName: NodeName.InitList;
    readonly initList: (NodeAssign | NodeInitList)[];
}

// BNF: SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
export interface NodeScope extends NodesBase {
    readonly nodeName: NodeName.Scope
    readonly isGlobal: boolean,
    readonly scopeList: TokenObject[],
    readonly typeTemplates: NodeType[]
}

// BNF: DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
export interface NodeDataType extends NodesBase {
    readonly nodeName: NodeName.DataType;
    readonly identifier: TokenObject;
}

// BNF: PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'

// BNF: FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property' | 'delete' | 'nodiscard'}

// BNF: STATEMENT     ::= (IF | FOR | FOREACH | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
export type NodeStatement =
    NodeIf
    | NodeFor
    | NodeForEach
    | NodeWhile
    | NodeReturn
    | NodeStatBlock
    | NodeBreak
    | NodeContinue
    | NodeDoWhile
    | NodeSwitch
    | NodeExprStat
    | NodeTry;

// BNF: SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
export interface NodeSwitch extends NodesBase {
    readonly nodeName: NodeName.Switch
    readonly assign: NodeAssign,
    readonly caseList: NodeCase[]
}

// BNF: BREAK         ::= 'break' ';'
export interface NodeBreak extends NodesBase {
    readonly nodeName: NodeName.Break;
}

// BNF: FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
export interface NodeFor extends NodesBase {
    readonly nodeName: NodeName.For
    readonly initial: NodeVar | NodeExprStat,
    readonly condition: NodeExprStat | undefined
    readonly incrementList: NodeAssign[],
    readonly statement: NodeStatement | undefined
}

// like NodeVar but no initializer or modifier
export interface NodeForEachVar extends NodesBase {
    readonly nodeName: NodeName.ForEachVar
    readonly type: NodeType,
    readonly identifier: TokenObject;
}

// FOREACH       ::= 'foreach' '(' TYPE IDENTIFIER {',' TYPE INDENTIFIER} ':' ASSIGN ')' STATEMENT
export interface NodeForEach extends NodesBase {
    readonly nodeName: NodeName.ForEach
    readonly variables: NodeForEachVar[],
    readonly assign: NodeAssign | undefined,
    readonly statement: NodeStatement | undefined
}

// BNF: WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
export interface NodeWhile extends NodesBase {
    readonly nodeName: NodeName.While
    readonly assign: NodeAssign,
    readonly statement: NodeStatement | undefined
}

// BNF: DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
export interface NodeDoWhile extends NodesBase {
    readonly nodeName: NodeName.DoWhile
    readonly statement: NodeStatement,
    readonly assign: NodeAssign | undefined
}

// BNF: IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
export interface NodeIf extends NodesBase {
    readonly nodeName: NodeName.If
    readonly condition: NodeAssign,
    readonly thenStat: NodeStatement | undefined,
    readonly elseStat: NodeStatement | undefined
}

// BNF: CONTINUE      ::= 'continue' ';'
export interface NodeContinue extends NodesBase {
    readonly nodeName: NodeName.Continue;
}

// BNF: EXPRSTAT      ::= [ASSIGN] ';'
export interface NodeExprStat extends NodesBase {
    readonly nodeName: NodeName.ExprStat,
    readonly assign: NodeAssign | undefined
}

// BNF: TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK
export interface NodeTry extends NodesBase {
    readonly nodeName: NodeName.Try;
    readonly tryBlock: NodeStatBlock,
    readonly catchBlock: NodeStatBlock | undefined
}

// BNF: RETURN        ::= 'return' [ASSIGN] ';'
export interface NodeReturn extends NodesBase {
    readonly nodeName: NodeName.Return;
    readonly assign: NodeAssign | undefined;
}

// BNF: CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
export interface NodeCase extends NodesBase {
    readonly nodeName: NodeName.Case
    readonly expr: NodeExpr | undefined,
    readonly statementList: NodeStatement[]
}

// BNF: EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
export interface NodeExpr extends NodesBase {
    readonly nodeName: NodeName.Expr
    readonly head: NodeExprTerm,
    readonly tail: ParsedOpExpr | undefined
}

// EXPRVOID      ::= 'void'
export interface NodeExprVoid extends NodesBase {
    readonly nodeName: NodeName.ExprVoid
}

export interface ParsedOpExpr {
    readonly operator: TokenObject,
    readonly expression: NodeExpr
}

// BNF: EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
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
    readonly preOps: TokenObject[],
    readonly value: NodeExprValue,
    readonly postOps: NodeExprPostOp[]
}

// BNF: EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
export type NodeExprValue =
    NodeConstructCall
    | NodeFuncCall
    | NodeVarAccess
    | NodeCast
    | NodeLiteral
    | NodeAssign
    | NodeLambda;

// BNF: CONSTRUCTCALL ::= TYPE ARGLIST
export interface NodeConstructCall extends NodesBase {
    readonly nodeName: NodeName.ConstructCall;
    readonly type: NodeType;
    readonly argList: NodeArgList;
}

// BNF: EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// BNF: EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']') | ARGLIST | '++' | '--'
export type NodeExprPostOp = NodeExprPostOp1 | NodeExprPostOp2 | NodeExprPostOp3 | NodeExprPostOp4;

// ('.' (FUNCCALL | IDENTIFIER))
export interface NodeExprPostOp1 extends NodesBase {
    readonly nodeName: NodeName.ExprPostOp;
    readonly postOp: 1;
    readonly member: NodeFuncCall | TokenObject | undefined;
}

export function isMemberMethodInPostOp(member: NodeFuncCall | TokenObject | undefined): member is NodeFuncCall {
    return member !== undefined && 'nodeName' in member;
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
export interface NodeExprPostOp2 extends NodesBase {
    readonly nodeName: NodeName.ExprPostOp;
    readonly postOp: 2;
    readonly indexingList: ParsedPostIndexing[];
}

export interface ParsedPostIndexing {
    readonly identifier: TokenObject | undefined,
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

// BNF: CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
export interface NodeCast extends NodesBase {
    readonly nodeName: NodeName.Cast;
    readonly type: NodeType;
    readonly assign: NodeAssign;
}

// BNF: LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
export interface NodeLambda extends NodesBase {
    readonly nodeName: NodeName.Lambda;
    readonly paramList: ParsedLambdaParams[],
    readonly statBlock: NodeStatBlock | undefined
}

export interface ParsedLambdaParams {
    readonly type: NodeType | undefined,
    readonly typeMod: TypeModifier | undefined,
    readonly identifier: TokenObject | undefined
}

// BNF: LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
export interface NodeLiteral extends NodesBase {
    readonly nodeName: NodeName.Literal;
    readonly value: TokenObject;
}

// BNF: FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
export interface NodeFuncCall extends NodesBase {
    readonly nodeName: NodeName.FuncCall
    readonly scope: NodeScope | undefined,
    readonly identifier: TokenObject,
    readonly argList: NodeArgList,
    readonly typeTemplates: NodeType[] | undefined;
}

// BNF: VARACCESS     ::= SCOPE IDENTIFIER
export interface NodeVarAccess extends NodesBase {
    readonly nodeName: NodeName.VarAccess;
    readonly scope: NodeScope | undefined;
    readonly identifier: TokenObject | undefined;
}

// BNF: ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
export interface NodeArgList extends NodesBase {
    readonly nodeName: NodeName.ArgList;
    readonly argList: ParsedArgument[];
}

export interface ParsedArgument {
    readonly identifier: TokenObject | undefined,
    readonly assign: NodeAssign
}

// BNF: ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
export interface NodeAssign extends NodesBase {
    readonly nodeName: NodeName.Assign;
    readonly condition: NodeCondition;
    readonly tail: ParsedAssignTail | undefined;
}

export interface ParsedAssignTail {
    readonly operator: TokenObject,
    readonly assign: NodeAssign
}

// BNF: CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
export interface NodeCondition extends NodesBase {
    readonly nodeName: NodeName.Condition
    readonly expr: NodeExpr,
    readonly ternary: ParsedTernary | undefined
}

export interface ParsedTernary {
    readonly trueAssign: NodeAssign,
    readonly falseAssign: NodeAssign
}

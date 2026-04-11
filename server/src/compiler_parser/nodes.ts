import {TokenObject, ReservedToken} from '../compiler_tokenizer/tokenObject';
import {TokenRange} from '../compiler_tokenizer/tokenRange';

export enum AccessModifier {
    Private = 'Private',
    Protected = 'Protected'
}

export enum TypeModifier {
    In = 'In',
    Out = 'Out',
    InOut = 'InOut'
}

export enum ReferenceModifier {
    At = 'At',
    AtConst = 'AtConst'
}

export interface EntityAttribute {
    readonly isShared: boolean;
    readonly isExternal: boolean;
    readonly isAbstract: boolean;
    readonly isFinal: boolean;
}

export interface FunctionAttribute {
    readonly isOverride: boolean;
    readonly isFinal: boolean;
    readonly isExplicit: boolean;
    readonly isProperty: boolean;
    readonly isDeleted: boolean;
    readonly isNoDiscard: boolean;
}

export enum NodeName {
    NodeName = 'NodeName',
    Using = 'Using',
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
    InterfaceMethod = 'InterfaceMethod',
    StatBlock = 'StatBlock',
    ParamList = 'ParamList',
    TypeModifier = 'TypeModifier',
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

export interface NodeBase {
    readonly nodeName: NodeName;
    readonly nodeRange: TokenRange;
}

// **BNF**: SCRIPT ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTUALPROP | VAR | FUNC | NAMESPACE | USING | ';'}
export type Node_Script = ScriptElement[];

export type ScriptElement =
    | Node_Import
    | Node_Enum
    | Node_TypeDef
    | Node_Class
    | Node_Mixin
    | Node_Interface
    | Node_FuncDef
    | Node_VirtualProp
    | Node_Var
    | Node_Func
    | Node_Namespace
    | Node_Using;

// **BNF**: USING ::= 'using' 'namespace' IDENTIFIER ('::' IDENTIFIER)* ';'
export interface Node_Using extends NodeBase {
    readonly nodeName: NodeName.Using;
    readonly namespaceList: TokenObject[];
}

// **BNF**: NAMESPACE ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
export interface Node_Namespace extends NodeBase {
    readonly nodeName: NodeName.Namespace;
    readonly namespaceList: TokenObject[];
    readonly script: Node_Script;
}

// **BNF**: ENUM ::= {'shared' | 'external'} 'enum' IDENTIFIER [ ':' ('int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64') ] (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
export interface Node_Enum extends NodeBase {
    readonly nodeName: NodeName.Enum;
    readonly scopeRange: TokenRange;
    readonly metadata: TokenObject[][];
    readonly entity: EntityAttribute | undefined;
    readonly identifier: TokenObject;
    readonly memberList: IdentifierAndOptionalExpr[];
    readonly enumType: ReservedToken | undefined;
}

export interface IdentifierAndOptionalExpr {
    readonly identifier: TokenObject;
    readonly expr: Node_Expr | undefined;
}

// **BNF**: CLASS ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTUALPROP | FUNC | VAR | FUNCDEF} '}'))
export interface Node_Class extends NodeBase {
    readonly nodeName: NodeName.Class;
    readonly scopeRange: TokenRange;
    readonly metadata: TokenObject[][];
    readonly entity: EntityAttribute | undefined;
    readonly identifier: TokenObject;
    readonly typeTemplates: Node_Type[] | undefined;
    readonly baseList: ClassBasePart[];
    readonly memberList: (Node_VirtualProp | Node_Var | Node_Func | Node_FuncDef)[];
}

export interface ClassBasePart {
    readonly scope: Node_Scope | undefined;
    readonly identifier: TokenObject | undefined;
}

// **BNF**: TYPEDEF ::= 'typedef' PRIMTYPE IDENTIFIER ';'
export interface Node_TypeDef extends NodeBase {
    readonly nodeName: NodeName.TypeDef;
    readonly type: TokenObject;
    readonly identifier: TokenObject;
}

// **BNF**: LISTENTRY ::= (('repeat' | 'repeat_same') (('{' LISTENTRY '}') | TYPE)) | (TYPE {',' TYPE})
// TODO: IMPLEMENT IT!

// **BNF**: LISTPATTERN ::= '{' LISTENTRY {',' LISTENTRY} '}'
// TODO: IMPLEMENT IT!

// **BNF**: FUNC ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST [LISTPATTERN] ['const'] FUNCATTR (';' | STATBLOCK)
export interface Node_Func extends NodeBase {
    readonly nodeName: NodeName.Func;
    readonly entity: EntityAttribute | undefined;
    readonly accessor: AccessModifier | undefined;
    readonly head: FuncHead;
    readonly identifier: TokenObject;
    readonly paramList: Node_ParamList;
    readonly isConst: boolean;
    readonly funcAttr: FunctionAttribute | undefined;
    readonly statBlock: Node_StatBlock;
    readonly typeTemplates: Node_Type[];
    readonly listPattern: Node_ListPattern | undefined;
}

export interface FuncReturnValue {
    readonly returnType: Node_Type;
    readonly isRef: boolean;
}

export const destructorFuncHead = Symbol();
export type DestructorFuncHead = typeof destructorFuncHead;

export const constructorFuncHead = Symbol();
export type ConstructorFuncHead = typeof constructorFuncHead;

export type FuncHead = FuncReturnValue | DestructorFuncHead | ConstructorFuncHead;

export function isConstructorFunc(head: FuncHead): head is ConstructorFuncHead {
    return head === constructorFuncHead;
}

export function isDestructorFunc(head: FuncHead): head is DestructorFuncHead {
    return head === destructorFuncHead;
}

export function hasFuncReturnValue(head: FuncHead): head is FuncReturnValue {
    return head !== destructorFuncHead && head !== constructorFuncHead;
}

// **BNF**: INTERFACE ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTUALPROP | INTERFACEMETHOD} '}'))
export interface Node_Interface extends NodeBase {
    readonly nodeName: NodeName.Interface;
    readonly entity: EntityAttribute | undefined;
    readonly identifier: TokenObject;
    readonly baseList: ClassBasePart[];
    readonly memberList: (Node_VirtualProp | Node_InterfaceMethod)[];
}

// **BNF**: VAR ::= ['private' | 'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
export interface Node_Var extends NodeBase {
    readonly nodeName: NodeName.Var;
    readonly accessor: AccessModifier | undefined;
    readonly type: Node_Type;
    readonly variables: IdentifierAndInitializer[];
}

// IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]}
export interface IdentifierAndInitializer {
    readonly identifier: TokenObject;
    readonly initializer: Node_InitList | Node_Assign | Node_ArgList | undefined;
}

// **BNF**: IMPORT ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
export interface Node_Import extends NodeBase {
    readonly nodeName: NodeName.Import;
    readonly type: Node_Type;
    readonly isRef: boolean;
    readonly identifier: TokenObject;
    readonly paramList: Node_ParamList;
    readonly funcAttr: FunctionAttribute | undefined;
    readonly path: TokenObject;
}

// **BNF**: FUNCDEF ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
export interface Node_FuncDef extends NodeBase {
    readonly nodeName: NodeName.FuncDef;
    readonly entity: EntityAttribute | undefined;
    readonly returnType: Node_Type;
    readonly isRef: boolean;
    readonly identifier: TokenObject;
    readonly paramList: Node_ParamList;
}

// **BNF**: VIRTUALPROP ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
export interface Node_VirtualProp extends NodeBase {
    readonly nodeName: NodeName.VirtualProp;
    readonly accessor: AccessModifier | undefined;
    readonly type: Node_Type;
    readonly isRef: boolean;
    readonly identifier: TokenObject;
    readonly getter: GetterOrSetter | undefined;
    readonly setter: GetterOrSetter | undefined;
}

export interface GetterOrSetter {
    readonly isConst: boolean;
    readonly funcAttr: FunctionAttribute | undefined;
    readonly statBlock: Node_StatBlock | undefined;
}

// **BNF**: MIXIN ::= 'mixin' CLASS
export interface Node_Mixin extends NodeBase {
    readonly nodeName: NodeName.Mixin;
    readonly mixinClass: Node_Class;
}

// **BNF**: INTERFACEMETHOD ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] FUNCATTR ';'
export interface Node_InterfaceMethod extends NodeBase {
    readonly nodeName: NodeName.InterfaceMethod;
    readonly returnType: Node_Type;
    readonly isRef: boolean;
    readonly identifier: TokenObject;
    readonly paramList: Node_ParamList;
    readonly isConst: boolean;
    readonly funcAttr: FunctionAttribute | undefined;
}

// **BNF**: STATBLOCK ::= '{' {VAR | STATEMENT | USING} '}'
export interface Node_StatBlock extends NodeBase {
    readonly nodeName: NodeName.StatBlock;
    readonly statementList: (Node_Var | Node_Statement | Node_Using)[];
}

export enum NodeListOp {
    StartList = 'StartList',
    EndList = 'EndList',
    Repeat = 'Repeat',
    RepeatSame = 'RepeatSame',
    Type = 'Type'
}

export interface NodeListOperator {
    readonly operator: NodeListOp;
}

export interface NodeListOperatorStartList extends NodeListOperator {
    readonly operator: NodeListOp.StartList;
}

export interface NodeListOperatorEndList extends NodeListOperator {
    readonly operator: NodeListOp.EndList;
}

export interface NodeListOperatorRepeat extends NodeListOperator {
    readonly operator: NodeListOp.Repeat;
}

export interface NodeListOperatorRepeatSame extends NodeListOperator {
    readonly operator: NodeListOp.RepeatSame;
}

export interface NodeListOperatorType extends NodeListOperator {
    readonly operator: NodeListOp.Type;
    readonly type: Node_Type;
}

export type NodeListValidOperators =
    | NodeListOperatorType
    | NodeListOperatorRepeatSame
    | NodeListOperatorRepeat
    | NodeListOperatorEndList
    | NodeListOperatorStartList;

// **BNF**: LISTENTRY ::= (('repeat' | 'repeat_same') (('{' LISTENTRY '}') | TYPE)) | (TYPE {',' TYPE})
// **BNF**: LISTPATTERN ::= '{' LISTENTRY {',' LISTENTRY} '}'
export interface Node_ListPattern extends NodeBase {
    readonly nodeName: NodeName.ListPattern;
    readonly operators: NodeListValidOperators[];
}

// **BNF**: FUNC ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST [LISTPATTERN] ['const'] FUNCATTR (';' | STATBLOCK)
// TODO: IMPLEMENT IT!

// **BNF**: INTERFACE ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTUALPROP | INTERFACEMETHOD} '}'))
// TODO: IMPLEMENT IT!

// **BNF**: VAR ::= ['private' | 'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
// TODO: IMPLEMENT IT!

// **BNF**: IMPORT ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
// TODO: IMPLEMENT IT!

// **BNF**: FUNCDEF ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
// TODO: IMPLEMENT IT!

// **BNF**: VIRTUALPROP ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
// TODO: IMPLEMENT IT!

// **BNF**: MIXIN ::= 'mixin' CLASS
// TODO: IMPLEMENT IT!

// **BNF**: INTERFACEMETHOD ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] FUNCATTR ';'
// TODO: IMPLEMENT IT!

// **BNF**: STATBLOCK ::= '{' {VAR | STATEMENT | USING} '}'
// TODO: IMPLEMENT IT!

// **BNF**: PARAMLIST ::= '(' ['void' | (TYPE TYPEMODIFIER [IDENTIFIER] ['=' [EXPR | 'void']] {',' TYPE TYPEMODIFIER [IDENTIFIER] ['...' | ('=' [EXPR | 'void'])]})] ')'
export type Node_ParamList = ElementInParamList[];

export interface ElementInParamList {
    readonly type: Node_Type;
    readonly modifier: TypeModifier | undefined;
    readonly identifier: TokenObject | undefined;
    readonly defaultExpr: Node_Expr | Node_ExprVoid | undefined;
    readonly isVariadic: boolean;
}

// **BNF**: TYPEMODIFIER ::= ['&' ['in' | 'out' | 'inout'] ['+'] ['if_handle_then_const']]

// **BNF**: TYPE ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
export interface Node_Type extends NodeBase {
    readonly nodeName: NodeName.Type;
    readonly isConst: boolean;
    readonly scope: Node_Scope | undefined;
    readonly dataType: Node_DataType;
    readonly typeTemplates: Node_Type[];
    readonly isArray: boolean;
    readonly refModifier: ReferenceModifier | undefined;
}

// **BNF**: INITLIST ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
export interface Node_InitList extends NodeBase {
    readonly nodeName: NodeName.InitList;
    readonly initList: (Node_Assign | Node_InitList)[];
}

// **BNF**: SCOPE ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
export interface Node_Scope extends NodeBase {
    readonly nodeName: NodeName.Scope;
    readonly isGlobal: boolean;
    readonly scopeList: TokenObject[];
    readonly typeTemplates: Node_Type[];
}

// **BNF**: DATATYPE ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
export interface Node_DataType extends NodeBase {
    readonly nodeName: NodeName.DataType;
    readonly identifier: TokenObject;
}

// **BNF**: PRIMTYPE ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'

// **BNF**: FUNCATTR ::= {'override' | 'final' | 'explicit' | 'property' | 'delete' | 'nodiscard'}

// **BNF**: STATEMENT ::= (IF | FOR | FOREACH | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
export type Node_Statement =
    | Node_If
    | Node_For
    | Node_ForEach
    | Node_While
    | Node_Return
    | Node_StatBlock
    | Node_Break
    | Node_Continue
    | Node_DoWhile
    | Node_Switch
    | Node_ExprStat
    | Node_Try;

// **BNF**: SWITCH ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
export interface Node_Switch extends NodeBase {
    readonly nodeName: NodeName.Switch;
    readonly assign: Node_Assign;
    readonly caseList: Node_Case[];
}

// **BNF**: BREAK ::= 'break' ';'
export interface Node_Break extends NodeBase {
    readonly nodeName: NodeName.Break;
}

// **BNF**: FOR ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
export interface Node_For extends NodeBase {
    readonly nodeName: NodeName.For;
    readonly initial: Node_Var | Node_ExprStat;
    readonly condition: Node_ExprStat | undefined;
    readonly incrementList: Node_Assign[];
    readonly statement: Node_Statement | undefined;
}

// **BNF**: FOREACH ::= 'foreach' '(' TYPE IDENTIFIER {',' TYPE INDENTIFIER} ':' ASSIGN ')' STATEMENT
export interface Node_ForEach extends NodeBase {
    readonly nodeName: NodeName.ForEach;
    readonly variables: VariableInForEach[];
    readonly assign: Node_Assign | undefined;
    readonly statement: Node_Statement | undefined;
}

// like Node_Var but no initializer or modifier
export interface VariableInForEach extends NodeBase {
    readonly nodeName: NodeName.ForEachVar;
    readonly type: Node_Type;
    readonly identifier: TokenObject;
}

// **BNF**: WHILE ::= 'while' '(' ASSIGN ')' STATEMENT
export interface Node_While extends NodeBase {
    readonly nodeName: NodeName.While;
    readonly assign: Node_Assign;
    readonly statement: Node_Statement | undefined;
}

// **BNF**: DOWHILE ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
export interface Node_DoWhile extends NodeBase {
    readonly nodeName: NodeName.DoWhile;
    readonly statement: Node_Statement;
    readonly assign: Node_Assign | undefined;
}

// **BNF**: IF ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
export interface Node_If extends NodeBase {
    readonly nodeName: NodeName.If;
    readonly condition: Node_Assign;
    readonly thenStat: Node_Statement | undefined;
    readonly elseStat: Node_Statement | undefined;
}

// **BNF**: CONTINUE ::= 'continue' ';'
export interface Node_Continue extends NodeBase {
    readonly nodeName: NodeName.Continue;
}

// **BNF**: EXPRSTAT ::= [ASSIGN] ';'
export interface Node_ExprStat extends NodeBase {
    readonly nodeName: NodeName.ExprStat;
    readonly assign: Node_Assign | undefined;
}

// **BNF**: TRY ::= 'try' STATBLOCK 'catch' STATBLOCK
export interface Node_Try extends NodeBase {
    readonly nodeName: NodeName.Try;
    readonly tryBlock: Node_StatBlock;
    readonly catchBlock: Node_StatBlock | undefined;
}

// **BNF**: RETURN ::= 'return' [ASSIGN] ';'
export interface Node_Return extends NodeBase {
    readonly nodeName: NodeName.Return;
    readonly assign: Node_Assign | undefined;
}

// **BNF**: CASE ::= (('case' EXPR) | 'default') ':' {STATEMENT}
export interface Node_Case extends NodeBase {
    readonly nodeName: NodeName.Case;
    readonly expr: Node_Expr | undefined;
    readonly statementList: Node_Statement[];
}

// **BNF**: EXPR ::= EXPRTERM {EXPROP EXPRTERM}
export interface Node_Expr extends NodeBase {
    readonly nodeName: NodeName.Expr;
    readonly head: Node_ExprTerm;
    readonly tail: OperatorAndExpr | undefined;
}

// EXPRVOID      ::= 'void'
export interface Node_ExprVoid extends NodeBase {
    readonly nodeName: NodeName.ExprVoid;
}

export interface OperatorAndExpr {
    readonly operator: TokenObject;
    readonly expr: Node_Expr;
}

// **BNF**: EXPRTERM ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export type Node_ExprTerm = Node_ExprTerm1 | Node_ExprTerm2;

// ([TYPE '='] INITLIST)
export interface Node_ExprTerm1 extends NodeBase {
    readonly nodeName: NodeName.ExprTerm;
    readonly exprTerm: 1;
    readonly type: Node_Type | undefined;
    readonly initList: Node_InitList;
}

// ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export interface Node_ExprTerm2 extends NodeBase {
    readonly nodeName: NodeName.ExprTerm;
    readonly exprTerm: 2;
    readonly preOps: TokenObject[];
    readonly value: Node_ExprValue;
    readonly postOps: Node_ExprPostOp[];
}

// **BNF**: EXPRVALUE ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
export type Node_ExprValue =
    | Node_ConstructCall
    | Node_FuncCall
    | Node_VarAccess
    | Node_Cast
    | Node_Literal
    | Node_Assign
    | Node_Lambda;

// **BNF**: CONSTRUCTCALL ::= TYPE ARGLIST
export interface Node_ConstructCall extends NodeBase {
    readonly nodeName: NodeName.ConstructCall;
    readonly type: Node_Type;
    readonly argList: Node_ArgList;
}

// **BNF**: EXPRPREOP ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// **BNF**: EXPRPOSTOP ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ']') | ARGLIST | '++' | '--'
export type Node_ExprPostOp = Node_ExprPostOp1 | Node_ExprPostOp2 | Node_ExprPostOp3 | Node_ExprPostOp4;

// ('.' (FUNCCALL | IDENTIFIER))
export interface Node_ExprPostOp1 extends NodeBase {
    readonly nodeName: NodeName.ExprPostOp;
    readonly postOp: 1;
    readonly member: Node_FuncCall | TokenObject | undefined;
}

export function isMemberMethodInPostOp(member: Node_FuncCall | TokenObject | undefined): member is Node_FuncCall {
    return member !== undefined && 'nodeName' in member;
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
export interface Node_ExprPostOp2 extends NodeBase {
    readonly nodeName: NodeName.ExprPostOp;
    readonly postOp: 2;
    readonly indexingList: OptionalIdentifierAndAssign[];
}

export interface OptionalIdentifierAndAssign {
    readonly identifier: TokenObject | undefined;
    readonly assign: Node_Assign;
}

// ARGLIST
export interface Node_ExprPostOp3 extends NodeBase {
    readonly nodeName: NodeName.ExprPostOp;
    readonly postOp: 3;
    readonly args: Node_ArgList;
}

// ++ | --
export interface Node_ExprPostOp4 extends NodeBase {
    readonly nodeName: NodeName.ExprPostOp;
    readonly postOp: 4;
    readonly operator: '++' | '--';
}

// **BNF**: CAST ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
export interface Node_Cast extends NodeBase {
    readonly nodeName: NodeName.Cast;
    readonly type: Node_Type;
    readonly assign: Node_Assign;
}

// **BNF**: LAMBDA ::= 'function' '(' [[TYPE TYPEMODIFIER] [IDENTIFIER] {',' [TYPE TYPEMODIFIER] [IDENTIFIER]}] ')' STATBLOCK
export interface Node_Lambda extends NodeBase {
    readonly nodeName: NodeName.Lambda;
    readonly paramList: ParamListInLambda[];
    readonly statBlock: Node_StatBlock | undefined;
}

export interface ParamListInLambda {
    readonly type: Node_Type | undefined;
    readonly typeModifier: TypeModifier | undefined;
    readonly identifier: TokenObject | undefined;
}

// **BNF**: LITERAL ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
export interface Node_Literal extends NodeBase {
    readonly nodeName: NodeName.Literal;
    readonly value: TokenObject;
}

// **BNF**: FUNCCALL ::= SCOPE IDENTIFIER ARGLIST
export interface Node_FuncCall extends NodeBase {
    readonly nodeName: NodeName.FuncCall;
    readonly scope: Node_Scope | undefined;
    readonly identifier: TokenObject;
    readonly argList: Node_ArgList;
    readonly typeTemplates: Node_Type[] | undefined;
}

// **BNF**: VARACCESS ::= SCOPE IDENTIFIER
export interface Node_VarAccess extends NodeBase {
    readonly nodeName: NodeName.VarAccess;
    readonly scope: Node_Scope | undefined;
    readonly identifier: TokenObject | undefined;
}

// **BNF**: ARGLIST ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
export interface Node_ArgList extends NodeBase {
    readonly nodeName: NodeName.ArgList;
    readonly argList: OptionalIdentifierAndAssign[];
}

// **BNF**: ASSIGN ::= CONDITION [ ASSIGNOP ASSIGN ]
export interface Node_Assign extends NodeBase {
    readonly nodeName: NodeName.Assign;
    readonly condition: Node_Condition;
    readonly tail: OperatorAndAssign | undefined;
}

export interface OperatorAndAssign {
    readonly operator: TokenObject;
    readonly assign: Node_Assign;
}

// **BNF**: CONDITION ::= EXPR ['?' ASSIGN ':' ASSIGN]
export interface Node_Condition extends NodeBase {
    readonly nodeName: NodeName.Condition;
    readonly expr: Node_Expr;
    readonly ternary: TernaryAssigns | undefined;
}

export interface TernaryAssigns {
    readonly trueAssign: Node_Assign;
    readonly falseAssign: Node_Assign;
}

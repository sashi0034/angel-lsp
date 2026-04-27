import {TokenObject, ReservedToken} from '../compiler_tokenizer/tokenObject';
import {TokenRange} from '../compiler_tokenizer/tokenRange';

export type AccessModifierToken = TokenObject & {
    readonly text: 'private' | 'protected';
};

export type ConstModifierToken = TokenObject & {
    readonly text: 'const';
};

export type MixinAttributeToken = TokenObject & {
    readonly text: 'mixin';
};

export type EntityAttributeToken = TokenObject & {
    readonly text: 'shared' | 'external' | 'abstract' | 'final';
};

export type FunctionAttributeToken = TokenObject & {
    readonly text: 'override' | 'final' | 'explicit' | 'property' | 'delete' | 'nodiscard';
};

export type InOutModifierToken = TokenObject & {
    readonly text: 'in' | 'out' | 'inout';
};

export type RefModifierToken = TokenObject & {
    readonly text: '&';
};

export type RepeatModifierToken = TokenObject & {
    readonly text: 'repeat' | 'repeat_same';
};

export type HandleModifierToken = TokenObject & {
    readonly text: '@';
};

export interface HandleAndConstTokenPair {
    readonly handleToken: HandleModifierToken;
    readonly constToken: ConstModifierToken | undefined;
}

export enum NodeName {
    Namespace = 'Namespace',
    Using = 'Using',
    Enum = 'Enum',
    Class = 'Class',
    TypeDef = 'TypeDef',
    Func = 'Func',
    ListPattern = 'ListPattern',
    ListEntry = 'ListEntry',
    Interface = 'Interface',
    Var = 'Var',
    Import = 'Import',
    FuncDef = 'FuncDef',
    VirtualProp = 'VirtualProp',
    InterfaceMethod = 'InterfaceMethod',
    StatBlock = 'StatBlock',
    ParamList = 'ParamList',
    Parameter = 'Parameter',
    Type = 'Type',
    InitList = 'InitList',
    Scope = 'Scope',
    DataType = 'DataType',
    Switch = 'Switch',
    Break = 'Break',
    For = 'For',
    ForEach = 'ForEach',
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
    ConstructorCall = 'ConstructorCall',
    ExprPostOp = 'ExprPostOp',
    Cast = 'Cast',
    Lambda = 'Lambda',
    LambdaParam = 'LambdaParam',
    Literal = 'Literal',
    FuncCall = 'FuncCall',
    VarAccess = 'VarAccess',
    ArgList = 'ArgList',
    Assign = 'Assign',
    Condition = 'Condition'
}

export type NodeObject =
    | Node_Namespace
    | Node_Using
    | Node_Enum
    | Node_Class
    | Node_TypeDef
    | Node_Func
    | Node_ListPattern
    | Node_ListEntry
    | Node_Interface
    | Node_Var
    | Node_Import
    | Node_FuncDef
    | Node_VirtualProp
    | Node_InterfaceMethod
    | Node_StatBlock
    | Node_ParamList
    | Node_Parameter
    | Node_Type
    | Node_InitList
    | Node_Scope
    | Node_DataType
    | Node_Switch
    | Node_Break
    | Node_For
    | Node_ForEach
    | Node_While
    | Node_DoWhile
    | Node_If
    | Node_Continue
    | Node_ExprStat
    | Node_Try
    | Node_Return
    | Node_Case
    | Node_Expr
    | Node_ExprTerm
    | Node_ConstructorCall
    | Node_ExprPostOp
    | Node_Cast
    | Node_Lambda
    | Node_LambdaParam
    | Node_Literal
    | Node_FuncCall
    | Node_VarAccess
    | Node_ArgList
    | Node_Assign
    | Node_Condition;

export interface NodeBase {
    readonly nodeName: NodeName;
    readonly nodeRange: TokenRange;
}

// **BNF** SCRIPT ::= {IMPORT | ENUM | TYPEDEF | CLASS | INTERFACE | FUNCDEF | VIRTUALPROP | VAR | FUNC | NAMESPACE | USING | ';'}
export type Node_Script = ScriptElement[];

export type ScriptElement =
    | Node_Import
    | Node_Enum
    | Node_TypeDef
    | Node_Class
    | Node_Interface
    | Node_FuncDef
    | Node_VirtualProp
    | Node_Var
    | Node_Func
    | Node_Namespace
    | Node_Using;

// **BNF** NAMESPACE ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
export interface Node_Namespace extends NodeBase {
    readonly nodeName: NodeName.Namespace;
    readonly namespaceList: TokenObject[];
    readonly scopeRange: TokenRange;
    readonly script: Node_Script;
}

// **BNF** USING ::= 'using' 'namespace' IDENTIFIER {'::' IDENTIFIER} ';'
export interface Node_Using extends NodeBase {
    readonly nodeName: NodeName.Using;
    readonly namespaceList: TokenObject[];
}

// **BNF** ENUM ::= {'shared' | 'external'} 'enum' IDENTIFIER [ ':' ('int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64') ] (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
export interface Node_Enum extends NodeBase {
    readonly nodeName: NodeName.Enum;
    readonly metadata: TokenObject[][];
    readonly entityTokens: EntityAttributeToken[] | undefined;
    readonly identifier: TokenObject;
    readonly memberList: IdentifierAndOptionalExpr[];
    readonly scopeRange: TokenRange;
    readonly enumType: ReservedToken | undefined;
}

export interface IdentifierAndOptionalExpr {
    readonly identifier: TokenObject;
    readonly expr: Node_Expr | undefined;
}

// **BNF** CLASS ::= ['mixin'] {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTUALPROP | FUNC | VAR | FUNCDEF} '}'))
export interface Node_Class extends NodeBase {
    readonly nodeName: NodeName.Class;
    readonly metadata: TokenObject[][];
    readonly mixinToken: MixinAttributeToken | undefined;
    readonly entityTokens: EntityAttributeToken[] | undefined;
    readonly identifier: TokenObject;
    readonly typeParameters: Node_Type[] | undefined;
    readonly baseList: ScopeAndIdentifier[];
    readonly scopeRange: TokenRange;
    readonly memberList: (Node_VirtualProp | Node_Var | Node_Func | Node_FuncDef)[];
}

export interface ScopeAndIdentifier {
    readonly scope: Node_Scope | undefined;
    readonly identifier: TokenObject | undefined;
}

// **BNF** TYPEDEF ::= 'typedef' PRIMITIVETYPE IDENTIFIER ';'
export interface Node_TypeDef extends NodeBase {
    readonly nodeName: NodeName.TypeDef;
    readonly type: TokenObject;
    readonly identifier: TokenObject;
}

// **BNF** FUNC ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER ['<' TYPE {',' TYPE} '>'] PARAMLIST [LISTPATTERN] ['const'] FUNCATTR (';' | STATBLOCK)
export interface Node_Func extends NodeBase {
    readonly nodeName: NodeName.Func;
    readonly entityTokens: EntityAttributeToken[] | undefined;
    readonly accessor: AccessModifierToken | undefined;
    readonly head: FunctionReturnValue | {tag: 'constructor'} | {tag: 'destructor'};
    readonly identifier: TokenObject;
    readonly typeParameters: Node_Type[];
    readonly paramList: Node_ParamList;
    readonly postfixConstToken: ConstModifierToken | undefined;
    readonly funcAttrTokens: FunctionAttributeToken[] | undefined;
    readonly statBlock: Node_StatBlock | undefined;
    readonly listPattern: Node_ListPattern | undefined;
}

interface FunctionReturnValue {
    readonly tag: 'function';
    readonly returnType: Node_Type;
    readonly refToken: RefModifierToken | undefined;
}

// **BNF** LISTPATTERN ::= '{' LISTENTRY {',' LISTENTRY} '}'
export interface Node_ListPattern extends NodeBase {
    readonly nodeName: NodeName.ListPattern;
    readonly entries: Node_ListEntry[];
}

// **BNF** LISTENTRY ::= (('repeat' | 'repeat_same') (('{' LISTENTRY '}') | TYPE)) | (TYPE {',' TYPE})
export type Node_ListEntry = Node_ListEntry1 | Node_ListEntry2;

export interface Node_ListEntry1 extends NodeBase {
    readonly nodeName: NodeName.ListEntry;
    readonly entryPattern: 1;
    readonly repeatToken: RepeatModifierToken | undefined;
    readonly entry: Node_ListEntry | Node_Type | undefined;
}

export interface Node_ListEntry2 extends NodeBase {
    readonly nodeName: NodeName.ListEntry;
    readonly entryPattern: 2;
    readonly typeList: Node_Type[];
}

// **BNF** INTERFACE ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTUALPROP | INTERFACEMETHOD} '}'))
export interface Node_Interface extends NodeBase {
    readonly nodeName: NodeName.Interface;
    readonly entityTokens: EntityAttributeToken[] | undefined;
    readonly identifier: TokenObject;
    readonly baseList: ScopeAndIdentifier[];
    readonly scopeRange: TokenRange | undefined;
    readonly memberList: (Node_VirtualProp | Node_InterfaceMethod)[];
}

// **BNF** VAR ::= ['private' | 'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
export interface Node_Var extends NodeBase {
    readonly nodeName: NodeName.Var;
    readonly accessor: AccessModifierToken | undefined;
    readonly type: Node_Type;
    readonly variables: IdentifierAndInitializer[];
}

// IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]}
export interface IdentifierAndInitializer {
    readonly identifier: TokenObject;
    readonly initializer: Node_InitList | Node_Assign | Node_ArgList | undefined;
}

// **BNF** IMPORT ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
export interface Node_Import extends NodeBase {
    readonly nodeName: NodeName.Import;
    readonly type: Node_Type;
    readonly refToken: RefModifierToken | undefined;
    readonly identifier: TokenObject;
    readonly paramList: Node_ParamList;
    readonly funcAttrTokens: FunctionAttributeToken[] | undefined;
    readonly path: TokenObject;
}

// **BNF** FUNCDEF ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
export interface Node_FuncDef extends NodeBase {
    readonly nodeName: NodeName.FuncDef;
    readonly entityTokens: EntityAttributeToken[] | undefined;
    readonly returnType: Node_Type;
    readonly refToken: RefModifierToken | undefined;
    readonly identifier: TokenObject;
    readonly paramList: Node_ParamList;
}

// **BNF** VIRTUALPROP ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
export interface Node_VirtualProp extends NodeBase {
    readonly nodeName: NodeName.VirtualProp;
    readonly accessor: AccessModifierToken | undefined;
    readonly type: Node_Type;
    readonly refToken: RefModifierToken | undefined;
    readonly identifier: TokenObject;
    readonly getter: GetterOrSetter | undefined;
    readonly setter: GetterOrSetter | undefined;
}

export interface GetterOrSetter {
    readonly constToken: ConstModifierToken | undefined;
    readonly funcAttrTokens: FunctionAttributeToken[] | undefined;
    readonly statBlock: Node_StatBlock | undefined;
}

// **BNF** INTERFACEMETHOD ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] FUNCATTR ';'
export interface Node_InterfaceMethod extends NodeBase {
    readonly nodeName: NodeName.InterfaceMethod;
    readonly returnType: Node_Type;
    readonly refToken: RefModifierToken | undefined;
    readonly identifier: TokenObject;
    readonly paramList: Node_ParamList;
    readonly postfixConstToken: ConstModifierToken | undefined;
    readonly funcAttrTokens: FunctionAttributeToken[] | undefined;
}

// **BNF** STATBLOCK ::= '{' {VAR | STATEMENT | USING} '}'
export interface Node_StatBlock extends NodeBase {
    readonly nodeName: NodeName.StatBlock;
    readonly statementList: (Node_Var | Node_Statement | Node_Using)[];
}

// **BNF** PARAMLIST ::= '(' ['void' | (PARAMETER {',' PARAMETER})] ')'
export interface Node_ParamList extends NodeBase {
    readonly nodeName: NodeName.ParamList;
    readonly params: Node_Parameter[];
}

// **BNF** PARAMETER ::= TYPE TYPEMODIFIER [IDENTIFIER] ['...' | ('=' (EXPR | 'void'))]
export interface Node_Parameter extends NodeBase {
    readonly nodeName: NodeName.Parameter;
    readonly type: Node_Type;
    readonly inOutToken: InOutModifierToken | undefined;
    readonly identifier: TokenObject | undefined;
    readonly defaultExpr: Node_Expr | VoidParameter | undefined;
    readonly isVariadic: boolean;
}

export const voidParameter = Symbol();
export type VoidParameter = typeof voidParameter;

// **BNF** TYPEMODIFIER ::= ['&' ['in' | 'out' | 'inout'] ['+'] ['if_handle_then_const']]
// n/a

// **BNF** TYPE ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
export interface Node_Type extends NodeBase {
    readonly nodeName: NodeName.Type;
    readonly constToken: ConstModifierToken | undefined;
    readonly scope: Node_Scope | undefined;
    readonly dataType: Node_DataType;
    readonly typeArguments: Node_Type[];
    readonly isArray: boolean;
    readonly handle: HandleAndConstTokenPair | undefined;
}

// **BNF** INITLIST ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
export interface Node_InitList extends NodeBase {
    readonly nodeName: NodeName.InitList;
    readonly initList: (Node_Assign | Node_InitList)[];
}

// **BNF** SCOPE ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
export interface Node_Scope extends NodeBase {
    readonly nodeName: NodeName.Scope;
    readonly isGlobal: boolean;
    readonly scopeList: TokenObject[];
    readonly typeArguments: Node_Type[];
}

// **BNF** DATATYPE ::= (IDENTIFIER | PRIMITIVETYPE | '?' | 'auto')
export interface Node_DataType extends NodeBase {
    readonly nodeName: NodeName.DataType;
    readonly identifier: TokenObject;
}

// **BNF** PRIMITIVETYPE ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
// n/a

// **BNF** FUNCATTR ::= {'override' | 'final' | 'explicit' | 'property' | 'delete' | 'nodiscard'}
// n/a

// **BNF** STATEMENT ::= (IF | FOR | FOREACH | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
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

// **BNF** SWITCH ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
export interface Node_Switch extends NodeBase {
    readonly nodeName: NodeName.Switch;
    readonly assign: Node_Assign;
    readonly caseList: Node_Case[];
}

// **BNF** BREAK ::= 'break' ';'
export interface Node_Break extends NodeBase {
    readonly nodeName: NodeName.Break;
}

// **BNF** FOR ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
export interface Node_For extends NodeBase {
    readonly nodeName: NodeName.For;
    readonly initial: Node_Var | Node_ExprStat;
    readonly condition: Node_ExprStat | undefined;
    readonly incrementList: Node_Assign[];
    readonly statement: Node_Statement | undefined;
}

// **BNF** FOREACH ::= 'foreach' '(' TYPE IDENTIFIER {',' TYPE IDENTIFIER} ':' ASSIGN ')' STATEMENT
export interface Node_ForEach extends NodeBase {
    readonly nodeName: NodeName.ForEach;
    readonly variables: VariableInForEach[];
    readonly assign: Node_Assign | undefined;
    readonly statement: Node_Statement | undefined;
}

// like Node_Var but no initializer or modifier
export interface VariableInForEach {
    readonly type: Node_Type;
    readonly identifier: TokenObject;
}

// **BNF** WHILE ::= 'while' '(' ASSIGN ')' STATEMENT
export interface Node_While extends NodeBase {
    readonly nodeName: NodeName.While;
    readonly assign: Node_Assign;
    readonly statement: Node_Statement | undefined;
}

// **BNF** DOWHILE ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
export interface Node_DoWhile extends NodeBase {
    readonly nodeName: NodeName.DoWhile;
    readonly statement: Node_Statement;
    readonly assign: Node_Assign | undefined;
}

// **BNF** IF ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
export interface Node_If extends NodeBase {
    readonly nodeName: NodeName.If;
    readonly condition: Node_Assign;
    readonly thenStat: Node_Statement | undefined;
    readonly elseStat: Node_Statement | undefined;
}

// **BNF** CONTINUE ::= 'continue' ';'
export interface Node_Continue extends NodeBase {
    readonly nodeName: NodeName.Continue;
}

// **BNF** EXPRSTAT ::= [ASSIGN] ';'
export interface Node_ExprStat extends NodeBase {
    readonly nodeName: NodeName.ExprStat;
    readonly assign: Node_Assign | undefined;
}

// **BNF** TRY ::= 'try' STATBLOCK 'catch' STATBLOCK
export interface Node_Try extends NodeBase {
    readonly nodeName: NodeName.Try;
    readonly tryBlock: Node_StatBlock;
    readonly catchBlock: Node_StatBlock | undefined;
}

// **BNF** RETURN ::= 'return' [ASSIGN] ';'
export interface Node_Return extends NodeBase {
    readonly nodeName: NodeName.Return;
    readonly assign: Node_Assign | undefined;
}

// **BNF** CASE ::= (('case' EXPR) | 'default') ':' {STATEMENT}
export interface Node_Case extends NodeBase {
    readonly nodeName: NodeName.Case;
    readonly expr: Node_Expr | undefined;
    readonly statementList: Node_Statement[];
}

// **BNF** EXPR ::= EXPRTERM {EXPROP EXPRTERM}
export interface Node_Expr extends NodeBase {
    readonly nodeName: NodeName.Expr;
    readonly head: Node_ExprTerm;
    readonly tail: OperatorAndExpr | undefined;
}

export interface OperatorAndExpr {
    readonly operator: TokenObject;
    readonly expr: Node_Expr;
}

// **BNF** EXPRTERM ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
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

// **BNF** EXPRVALUE ::= 'void' | CONSTRUCTORCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
export type Node_ExprValue =
    | Node_ConstructorCall
    | Node_FuncCall
    | Node_VarAccess
    | Node_Cast
    | Node_Literal
    | Node_Assign
    | Node_Lambda;

// **BNF** CONSTRUCTORCALL ::= TYPE ARGLIST
export interface Node_ConstructorCall extends NodeBase {
    readonly nodeName: NodeName.ConstructorCall;
    readonly type: Node_Type;
    readonly argList: Node_ArgList;
}

// **BNF** EXPRPREOP ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'
// n/a

// **BNF** EXPRPOSTOP ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ']') | ARGLIST | '++' | '--'
export type Node_ExprPostOp = Node_ExprPostOp1 | Node_ExprPostOp2 | Node_ExprPostOp3 | Node_ExprPostOp4;

// ('.' (FUNCCALL | IDENTIFIER))
export interface Node_ExprPostOp1 extends NodeBase {
    readonly nodeName: NodeName.ExprPostOp;
    readonly postOpPattern: 1;
    readonly member: {access: 'method'; node: Node_FuncCall} | {access: 'field'; token: TokenObject} | undefined;
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
export interface Node_ExprPostOp2 extends NodeBase {
    readonly nodeName: NodeName.ExprPostOp;
    readonly postOpPattern: 2;
    readonly indexingList: OptionalIdentifierAndAssign[];
}

export interface OptionalIdentifierAndAssign {
    readonly identifier: TokenObject | undefined;
    readonly assign: Node_Assign;
}

// ARGLIST
export interface Node_ExprPostOp3 extends NodeBase {
    readonly nodeName: NodeName.ExprPostOp;
    readonly postOpPattern: 3;
    readonly args: Node_ArgList;
}

// ++ | --
export interface Node_ExprPostOp4 extends NodeBase {
    readonly nodeName: NodeName.ExprPostOp;
    readonly postOpPattern: 4;
    readonly operator: '++' | '--';
}

// **BNF** CAST ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
export interface Node_Cast extends NodeBase {
    readonly nodeName: NodeName.Cast;
    readonly type: Node_Type;
    readonly assign: Node_Assign;
}

// **BNF** LAMBDA ::= 'function' '(' [LAMBDAPARAM {',' LAMBDAPARAM}] ')' STATBLOCK
export interface Node_Lambda extends NodeBase {
    readonly nodeName: NodeName.Lambda;
    readonly paramList: Node_LambdaParam[];
    readonly statBlock: Node_StatBlock | undefined;
}

// **BNF** LAMBDAPARAM ::= [TYPE TYPEMODIFIER] [IDENTIFIER]
export interface Node_LambdaParam extends NodeBase {
    readonly nodeName: NodeName.LambdaParam;
    readonly type: Node_Type | undefined;
    readonly typeToken: InOutModifierToken | undefined;
    readonly identifier: TokenObject | undefined;
}

// **BNF** LITERAL ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
export interface Node_Literal extends NodeBase {
    readonly nodeName: NodeName.Literal;
    readonly value: TokenObject;
}

// **BNF** FUNCCALL ::= SCOPE IDENTIFIER ['<' TYPE {',' TYPE} '>'] ARGLIST
export interface Node_FuncCall extends NodeBase {
    readonly nodeName: NodeName.FuncCall;
    readonly scope: Node_Scope | undefined;
    readonly identifier: TokenObject;
    readonly argList: Node_ArgList;
    readonly typeArguments: Node_Type[] | undefined;
}

// **BNF** VARACCESS ::= SCOPE IDENTIFIER
export interface Node_VarAccess extends NodeBase {
    readonly nodeName: NodeName.VarAccess;
    readonly scope: Node_Scope | undefined;
    readonly identifier: TokenObject | undefined;
}

// **BNF** ARGLIST ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
export interface Node_ArgList extends NodeBase {
    readonly nodeName: NodeName.ArgList;
    readonly argList: OptionalIdentifierAndAssign[];
}

// **BNF** ASSIGN ::= CONDITION [ ASSIGNOP ASSIGN ]
export interface Node_Assign extends NodeBase {
    readonly nodeName: NodeName.Assign;
    readonly condition: Node_Condition;
    readonly tail: OperatorAndAssign | undefined;
}

export interface OperatorAndAssign {
    readonly operator: TokenObject;
    readonly assign: Node_Assign;
}

// **BNF** CONDITION ::= EXPR ['?' ASSIGN ':' ASSIGN]
export interface Node_Condition extends NodeBase {
    readonly nodeName: NodeName.Condition;
    readonly expr: Node_Expr;
    readonly ternary: TernaryAssigns | undefined;
}

export interface TernaryAssigns {
    readonly trueAssign: Node_Assign;
    readonly falseAssign: Node_Assign;
}

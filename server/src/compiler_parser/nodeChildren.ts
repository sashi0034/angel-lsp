import {
    Node_ArgList,
    Node_Assign,
    NodeBase,
    Node_Case,
    Node_Cast,
    Node_Class,
    Node_Condition,
    Node_ConstructorCall,
    Node_DoWhile,
    Node_Enum,
    Node_Expr,
    Node_ExprPostOp,
    Node_ExprStat,
    Node_ExprTerm,
    Node_For,
    Node_ForEach,
    Node_Func,
    Node_FuncCall,
    Node_FuncDef,
    Node_If,
    Node_Import,
    Node_InitList,
    Node_Interface,
    Node_InterfaceMethod,
    Node_Lambda,
    Node_LambdaParam,
    Node_ListEntry,
    Node_ListPattern,
    Node_Mixin,
    NodeName,
    Node_Namespace,
    Node_Parameter,
    Node_Return,
    Node_Scope,
    Node_StatBlock,
    Node_Switch,
    Node_Try,
    Node_Type,
    Node_Var,
    Node_VarAccess,
    Node_VirtualProp,
    Node_While,
    voidParameter
} from './nodes';

type NodeChildrenMap = (node: NodeBase) => NodeBase[];

function children(...nodes: (NodeBase | undefined)[]): NodeBase[] {
    return nodes.filter((node): node is NodeBase => node !== undefined);
}

const nodeChildrenMap: Record<NodeName, NodeChildrenMap> = {
    // **BNF** NAMESPACE ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
    [NodeName.Namespace]: function (node) {
        const namespaceNode = node as Node_Namespace;
        return namespaceNode.script;
    },

    // **BNF** USING ::= 'using' 'namespace' IDENTIFIER ('::' IDENTIFIER)* ';'
    [NodeName.Using]: function () {
        return [];
    },

    // **BNF** ENUM ::= {'shared' | 'external'} 'enum' IDENTIFIER [ ':' ('int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64') ] (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
    [NodeName.Enum]: function (node) {
        const enumNode = node as Node_Enum;
        return enumNode.memberList.flatMap(member => children(member.expr));
    },

    // **BNF** CLASS ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTUALPROP | FUNC | VAR | FUNCDEF} '}'))
    [NodeName.Class]: function (node) {
        const classNode = node as Node_Class;
        return [
            ...children(...(classNode.typeTemplates ?? [])),
            ...classNode.baseList.flatMap(base => children(base.scope)),
            ...classNode.memberList
        ];
    },

    // **BNF** TYPEDEF ::= 'typedef' PRIMITIVETYPE IDENTIFIER ';'
    [NodeName.TypeDef]: function () {
        return [];
    },

    // **BNF** FUNC ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST [LISTPATTERN] ['const'] FUNCATTR (';' | STATBLOCK)
    [NodeName.Func]: function (node) {
        const funcNode = node as Node_Func;
        return [
            ...children(funcNode.head.tag === 'function' ? funcNode.head.returnType : undefined),
            ...funcNode.paramList,
            ...children(funcNode.statBlock, funcNode.listPattern),
            ...funcNode.typeTemplates
        ];
    },

    // **BNF** LISTPATTERN ::= '{' LISTENTRY {',' LISTENTRY} '}'
    [NodeName.ListPattern]: function (node) {
        const listPattern = node as Node_ListPattern;
        return listPattern.entries;
    },

    // **BNF** LISTENTRY ::= (('repeat' | 'repeat_same') (('{' LISTENTRY '}') | TYPE)) | (TYPE {',' TYPE})
    [NodeName.ListEntry]: function (node) {
        const listEntry = node as Node_ListEntry;
        if (listEntry.entryPattern === 1) {
            return children(listEntry.entry);
        }

        return listEntry.typeList;
    },

    // **BNF** INTERFACE ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTUALPROP | INTERFACEMETHOD} '}'))
    [NodeName.Interface]: function (node) {
        const interfaceNode = node as Node_Interface;
        return [...interfaceNode.baseList.flatMap(base => children(base.scope)), ...interfaceNode.memberList];
    },

    // **BNF** VAR ::= ['private' | 'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
    [NodeName.Var]: function (node) {
        const varNode = node as Node_Var;
        return [varNode.type, ...varNode.variables.flatMap(variable => children(variable.initializer))];
    },

    // **BNF** IMPORT ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
    [NodeName.Import]: function (node) {
        const importNode = node as Node_Import;
        return [importNode.type, ...importNode.paramList];
    },

    // **BNF** FUNCDEF ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
    [NodeName.FuncDef]: function (node) {
        const funcDef = node as Node_FuncDef;
        return [funcDef.returnType, ...funcDef.paramList];
    },

    // **BNF** VIRTUALPROP ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
    [NodeName.VirtualProp]: function (node) {
        const virtualProp = node as Node_VirtualProp;
        return children(virtualProp.type, virtualProp.getter?.statBlock, virtualProp.setter?.statBlock);
    },

    // **BNF** MIXIN ::= 'mixin' CLASS
    [NodeName.Mixin]: function (node) {
        const mixin = node as Node_Mixin;
        return [mixin.mixinClass];
    },

    // **BNF** INTERFACEMETHOD ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] FUNCATTR ';'
    [NodeName.InterfaceMethod]: function (node) {
        const intfMethod = node as Node_InterfaceMethod;
        return [intfMethod.returnType, ...intfMethod.paramList];
    },

    // **BNF** STATBLOCK ::= '{' {VAR | STATEMENT | USING} '}'
    [NodeName.StatBlock]: function (node) {
        const statBlock = node as Node_StatBlock;
        return statBlock.statementList;
    },

    // **BNF** PARAMLIST ::= '(' ['void' | (PARAMETER {',' PARAMETER})] ')'
    // n/a

    // **BNF** PARAMETER ::= TYPE TYPEMODIFIER [IDENTIFIER] ['...' | ('=' (EXPR | 'void'))]
    [NodeName.Parameter]: function (node) {
        const param = node as Node_Parameter;
        return children(param.type, param.defaultExpr === voidParameter ? undefined : param.defaultExpr);
    },

    // **BNF** TYPEMODIFIER ::= ['&' ['in' | 'out' | 'inout'] ['+'] ['if_handle_then_const']]
    // n/a

    // **BNF** TYPE ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
    [NodeName.Type]: function (node) {
        const typeNode = node as Node_Type;
        return children(typeNode.scope, typeNode.dataType, ...typeNode.typeTemplates);
    },

    // **BNF** INITLIST ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
    [NodeName.InitList]: function (node) {
        const initList = node as Node_InitList;
        return initList.initList;
    },

    // **BNF** SCOPE ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
    [NodeName.Scope]: function (node) {
        const scope = node as Node_Scope;
        return scope.typeTemplates;
    },

    // **BNF** DATATYPE ::= (IDENTIFIER | PRIMITIVETYPE | '?' | 'auto')
    [NodeName.DataType]: function () {
        return [];
    },

    // **BNF** PRIMITIVETYPE ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
    // n/a

    // **BNF** FUNCATTR ::= {'override' | 'final' | 'explicit' | 'property' | 'delete' | 'nodiscard'}
    // n/a

    // **BNF** STATEMENT ::= (IF | FOR | FOREACH | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
    // n/a

    // **BNF** SWITCH ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
    [NodeName.Switch]: function (node) {
        const switchNode = node as Node_Switch;
        return [switchNode.assign, ...switchNode.caseList];
    },

    // **BNF** BREAK ::= 'break' ';'
    [NodeName.Break]: function () {
        return [];
    },

    // **BNF** FOR ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
    [NodeName.For]: function (node) {
        const forNode = node as Node_For;
        return children(forNode.initial, forNode.condition, ...forNode.incrementList, forNode.statement);
    },

    // **BNF** FOREACH ::= 'foreach' '(' TYPE IDENTIFIER {',' TYPE INDENTIFIER} ':' ASSIGN ')' STATEMENT
    [NodeName.ForEach]: function (node) {
        const forEach = node as Node_ForEach;
        return children(...forEach.variables.map(variable => variable.type), forEach.assign, forEach.statement);
    },

    // **BNF** WHILE ::= 'while' '(' ASSIGN ')' STATEMENT
    [NodeName.While]: function (node) {
        const whileNode = node as Node_While;
        return children(whileNode.assign, whileNode.statement);
    },

    // **BNF** DOWHILE ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
    [NodeName.DoWhile]: function (node) {
        const doWhile = node as Node_DoWhile;
        return children(doWhile.statement, doWhile.assign);
    },

    // **BNF** IF ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
    [NodeName.If]: function (node) {
        const ifNode = node as Node_If;
        return children(ifNode.condition, ifNode.thenStat, ifNode.elseStat);
    },

    // **BNF** CONTINUE ::= 'continue' ';'
    [NodeName.Continue]: function () {
        return [];
    },

    // **BNF** EXPRSTAT ::= [ASSIGN] ';'
    [NodeName.ExprStat]: function (node) {
        const exprStat = node as Node_ExprStat;
        return children(exprStat.assign);
    },

    // **BNF** TRY ::= 'try' STATBLOCK 'catch' STATBLOCK
    [NodeName.Try]: function (node) {
        const tryNode = node as Node_Try;
        return children(tryNode.tryBlock, tryNode.catchBlock);
    },

    // **BNF** RETURN ::= 'return' [ASSIGN] ';'
    [NodeName.Return]: function (node) {
        const returnNode = node as Node_Return;
        return children(returnNode.assign);
    },

    // **BNF** CASE ::= (('case' EXPR) | 'default') ':' {STATEMENT}
    [NodeName.Case]: function (node) {
        const caseNode = node as Node_Case;
        return children(caseNode.expr, ...caseNode.statementList);
    },

    // **BNF** EXPR ::= EXPRTERM {EXPROP EXPRTERM}
    [NodeName.Expr]: function (node) {
        const expr = node as Node_Expr;
        return children(expr.head, expr.tail?.expr);
    },

    // **BNF** EXPRTERM ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
    [NodeName.ExprTerm]: function (node) {
        const exprTerm = node as Node_ExprTerm;
        if (exprTerm.exprTerm === 1) {
            return children(exprTerm.type, exprTerm.initList);
        }

        return children(exprTerm.value, ...exprTerm.postOps);
    },

    // **BNF** EXPRVALUE ::= 'void' | CONSTRUCTORCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
    // n/a

    // **BNF** CONSTRUCTORCALL ::= TYPE ARGLIST
    [NodeName.ConstructorCall]: function (node) {
        const constructorCall = node as Node_ConstructorCall;
        return [constructorCall.type, constructorCall.argList];
    },

    // **BNF** EXPRPREOP ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'
    // n/a

    // **BNF** EXPRPOSTOP ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ']') | ARGLIST | '++' | '--'
    [NodeName.ExprPostOp]: function (node) {
        const exprPostOp = node as Node_ExprPostOp;
        if (exprPostOp.postOpPattern === 1) {
            return exprPostOp.member?.access === 'method' ? [exprPostOp.member.node] : [];
        }

        if (exprPostOp.postOpPattern === 2) {
            return exprPostOp.indexingList.map(indexing => indexing.assign);
        }

        if (exprPostOp.postOpPattern === 3) {
            return [exprPostOp.args];
        }

        return [];
    },

    // **BNF** CAST ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
    [NodeName.Cast]: function (node) {
        const cast = node as Node_Cast;
        return [cast.type, cast.assign];
    },

    // **BNF** LAMBDA ::= 'function' '(' [LAMBDAPARAM {',' LAMBDAPARAM}] ')' STATBLOCK
    [NodeName.Lambda]: function (node) {
        const lambda = node as Node_Lambda;
        return children(...lambda.paramList, lambda.statBlock);
    },

    // **BNF** LAMBDAPARAM ::= [TYPE TYPEMODIFIER] [IDENTIFIER]
    [NodeName.LambdaParam]: function (node) {
        const param = node as Node_LambdaParam;
        return children(param.type);
    },

    // **BNF** LITERAL ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
    [NodeName.Literal]: function () {
        return [];
    },

    // **BNF** FUNCCALL ::= SCOPE IDENTIFIER ARGLIST
    [NodeName.FuncCall]: function (node) {
        const funcCall = node as Node_FuncCall;
        return children(funcCall.scope, funcCall.argList, ...(funcCall.typeTemplates ?? []));
    },

    // **BNF** VARACCESS ::= SCOPE IDENTIFIER
    [NodeName.VarAccess]: function (node) {
        const varAccess = node as Node_VarAccess;
        return children(varAccess.scope);
    },

    // **BNF** ARGLIST ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
    [NodeName.ArgList]: function (node) {
        const argList = node as Node_ArgList;
        return argList.argList.map(arg => arg.assign);
    },

    // **BNF** ASSIGN ::= CONDITION [ ASSIGNOP ASSIGN ]
    [NodeName.Assign]: function (node) {
        const assign = node as Node_Assign;
        return children(assign.condition, assign.tail?.assign);
    },

    // **BNF** CONDITION ::= EXPR ['?' ASSIGN ':' ASSIGN]
    [NodeName.Condition]: function (node) {
        const condition = node as Node_Condition;
        return children(condition.expr, condition.ternary?.trueAssign, condition.ternary?.falseAssign);
    }
};

export function getNodeChildren(node: NodeBase): NodeBase[] {
    return nodeChildrenMap[node.nodeName](node);
}

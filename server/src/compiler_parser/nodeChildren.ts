import {NodeName, NodeObject, voidParameter} from './nodeObject';

function children(...nodes: (NodeObject | undefined)[]): NodeObject[] {
    return nodes.filter((node): node is NodeObject => node !== undefined);
}

export function getNodeChildren(node: NodeObject): NodeObject[] {
    switch (node.nodeName) {
        // **BNF** NAMESPACE ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
        case NodeName.Namespace:
            return node.script;

        // **BNF** USING ::= 'using' 'namespace' IDENTIFIER {'::' IDENTIFIER} ';'
        case NodeName.Using:
            return [];

        // **BNF** ENUM ::= {'shared' | 'external'} 'enum' IDENTIFIER [ ':' ('int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64') ] (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
        case NodeName.Enum:
            return node.memberList.flatMap(member => children(member.expr));

        // **BNF** CLASS ::= ['mixin'] {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTUALPROP | FUNC | VAR | FUNCDEF} '}'))
        case NodeName.Class:
            return [
                ...children(...(node.typeParameters ?? [])),
                ...node.baseList.flatMap(base => children(base.scope)),
                ...node.memberList
            ];

        // **BNF** TYPEDEF ::= 'typedef' PRIMITIVETYPE IDENTIFIER ';'
        case NodeName.TypeDef:
            return [];

        // **BNF** FUNC ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER ['<' TYPE {',' TYPE} '>'] PARAMLIST [LISTPATTERN] ['const'] FUNCATTR (';' | STATBLOCK)
        case NodeName.Func:
            return [
                ...children(node.head.tag === 'function' ? node.head.returnType : undefined),
                ...node.typeParameters,
                node.paramList,
                ...children(node.statBlock, node.listPattern)
            ];

        // **BNF** FUNCATTR ::= {'override' | 'final' | 'explicit' | 'property' | 'delete' | 'nodiscard'}
        // n/a

        // **BNF** LISTPATTERN ::= '{' LISTENTRY {',' LISTENTRY} '}'
        case NodeName.ListPattern:
            return node.entries;

        // **BNF** LISTENTRY ::= (('repeat' | 'repeat_same') (('{' LISTENTRY '}') | TYPE)) | (TYPE {',' TYPE})
        case NodeName.ListEntry:
            if (node.entryPattern === 1) {
                return children(node.entry);
            }

            return node.typeList;

        // **BNF** INTERFACE ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTUALPROP | INTERFACEMETHOD} '}'))
        case NodeName.Interface:
            return [...node.baseList.flatMap(base => children(base.scope)), ...node.memberList];

        // **BNF** VAR ::= ['private' | 'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
        case NodeName.Var:
            return [node.type, ...node.variables.flatMap(variable => children(variable.initializer))];

        // **BNF** IMPORT ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
        case NodeName.Import:
            return [node.type, node.paramList];

        // **BNF** FUNCDEF ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
        case NodeName.FuncDef:
            return [node.returnType, node.paramList];

        // **BNF** VIRTUALPROP ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
        case NodeName.VirtualProp:
            return children(node.type, node.getter?.statBlock, node.setter?.statBlock);

        // **BNF** INTERFACEMETHOD ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] FUNCATTR ';'
        case NodeName.InterfaceMethod:
            return [node.returnType, node.paramList];

        // **BNF** STATBLOCK ::= '{' {VAR | STATEMENT | USING} '}'
        case NodeName.StatBlock:
            return node.statementList;

        // **BNF** PARAMLIST ::= '(' ['void' | (PARAMETER {',' PARAMETER})] ')'
        case NodeName.ParamList:
            return node.params;

        // **BNF** PARAMETER ::= TYPE TYPEMODIFIER [IDENTIFIER] ['...' | ('=' (EXPR | 'void'))]
        case NodeName.Parameter:
            return children(node.type, node.defaultExpr === voidParameter ? undefined : node.defaultExpr);

        // **BNF** TYPEMODIFIER ::= ['&' ['in' | 'out' | 'inout'] ['+'] ['if_handle_then_const']]
        // n/a

        // **BNF** TYPE ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
        case NodeName.Type:
            return children(node.scope, node.dataType, ...node.typeArguments);

        // **BNF** INITLIST ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
        case NodeName.InitList:
            return node.initList;

        // **BNF** SCOPE ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
        case NodeName.Scope:
            return node.typeArguments;

        // **BNF** DATATYPE ::= (IDENTIFIER | PRIMITIVETYPE | '?' | 'auto')
        case NodeName.DataType:
            return [];

        // **BNF** PRIMITIVETYPE ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
        // n/a

        // **BNF** STATEMENT ::= (IF | FOR | FOREACH | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
        // n/a

        // **BNF** SWITCH ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
        case NodeName.Switch:
            return [node.assign, ...node.caseList];

        // **BNF** BREAK ::= 'break' ';'
        case NodeName.Break:
            return [];

        // **BNF** FOR ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
        case NodeName.For:
            return children(node.initial, node.condition, ...node.incrementList, node.statement);

        // **BNF** FOREACH ::= 'foreach' '(' TYPE IDENTIFIER {',' TYPE IDENTIFIER} ':' ASSIGN ')' STATEMENT
        case NodeName.ForEach:
            return children(...node.variables.map(variable => variable.type), node.assign, node.statement);

        // **BNF** WHILE ::= 'while' '(' ASSIGN ')' STATEMENT
        case NodeName.While:
            return children(node.assign, node.statement);

        // **BNF** DOWHILE ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
        case NodeName.DoWhile:
            return children(node.statement, node.assign);

        // **BNF** IF ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
        case NodeName.If:
            return children(node.condition, node.thenStat, node.elseStat);

        // **BNF** CONTINUE ::= 'continue' ';'
        case NodeName.Continue:
            return [];

        // **BNF** EXPRSTAT ::= [ASSIGN] ';'
        case NodeName.ExprStat:
            return children(node.assign);

        // **BNF** TRY ::= 'try' STATBLOCK 'catch' STATBLOCK
        case NodeName.Try:
            return children(node.tryBlock, node.catchBlock);

        // **BNF** RETURN ::= 'return' [ASSIGN] ';'
        case NodeName.Return:
            return children(node.assign);

        // **BNF** CASE ::= (('case' EXPR) | 'default') ':' {STATEMENT}
        case NodeName.Case:
            return children(node.expr, ...node.statementList);

        // **BNF** EXPR ::= EXPRTERM {EXPROP EXPRTERM}
        case NodeName.Expr:
            return children(node.head, node.tail?.expr);

        // **BNF** EXPRTERM ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
        case NodeName.ExprTerm:
            if (node.exprTerm === 1) {
                return children(node.type, node.initList);
            }

            return children(node.value, ...node.postOps);

        // **BNF** EXPRVALUE ::= 'void' | CONSTRUCTORCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
        // n/a

        // **BNF** CONSTRUCTORCALL ::= TYPE ARGLIST
        case NodeName.ConstructorCall:
            return [node.type, node.argList];

        // **BNF** EXPRPREOP ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'
        // n/a

        // **BNF** EXPRPOSTOP ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ']') | ARGLIST | '++' | '--'
        case NodeName.ExprPostOp:
            if (node.postOpPattern === 1) {
                return node.member?.access === 'method' ? [node.member.node] : [];
            }

            if (node.postOpPattern === 2) {
                return node.indexingList.map(indexing => indexing.assign);
            }

            if (node.postOpPattern === 3) {
                return [node.args];
            }

            return [];

        // **BNF** CAST ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
        case NodeName.Cast:
            return [node.type, node.assign];

        // **BNF** LAMBDA ::= 'function' '(' [LAMBDAPARAM {',' LAMBDAPARAM}] ')' STATBLOCK
        case NodeName.Lambda:
            return children(...node.paramList, node.statBlock);

        // **BNF** LAMBDAPARAM ::= [TYPE TYPEMODIFIER] [IDENTIFIER]
        case NodeName.LambdaParam:
            return children(node.type);

        // **BNF** LITERAL ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
        case NodeName.Literal:
            return [];

        // **BNF** FUNCCALL ::= SCOPE IDENTIFIER ['<' TYPE {',' TYPE} '>'] ARGLIST
        case NodeName.FuncCall:
            return children(node.scope, node.argList, ...(node.typeArguments ?? []));

        // **BNF** VARACCESS ::= SCOPE IDENTIFIER
        case NodeName.VarAccess:
            return children(node.scope);

        // **BNF** ARGLIST ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
        case NodeName.ArgList:
            return node.argList.map(arg => arg.assign);

        // **BNF** ASSIGN ::= CONDITION [ ASSIGNOP ASSIGN ]
        case NodeName.Assign:
            return children(node.condition, node.tail?.assign);

        // **BNF** CONDITION ::= EXPR ['?' ASSIGN ':' ASSIGN]
        case NodeName.Condition:
            return children(node.expr, node.ternary?.trueAssign, node.ternary?.falseAssign);
    }
}

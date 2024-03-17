// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_expressions.html

import {
    NodeARGLIST,
    NodeASSIGN, NodeCASE, NodeCLASS, NodeCONDITION, NodeDOWHILE,
    NodeEXPR, NodeEXPRSTAT,
    NodeEXPRTERM,
    NodeEXPRTERM1,
    NodeEXPRTERM2, NodeEXPRVALUE, NodeFOR,
    NodeFUNC, NodeIF, NodePARAMLIST, NodeRETURN,
    NodeSCRIPT,
    NodeSTATBLOCK, NodeSTATEMENT, NodeSWITCH,
    NodeVAR, NodeVARACCESS, NodeWHILE
} from "./nodes";
import {findSymbolWithParent, SymbolicFunction, SymbolicType, SymbolicVariable, SymbolScope} from "./symbolics";
import {diagnostic} from "../code/diagnostic";

type AnalyzeQueue = {
    classQueue: { scope: SymbolScope, node: NodeCLASS }[],
    funcQueue: { scope: SymbolScope, node: NodeFUNC }[],
};

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
function forwardSCRIPT(queue: AnalyzeQueue, parentScope: SymbolScope, ast: NodeSCRIPT) {
    // 宣言分析
    for (const statement of ast) {
        const nodeName = statement.nodeName;
        if (nodeName === 'CLASS') {
            forwardCLASS(queue, parentScope, statement);
        } else if (nodeName === 'FUNC') {
            forwardFUNC(queue, parentScope, statement);
        }
    }
}

function analyzeSCRIPT(queue: AnalyzeQueue, scriptScope: SymbolScope, ast: NodeSCRIPT) {
    // 実装分析
    for (const func of queue.funcQueue) {
        analyzeFUNC(func.scope, func.node);
    }
}

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
function forwardCLASS(queue: AnalyzeQueue, parentScope: SymbolScope, ast: NodeCLASS) {
    const symbol: SymbolicType = {
        symbolKind: 'type',
        bases: [],
        declare: ast.identifier,
        usage: [],
    };
    const scope: SymbolScope = {
        parentScope: parentScope,
        childScopes: [],
        symbols: [symbol],
    };
    parentScope.childScopes.push(scope);
    parentScope.symbols.push(symbol);
    queue.classQueue.push({scope, node: ast});

    for (const member of ast.members) {
        if (member.nodeName === 'VIRTPROP') {
            // TODO
        } else if (member.nodeName === 'FUNC') {
            forwardFUNC(queue, scope, member);
        } else if (member.nodeName === 'VAR') {
            // TODO
        }
    }

}

// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
function forwardFUNC(queue: AnalyzeQueue, parentScope: SymbolScope, ast: NodeFUNC) {
    if (ast.head === '~') return;
    const symbol: SymbolicFunction = {
        symbolKind: 'function',
        args: ast.paramList,
        returnType: ast.head.returnType,
        declare: ast.identifier,
        usage: [],
    };
    const scope: SymbolScope = {
        parentScope: parentScope,
        childScopes: [],
        symbols: [symbol],
    };
    parentScope.childScopes.push(scope);
    parentScope.symbols.push(symbol);
    queue.funcQueue.push({scope, node: ast});
}

function analyzeFUNC(scope: SymbolScope, ast: NodeFUNC) {
    if (ast.head === '~') {
        analyzeSTATBLOCK(scope, ast.statBlock);
        return;
    }

    // 引数をスコープに追加
    analyzePARAMLIST(scope, ast.paramList);

    // スコープ分析
    analyzeSTATBLOCK(scope, ast.statBlock);
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST]} ';'
function analyzeVAR(scope: SymbolScope, ast: NodeVAR) {
    for (const var_ of ast.variables) {
        const initializer = var_.initializer;
        if (initializer !== null) {
            if (initializer.nodeName === 'EXPR') analyzeEXPR(scope, initializer);
            if (initializer.nodeName === 'ARGLIST') analyzeARGLIST(scope, initializer);
        }
        const variable: SymbolicVariable = {
            symbolKind: 'variable',
            type: ast.type,
            declare: var_.identifier,
            usage: [],
        };
        scope.symbols.push(variable);
    }
}

// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
// MIXIN         ::= 'mixin' CLASS
// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
function analyzeSTATBLOCK(scope: SymbolScope, ast: NodeSTATBLOCK) {
    for (const statement of ast.statements) {
        if (statement.nodeName === 'VAR') {
            analyzeVAR(scope, statement);
        } else {
            analyzeSTATEMENT(scope, statement as NodeSTATEMENT);
        }
    }
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
function analyzePARAMLIST(scope: SymbolScope, ast: NodePARAMLIST) {
    for (const param of ast) {
        if (param.identifier === null) continue;

        if (param.type.datatype.identifier.kind === 'identifier') {
            if (findSymbolWithParent(scope, param.type.datatype.identifier.text, 'type') === null) {
                diagnostic.addError(param.type.datatype.identifier.location, `Undefined type: ${param.type.datatype.identifier.text}`);
            }
        }

        scope.symbols.push({
            symbolKind: 'variable',
            type: param.type,
            declare: param.identifier,
            usage: [],
        });
    }
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]
// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
function analyzeINITLIST(scope: SymbolScope, ast: NodeEXPR) {
    // TODO
}

// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
// PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
// FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property'}

// STATEMENT     ::= (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
function analyzeSTATEMENT(scope: SymbolScope, ast: NodeSTATEMENT) {
    switch (ast.nodeName) {
    case 'IF':
        analyzeIF(scope, ast);
        break;
    case 'FOR':
        analyzeFOR(scope, ast);
        break;
    case 'WHILE':
        analyzeWHILE(scope, ast);
        break;
    case 'RETURN':
        analyzeRETURN(scope, ast);
        break;
    case 'STATBLOCK':
        analyzeSTATBLOCK(scope, ast);
        break;
    case 'BREAK':
        break;
    case 'CONTINUE':
        break;
    case 'DOWHILE':
        analyzeDOWHILE(scope, ast);
        break;
    case 'SWITCH':
        analyzeSWITCH(scope, ast);
        break;
    case 'EXPRSTAT':
        analyzeEXPRSTAT(scope, ast);
        break;
        // case 'TRY':
        //     break;
    default:
        break;
    }
}

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
function analyzeSWITCH(scope: SymbolScope, ast: NodeSWITCH) {
    analyzeASSIGN(scope, ast.assign);
    for (const c of ast.cases) {
        analyzeCASE(scope, c);
    }
}

// BREAK         ::= 'break' ';'

// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
function analyzeFOR(scope: SymbolScope, ast: NodeFOR) {
    if (ast.initial.nodeName === 'VAR') analyzeVAR(scope, ast.initial);
    else analyzeEXPRSTAT(scope, ast.initial);

    analyzeEXPRSTAT(scope, ast.condition);

    for (const inc of ast.increment) {
        analyzeASSIGN(scope, inc);
    }

    analyzeSTATEMENT(scope, ast.statement);
}

// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
function analyzeWHILE(scope: SymbolScope, ast: NodeWHILE) {
    analyzeASSIGN(scope, ast.assign);
    analyzeSTATEMENT(scope, ast.statement);
}

// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
function analyzeDOWHILE(scope: SymbolScope, ast: NodeDOWHILE) {
    analyzeSTATEMENT(scope, ast.statement);
    analyzeASSIGN(scope, ast.assign);
}

// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
function analyzeIF(scope: SymbolScope, ast: NodeIF) {
    analyzeASSIGN(scope, ast.condition);
    analyzeSTATEMENT(scope, ast.ts);
    if (ast.fs !== null) analyzeSTATEMENT(scope, ast.fs);
}

// CONTINUE      ::= 'continue' ';'

// EXPRSTAT      ::= [ASSIGN] ';'
function analyzeEXPRSTAT(scope: SymbolScope, ast: NodeEXPRSTAT) {
    if (ast.assign !== null) analyzeASSIGN(scope, ast.assign);
}

// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK

// RETURN        ::= 'return' [ASSIGN] ';'
function analyzeRETURN(scope: SymbolScope, ast: NodeRETURN) {
    analyzeASSIGN(scope, ast.assign);
}

// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
function analyzeCASE(scope: SymbolScope, ast: NodeCASE) {
    if (ast.expr !== null) analyzeEXPR(scope, ast.expr);
    for (const statement of ast.statements) {
        analyzeSTATEMENT(scope, statement);
    }
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
function analyzeEXPR(scope: SymbolScope, ast: NodeEXPR) {
    analyzeEXPRTERM(scope, ast.head);
    // TODO: 型チェック
    if (ast.tail !== null) analyzeEXPR(scope, ast.tail);
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function analyzeEXPRTERM(scope: SymbolScope, ast: NodeEXPRTERM) {
    if (ast.exprTerm === 1) {
        // TODO
    } else if (ast.exprTerm === 2) {
        analyzeEXPRVALUE(scope, ast.value);
    }
}

// EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
function analyzeEXPRVALUE(scope: SymbolScope, exprValue: NodeEXPRVALUE) {
    if (exprValue.nodeName === 'VARACCESS') {
        const token = exprValue.identifier;
        const declared = findSymbolWithParent(scope, token.text, 'variable');
        if (declared === null) {
            diagnostic.addError(token.location, `Undefined variable: ${token.text}`);
            return;
        }
        declared.usage.push(token);
    }
    if (exprValue.nodeName === 'ASSIGN') {
        analyzeASSIGN(scope, exprValue);
    }
}

// CONSTRUCTCALL ::= TYPE ARGLIST
// EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'
// EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']') | ARGLIST | '++' | '--'
// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
// VARACCESS     ::= SCOPE IDENTIFIER

// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
function analyzeARGLIST(scope: SymbolScope, argList: NodeARGLIST) {
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
function analyzeASSIGN(scope: SymbolScope, assign: NodeASSIGN) {
    analyzeCONDITION(scope, assign.condition);
    if (assign.tail === null) return;
    analyzeASSIGN(scope, assign.tail.assign);
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
export function analyzeCONDITION(scope: SymbolScope, condition: NodeCONDITION) {
    analyzeEXPR(scope, condition.expr);
    if (condition.ternary === null) return;
    analyzeASSIGN(scope, condition.ternary.ta);
    analyzeASSIGN(scope, condition.ternary.fa);
}

export function analyzeFromParsed(ast: NodeSCRIPT) {
    const globalScope: SymbolScope = {
        parentScope: null,
        childScopes: [],
        symbols: [],
    };

    const queue: AnalyzeQueue = {
        classQueue: [],
        funcQueue: [],
    };

    forwardSCRIPT(queue, globalScope, ast);

    analyzeSCRIPT(queue, globalScope, ast);

    return globalScope;
}

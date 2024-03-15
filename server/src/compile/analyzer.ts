// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_expressions.html

import {
    NodeARGLIST,
    NodeASSIGN, NodeCONDITION,
    NodeEXPR,
    NodeEXPRTERM,
    NodeEXPRTERM1,
    NodeEXPRTERM2, NodeEXPRVALUE,
    NodeFUNC, NodeRETURN,
    NodeSCRIPT,
    NodeSTATBLOCK, NodeSTATEMENT,
    NodeVAR, NodeVARACCESS
} from "./nodes";
import {findSymbolWithParent, SymbolicFunction, SymbolicType, SymbolScope} from "./symbolics";
import {diagnostic} from "../code/diagnostic";

type AnalyzeQueue = {
    funcQueue: { scope: SymbolScope, node: NodeFUNC }[],
};

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
function forwardSCRIPT(queue: AnalyzeQueue, scriptScope: SymbolScope, ast: NodeSCRIPT) {
    // 宣言分析
    for (const statement of ast) {
        if (statement.nodeName === 'FUNC') {
            if (statement.head === '~') continue;
            const symbol: SymbolicFunction = {
                args: statement.paramList,
                ret: statement.head.returnType,
                declare: statement.identifier,
                usage: [],
            };
            const scope: SymbolScope = {
                parentScope: scriptScope,
                childScopes: [],
                symbols: [symbol],
            };
            scriptScope.childScopes.push(scope);
            scriptScope.symbols.push(symbol);
            queue.funcQueue.push({scope, node: statement});
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
// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
function analyzeFUNC(scope: SymbolScope, ast: NodeFUNC) {
    if (ast.head === '~') {
        analyzeSTATBLOCK(scope, ast.statBlock);
        return;
    }

    // 引数をスコープに追加
    for (const param of ast.paramList) {
        if (param.identifier === null) continue;
        scope.symbols.push({
            type: param.type,
            declare: param.identifier,
            usage: [],
        });
    }

    // スコープ分析
    analyzeSTATBLOCK(scope, ast.statBlock);
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST]} ';'
function analyzeVAR(scope: SymbolScope, ast: NodeVAR) {
    for (const var_ of ast.variables) {
        const initializer = var_.initializer;
        if (initializer === null) continue;
        else if (initializer.nodeName === 'EXPR') analyzeEXPR(scope, initializer);
        else if (initializer.nodeName === 'ARGLIST') analyzeARGLIST(scope, initializer);
        const variable = {
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
            break;
        case 'FOR':
            break;
        case 'WHILE':
            break;
        case 'RETURN':
            analyzeRETURN(scope, ast);
            break;
        case 'STATBLOCK':
            break;
        case 'BREAK':
            break;
        case 'CONTINUE':
            break;
        case 'DOWHILE':
            break;
        case 'SWITCH':
            break;
        case 'EXPRSTAT':
            break;
        // case 'TRY':
        //     break;
        default:
            break;
    }
}

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
// BREAK         ::= 'break' ';'
// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
// CONTINUE      ::= 'continue' ';'
// EXPRSTAT      ::= [ASSIGN] ';'
// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK

// RETURN        ::= 'return' [ASSIGN] ';'
function analyzeRETURN(scope: SymbolScope, ast: NodeRETURN) {
    analyzeASSIGN(scope, ast.assign);
}

// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}

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
        const declared = findSymbolWithParent(scope, token);
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
        funcQueue: [],
    };

    forwardSCRIPT(queue, globalScope, ast);

    analyzeSCRIPT(queue, globalScope, ast);

    return globalScope;
}


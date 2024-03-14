// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_expressions.html

import {
    NodeASSIGN,
    NodeEXPR,
    NodeEXPRTERM,
    NodeEXPRTERM1,
    NodeEXPRTERM2, NodeEXPRVALUE,
    NodeFUNC,
    NodeSCRIPT,
    NodeSTATBLOCK, NodeSTATEMENT,
    NodeVAR, NodeVARACCESS
} from "./nodes";
import {findSymbolWithParent, SymbolicFunction, SymbolicType, SymbolScope} from "./symbolics";
import {diagnostic} from "../code/diagnostic";

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
function analyzeSCRIPT(globalScope: SymbolScope, ast: NodeSCRIPT) {
    const funcScopes: [SymbolScope, NodeFUNC][] = [];

    // 宣言分析
    for (const statement of ast) {
        if (statement.nodeName === 'FUNC') {
            if (statement.returnType === null) continue;
            const symbol: SymbolicFunction = {
                args: statement.paramList,
                ret: statement.returnType,
                declare: statement.identifier,
                usage: [],
            };
            const scope: SymbolScope = {
                parentScope: globalScope,
                childScopes: [],
                symbols: [symbol],
            };
            globalScope.childScopes.push(scope);
            globalScope.symbols.push(symbol);
            funcScopes.push([scope, statement]);
        }
    }

    // 実装分析
    for (const [scope, func] of funcScopes) {
        analyzeFUNC(scope, func);
    }
}

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
function analyzeFUNC(scope: SymbolScope, ast: NodeFUNC) {
    if (ast.returnType === null) return;

    // 引数をスコープに追加
    for (const [type, identifier] of ast.paramList) {
        if (identifier === null) continue;
        scope.symbols.push({
            type: type,
            declare: identifier,
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
        analyzeEXPR(scope, initializer);
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
// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
// PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
// FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property'}

// STATEMENT     ::= (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
function analyzeSTATEMENT(scope: SymbolScope, ast: NodeSTATEMENT) {
    // TODO
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
    } else {
        const exprterm = ast as NodeEXPRTERM2;
        analyzeEXPRVALUE(scope, exprterm.value);
    }
}

// EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
function analyzeEXPRVALUE(scope: SymbolScope, exprvalue: NodeEXPRVALUE) {
    if (exprvalue.nodeName === 'VARACCESS') {
        const token = exprvalue.identifier;
        const declared = findSymbolWithParent(scope, token);
        if (declared === null) {
            diagnostic.addError(token.location, `Undefined variable: ${token.text}`);
            return;
        }
        declared.usage.push(token);
    }
    if (exprvalue.nodeName === 'ASSIGN') {
        analyzeASSIGN(scope, exprvalue);
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

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
function analyzeASSIGN(scope: SymbolScope, assign: NodeASSIGN) {
    // TODO
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]

export function analyzeFromParsed(ast: NodeSCRIPT) {
    const globalScope: SymbolScope = {
        parentScope: null,
        childScopes: [],
        symbols: [],
    };

    analyzeSCRIPT(globalScope, ast);

    return globalScope;
}


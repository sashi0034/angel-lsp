// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_expressions.html

import {
    NodeARGLIST,
    NodeASSIGN, NodeCASE, NodeCLASS, NodeCONDITION, NodeDOWHILE,
    NodeEXPR, NodeEXPRPOSTOP, NodeEXPRSTAT,
    NodeEXPRTERM,
    NodeEXPRTERM1,
    NodeEXPRTERM2, NodeEXPRVALUE, NodeFOR,
    NodeFUNC, NodeFUNCCALL, NodeIF, NodeLITERAL, NodePARAMLIST, NodeRETURN,
    NodeSCRIPT,
    NodeSTATBLOCK, NodeSTATEMENT, NodeSWITCH, NodeTYPE,
    NodeVAR, NodeVARACCESS, NodeWHILE
} from "./nodes";
import {
    builtinBoolType,
    builtinNumberType, builtinVoidType,
    findSymbolicFunctionWithParent,
    findSymbolicTypeWithParent, findSymbolicVariableWithParent,
    SymbolicFunction,
    SymbolicType,
    SymbolicVariable,
    SymbolScope
} from "./symbolics";
import {diagnostic} from "../code/diagnostic";
import {EssentialToken} from "./token";

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
        declaredPlace: ast.identifier,
        usageList: [],
        node: ast,
    };
    const scope: SymbolScope = {
        parentScope: parentScope,
        childScopes: [],
        symbolList: [symbol],
    };
    parentScope.childScopes.push(scope);
    parentScope.symbolList.push(symbol);
    queue.classQueue.push({scope, node: ast});

    for (const member of ast.memberList) {
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
        declaredPlace: ast.identifier,
        usageList: [],
        node: ast,
    };
    const scope: SymbolScope = {
        parentScope: parentScope,
        childScopes: [],
        symbolList: [symbol],
    };
    parentScope.childScopes.push(scope);
    parentScope.symbolList.push(symbol);
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
    const type = analyzeTYPE(scope, ast.type);
    for (const var_ of ast.variables) {
        const initializer = var_.initializer;
        if (initializer !== undefined) {
            if (initializer.nodeName === 'EXPR') analyzeEXPR(scope, initializer);
            if (initializer.nodeName === 'ARGLIST') analyzeARGLIST(scope, initializer);
        }
        const variable: SymbolicVariable = {
            symbolKind: 'variable',
            type: type,
            declaredPlace: var_.identifier,
            usageList: [],
        };
        scope.symbolList.push(variable);
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
        if (param.identifier === undefined) continue;

        const type = analyzeTYPE(scope, param.type);

        scope.symbolList.push({
            symbolKind: 'variable',
            type: type,
            declaredPlace: param.identifier,
            usageList: [],
        });
    }
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
function analyzeTYPE(scope: SymbolScope, ast: NodeTYPE): SymbolicType | undefined {
    const found = findSymbolicTypeWithParent(scope, ast.datatype.identifier);
    if (found !== undefined) {
        found.usageList.push(ast.datatype.identifier);
        return found;
    }
    diagnostic.addError(ast.datatype.identifier.location, `Undefined type: ${ast.datatype.identifier.text}`);
}

function isTypeMatch(src: SymbolicType, dest: SymbolicType) {
    const srcNode = src.node;
    if (srcNode === 'void') {
        return false;
    }
    if (srcNode === 'number') {
        return dest.node === 'number';
    }
    if (srcNode === 'bool') {
        return dest.node === 'bool';
    }
    // TODO : 継承などに対応
    if (srcNode.nodeName === 'CLASS') {
        if (typeof (dest.node) === 'string' || dest.node.nodeName !== 'CLASS') {
            return false;
        }
        return srcNode.identifier.text === dest.node.identifier.text;
    }

    return false;
}

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
    if (ast.fs !== undefined) analyzeSTATEMENT(scope, ast.fs);
}

// CONTINUE      ::= 'continue' ';'

// EXPRSTAT      ::= [ASSIGN] ';'
function analyzeEXPRSTAT(scope: SymbolScope, ast: NodeEXPRSTAT) {
    if (ast.assign !== undefined) analyzeASSIGN(scope, ast.assign);
}

// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK

// RETURN        ::= 'return' [ASSIGN] ';'
function analyzeRETURN(scope: SymbolScope, ast: NodeRETURN) {
    analyzeASSIGN(scope, ast.assign);
}

// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
function analyzeCASE(scope: SymbolScope, ast: NodeCASE) {
    if (ast.expr !== undefined) analyzeEXPR(scope, ast.expr);
    for (const statement of ast.statements) {
        analyzeSTATEMENT(scope, statement);
    }
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
function analyzeEXPR(scope: SymbolScope, ast: NodeEXPR): SymbolicType | undefined {
    const lhs = analyzeEXPRTERM(scope, ast.head);
    // TODO: 型チェック
    if (ast.tail !== undefined) {
        const rhs = analyzeEXPR(scope, ast.tail);
        // if (lhs !== undefined && rhs !== undefined) checkTypeMatch(lhs, rhs);
    }
    return lhs;
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function analyzeEXPRTERM(scope: SymbolScope, ast: NodeEXPRTERM): SymbolicType | undefined {
    if (ast.exprTerm === 1) {
        // TODO
    } else if (ast.exprTerm === 2) {
        return analyzeEXPRTERM2(scope, ast);
    }
    return undefined;
}

function analyzeEXPRTERM2(scope: SymbolScope, exprTerm: NodeEXPRTERM2) {
    const exprValue = analyzeEXPRVALUE(scope, exprTerm.value);
    if (exprTerm.postOp !== undefined && exprValue !== undefined) {
        analyzeEXPRPOSTOP(scope, exprTerm.postOp, exprValue);
    }
    return exprValue;
}

// EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
function analyzeEXPRVALUE(scope: SymbolScope, exprValue: NodeEXPRVALUE): SymbolicType | undefined {
    switch (exprValue.nodeName) {
    case 'CONSTRUCTCALL':
        break;
    case 'FUNCCALL':
        return analyzeFUNCCALL(scope, exprValue);
    case 'VARACCESS':
        return analyzeVARACCESS(scope, exprValue);
    case 'CAST':
        break;
    case 'LITERAL':
        return analyzeLITERAL(scope, exprValue);
    case 'ASSIGN':
        analyzeASSIGN(scope, exprValue);
        break;
    case 'LAMBDA':
        break;
    default:
        break;
    }
    return undefined;
}

// CONSTRUCTCALL ::= TYPE ARGLIST
// EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']') | ARGLIST | '++' | '--'
function analyzeEXPRPOSTOP(scope: SymbolScope, exprPostOp: NodeEXPRPOSTOP, exprValue: SymbolicType) {
    if (exprPostOp.postOp === 1) {
        if ("nodeName" in exprPostOp.member) {
            if (typeof (exprValue.node) === 'string' || exprValue.node.nodeName !== 'CLASS') {
                diagnostic.addError(exprPostOp.member.identifier.location, `Undefined member: ${exprPostOp.member.identifier.text}`);
                return undefined;
            }

            const method = findMethodInClass(exprValue.node, exprPostOp.member.identifier.text);
            if (method === undefined) {
                diagnostic.addError(exprPostOp.member.identifier.location, `Undefined method: ${exprPostOp.member.identifier.text}`);
                return undefined;
            }

            // analyzeFunctionCall(scope, exprPostOp.member, method);
        } else {
            // TODO
        }
    }
}

function findMethodInClass(nodeClass: NodeCLASS, identifier: string): NodeFUNC | undefined {
    for (const member of nodeClass.memberList) {
        if (member.nodeName === 'FUNC' && member.identifier.text === identifier) {
            return member;
        }
    }
    return undefined;
}

// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
function analyzeLITERAL(scope: SymbolScope, literal: NodeLITERAL): SymbolicType | undefined {
    if (literal.value.kind === 'number') {
        return builtinNumberType;
    }
    const literalText = literal.value.text;
    if (literalText === 'true' || literalText === 'false') {
        return builtinBoolType;
    }
    // TODO
    return undefined;
}

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
function analyzeFUNCCALL(scope: SymbolScope, funcCall: NodeFUNCCALL): SymbolicType | undefined {
    const calleeFunc = findSymbolicFunctionWithParent(scope, funcCall.identifier.text);
    if (calleeFunc === undefined) {
        diagnostic.addError(funcCall.identifier.location, `Undefined function: ${funcCall.identifier.text}`);
        return undefined;
    }
    return analyzeFunctionCall(scope, funcCall, calleeFunc);
}

function analyzeFunctionCall(scope: SymbolScope, funcCall: NodeFUNCCALL, calleeFunc: SymbolicFunction) {
    const head = calleeFunc.node.head;
    const returnType = head !== '~' ? analyzeTYPE(scope, head.returnType) : undefined;
    calleeFunc.usageList.push(funcCall.identifier);
    const argTypes = analyzeARGLIST(scope, funcCall.argList);
    if (argTypes.length === calleeFunc.node.paramList.length) {
        for (let i = 0; i < argTypes.length; i++) {
            const actualType = argTypes[i];
            const expectedType = findSymbolicTypeWithParent(scope, calleeFunc.node.paramList[i].type.datatype.identifier);
            if (actualType === undefined || expectedType === undefined) continue;
            if (isTypeMatch(actualType, expectedType) === false) {
                diagnostic.addError(funcCall.identifier.location, `Argument type mismatch: ${funcCall.identifier.text}`);
            }
        }
    } else {
        diagnostic.addError(funcCall.identifier.location, `Argument count mismatch: ${funcCall.identifier.text}`);
    }
    return returnType;
}

// VARACCESS     ::= SCOPE IDENTIFIER
function analyzeVARACCESS(scope: SymbolScope, varAccess: NodeVARACCESS): SymbolicType | undefined {
    const token = varAccess.identifier;
    const declared = findSymbolicVariableWithParent(scope, token.text);
    if (declared === undefined) {
        diagnostic.addError(token.location, `Undefined variable: ${token.text}`);
        return undefined;
    }
    declared.usageList.push(token);
    return declared.type;
}

// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
function analyzeARGLIST(scope: SymbolScope, argList: NodeARGLIST): (SymbolicType | undefined)[] {
    const types: (SymbolicType | undefined)[] = [];
    for (const arg of argList.args) {
        types.push(analyzeASSIGN(scope, arg.assign));
    }
    return types;
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
function analyzeASSIGN(scope: SymbolScope, assign: NodeASSIGN): SymbolicType | undefined {
    const lhs = analyzeCONDITION(scope, assign.condition);
    if (assign.tail === undefined) return lhs;
    const rhs = analyzeASSIGN(scope, assign.tail.assign);
    // if (lhs !== undefined && rhs !== undefined) checkTypeMatch(lhs, rhs);
    return lhs;
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
export function analyzeCONDITION(scope: SymbolScope, condition: NodeCONDITION): SymbolicType | undefined {
    const exprType = analyzeEXPR(scope, condition.expr);
    if (condition.ternary === undefined) return exprType;
    const ta = analyzeASSIGN(scope, condition.ternary.ta);
    const fa = analyzeASSIGN(scope, condition.ternary.fa);
    // if (ta !== undefined && fa !== undefined) checkTypeMatch(ta, fa);
    return ta;
}

export function analyzeFromParsed(ast: NodeSCRIPT) {
    const globalScope: SymbolScope = {
        parentScope: undefined,
        childScopes: [],
        symbolList: [],
    };

    const queue: AnalyzeQueue = {
        classQueue: [],
        funcQueue: [],
    };

    forwardSCRIPT(queue, globalScope, ast);

    analyzeSCRIPT(queue, globalScope, ast);

    return globalScope;
}

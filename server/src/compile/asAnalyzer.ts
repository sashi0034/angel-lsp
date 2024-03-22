// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_expressions.html

import {
    getNextTokenIfExist,
    getNodeLocation,
    NodeArgList,
    NodeAssign,
    NodeCASE,
    NodeClass,
    NodeCondition,
    NodeDOWHILE,
    NodeEXPR,
    NodeExprPostOp,
    NodeExprPostOp1,
    NodeEXPRSTAT,
    NodeEXPRTERM,
    NodeEXPRTERM1,
    NodeEXPRTERM2,
    NodeExprValue,
    NodeFOR,
    NodeFunc,
    NodeFuncCall,
    NodeIF,
    NodeLiteral, NodeNamespace,
    NodeParamList,
    NodeRETURN, NodeScope,
    NodeScript, NodesRange,
    NodeStatBlock,
    NodeStatement,
    NodeSWITCH,
    NodeType,
    NodeVar,
    NodeVarAccess,
    NodeWHILE
} from "./asNodes";
import {
    builtinBoolType,
    builtinNumberType,
    builtinVoidType, createSymbolScope,
    DeducedType,
    findClassScopeWithParent, findGlobalScope, findNamespaceScope, findNamespaceScopeWithParent,
    findSymbolicFunctionWithParent,
    findSymbolicTypeWithParent,
    findSymbolicVariableWithParent,
    SymbolicFunction,
    SymbolicType,
    SymbolicVariable,
    SymbolScope
} from "./asSymbolic";
import {diagnostic} from "../code/diagnostic";
import {Range} from "vscode-languageserver";

type AnalyzeQueue = {
    classQueue: { scope: SymbolScope, node: NodeClass }[],
    funcQueue: { scope: SymbolScope, node: NodeFunc }[],
};

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
function forwardSCRIPT(queue: AnalyzeQueue, parentScope: SymbolScope, ast: NodeScript) {
    // 宣言分析
    for (const statement of ast) {
        const nodeName = statement.nodeName;
        if (nodeName === 'CLASS') {
            forwardCLASS(queue, parentScope, statement);
        } else if (nodeName === 'FUNC') {
            forwardFUNC(queue, parentScope, statement);
        } else if (nodeName === 'NAMESPACE') {
            forwardNAMESPACE(queue, parentScope, statement);
        }
    }
}

function analyzeSCRIPT(queue: AnalyzeQueue, scriptScope: SymbolScope, ast: NodeScript) {
    // 実装分析
    for (const func of queue.funcQueue) {
        analyzeFUNC(func.scope, func.node);
    }
}

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
function forwardNAMESPACE(queue: AnalyzeQueue, parentScope: SymbolScope, namespace_: NodeNamespace) {
    if (namespace_.namespaceList.length === 0) return;

    let scopeIterator = parentScope;
    for (let i = 0; i < namespace_.namespaceList.length; i++) {
        const nextNamespace = namespace_.namespaceList[i];
        const existing = findNamespaceScope(parentScope, nextNamespace.text);
        if (existing === undefined) {
            const newScope: SymbolScope = createSymbolScope(nextNamespace, parentScope);
            scopeIterator.childScopes.push(newScope);
            scopeIterator = newScope;
        } else {
            scopeIterator = existing;
        }
    }

    forwardSCRIPT(queue, scopeIterator, namespace_.script);
}

// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
function forwardCLASS(queue: AnalyzeQueue, parentScope: SymbolScope, class_: NodeClass) {
    const symbol: SymbolicType = {
        symbolKind: 'type',
        declaredPlace: class_.identifier,
        usageList: [],
        sourceNode: class_,
    };
    const scope: SymbolScope = createSymbolScope(class_, parentScope);
    scope.symbolList.push(symbol);

    parentScope.childScopes.push(scope);
    parentScope.symbolList.push(symbol);
    queue.classQueue.push({scope, node: class_});

    for (const member of class_.memberList) {
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
function forwardFUNC(queue: AnalyzeQueue, parentScope: SymbolScope, func: NodeFunc) {
    if (func.head === '~') return;
    const symbol: SymbolicFunction = {
        symbolKind: 'function',
        declaredPlace: func.identifier,
        usageList: [],
        sourceNode: func,
    };
    const scope: SymbolScope = createSymbolScope(func, parentScope);
    scope.symbolList.push(symbol);

    parentScope.childScopes.push(scope);
    parentScope.symbolList.push(symbol);
    queue.funcQueue.push({scope, node: func});
}

function analyzeFUNC(scope: SymbolScope, ast: NodeFunc) {
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
function analyzeVar(scope: SymbolScope, ast: NodeVar) {
    const type = analyzeTYPE(scope, ast.type);
    for (const var_ of ast.variables) {
        const initializer = var_.initializer;
        if (initializer !== undefined) {
            if (initializer.nodeName === 'EXPR') analyzeEXPR(scope, initializer);
            if (initializer.nodeName === 'ARGLIST') analyzeArgList(scope, initializer);
        }
        const variable: SymbolicVariable = {
            symbolKind: 'variable',
            type: type?.symbol,
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
function analyzeSTATBLOCK(scope: SymbolScope, ast: NodeStatBlock) {
    for (const statement of ast.statements) {
        if (statement.nodeName === 'VAR') {
            analyzeVar(scope, statement);
        } else {
            analyzeSTATEMENT(scope, statement as NodeStatement);
        }
    }
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
function analyzePARAMLIST(scope: SymbolScope, ast: NodeParamList) {
    for (const param of ast) {
        if (param.identifier === undefined) continue;

        const type = analyzeTYPE(scope, param.type);

        scope.symbolList.push({
            symbolKind: 'variable',
            type: type?.symbol,
            declaredPlace: param.identifier,
            usageList: [],
        });
    }
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
function analyzeTYPE(scope: SymbolScope, ast: NodeType): DeducedType | undefined {
    if (ast.scope !== undefined) analyzeScope(scope, ast.scope);
    const found = findSymbolicTypeWithParent(scope, ast.datatype.identifier);
    if (found !== undefined) {
        found.usageList.push(ast.datatype.identifier);
        return {symbol: found};
    }
    diagnostic.addError(ast.datatype.identifier.location, `Undefined type: ${ast.datatype.identifier.text}`);
}

function isTypeMatch(src: DeducedType, dest: DeducedType) {
    const srcType = src.symbol;
    const destType = dest.symbol;
    const srcNode = srcType.sourceNode;
    if (srcNode === 'void') {
        return false;
    }
    if (srcNode === 'number') {
        return destType.sourceNode === 'number';
    }
    if (srcNode === 'bool') {
        return destType.sourceNode === 'bool';
    }
    // TODO : 継承などに対応
    if (srcNode.nodeName === 'CLASS') {
        if (typeof (destType.sourceNode) === 'string' || destType.sourceNode.nodeName !== 'CLASS') {
            return false;
        }
        return srcNode.identifier.text === destType.sourceNode.identifier.text;
    }

    return false;
}

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
function analyzeINITLIST(scope: SymbolScope, ast: NodeEXPR) {
    // TODO
}

// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
function analyzeScope(symbolScope: SymbolScope, nodeScope: NodeScope): SymbolScope | undefined {
    let scopeIterator = symbolScope;
    if (nodeScope.isGlobal) {
        scopeIterator = findGlobalScope(symbolScope);
    }
    for (let i = 0; i < nodeScope.namespaceList.length; i++) {
        const nextNamespace = nodeScope.namespaceList[i];

        // 名前空間に対応するスコープを探す
        let found: SymbolScope | undefined = undefined;
        for (; ;) {
            found = findNamespaceScope(scopeIterator, nextNamespace.text);
            if (found !== undefined) break;
            if (i == 0 && scopeIterator.parentScope !== undefined) {
                // グローバルスコープでないなら、上の階層を更に探索
                scopeIterator = scopeIterator.parentScope;
            } else {
                diagnostic.addError(nextNamespace.location, `Undefined namespace: ${nextNamespace.text}`);
                return undefined;
            }
        }

        // スコープを更新
        scopeIterator = found;

        // 名前空間に対する補完を行う
        const complementRange: Range = {start: nextNamespace.location.start, end: nextNamespace.location.end};
        complementRange.end = getNextTokenIfExist(getNextTokenIfExist(nextNamespace)).location.start;
        symbolScope.completionHints.push({
            complementKind: 'Namespace',
            complementRange: complementRange,
            namespaceList: nodeScope.namespaceList.slice(0, i + 1)
        });

    }

    return scopeIterator;
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
// PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
// FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property'}

// STATEMENT     ::= (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
function analyzeSTATEMENT(scope: SymbolScope, ast: NodeStatement) {
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
    analyzeAssign(scope, ast.assign);
    for (const c of ast.cases) {
        analyzeCASE(scope, c);
    }
}

// BREAK         ::= 'break' ';'

// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
function analyzeFOR(scope: SymbolScope, ast: NodeFOR) {
    if (ast.initial.nodeName === 'VAR') analyzeVar(scope, ast.initial);
    else analyzeEXPRSTAT(scope, ast.initial);

    analyzeEXPRSTAT(scope, ast.condition);

    for (const inc of ast.incrementList) {
        analyzeAssign(scope, inc);
    }

    analyzeSTATEMENT(scope, ast.statement);
}

// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
function analyzeWHILE(scope: SymbolScope, ast: NodeWHILE) {
    analyzeAssign(scope, ast.assign);
    analyzeSTATEMENT(scope, ast.statement);
}

// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
function analyzeDOWHILE(scope: SymbolScope, ast: NodeDOWHILE) {
    analyzeSTATEMENT(scope, ast.statement);
    analyzeAssign(scope, ast.assign);
}

// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
function analyzeIF(scope: SymbolScope, ast: NodeIF) {
    analyzeAssign(scope, ast.condition);
    analyzeSTATEMENT(scope, ast.ts);
    if (ast.fs !== undefined) analyzeSTATEMENT(scope, ast.fs);
}

// CONTINUE      ::= 'continue' ';'

// EXPRSTAT      ::= [ASSIGN] ';'
function analyzeEXPRSTAT(scope: SymbolScope, ast: NodeEXPRSTAT) {
    if (ast.assign !== undefined) analyzeAssign(scope, ast.assign);
}

// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK

// RETURN        ::= 'return' [ASSIGN] ';'
function analyzeRETURN(scope: SymbolScope, ast: NodeRETURN) {
    analyzeAssign(scope, ast.assign);
}

// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
function analyzeCASE(scope: SymbolScope, ast: NodeCASE) {
    if (ast.expr !== undefined) analyzeEXPR(scope, ast.expr);
    for (const statement of ast.statementList) {
        analyzeSTATEMENT(scope, statement);
    }
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
function analyzeEXPR(scope: SymbolScope, ast: NodeEXPR): DeducedType | undefined {
    const lhs = analyzeEXPRTERM(scope, ast.head);
    // TODO: 型チェック
    if (ast.tail !== undefined) {
        const rhs = analyzeEXPR(scope, ast.tail.expression);
        // if (lhs !== undefined && rhs !== undefined) checkTypeMatch(lhs, rhs);
    }
    return lhs;
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function analyzeEXPRTERM(scope: SymbolScope, ast: NodeEXPRTERM): DeducedType | undefined {
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
        analyzeExprPostOp(scope, exprTerm.postOp, exprValue.symbol);
    }
    return exprValue;
}

// EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
function analyzeEXPRVALUE(scope: SymbolScope, exprValue: NodeExprValue): DeducedType | undefined {
    switch (exprValue.nodeName) {
    case 'CONSTRUCTCALL':
        break;
    case 'FUNCCALL':
        return analyzeFuncCall(scope, exprValue);
    case 'VARACCESS':
        return analyzeVarAccess(scope, exprValue);
    case 'CAST':
        break;
    case 'LITERAL':
        return analyzeLITERAL(scope, exprValue);
    case 'ASSIGN':
        analyzeAssign(scope, exprValue);
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
function analyzeExprPostOp(scope: SymbolScope, exprPostOp: NodeExprPostOp, exprValue: SymbolicType) {
    if (exprPostOp.postOp === 1) {
        return analyzeExprPostOp1(scope, exprPostOp, exprValue);
    }
}

function analyzeExprPostOp1(scope: SymbolScope, exprPostOp: NodeExprPostOp1, exprValue: SymbolicType) {
    const complementRange = getNodeLocation(exprPostOp.nodeRange);

    // メンバが存在しない場合は、次のトークンまでを補完範囲とする
    if (exprPostOp.member === undefined) {
        complementRange.end = getNextTokenIfExist(exprPostOp.nodeRange.end).location.start;
    }

    // クラスメンバ補完
    scope.completionHints.push({
        complementKind: 'Type',
        complementRange: complementRange,
        targetType: exprValue
    });

    if (exprPostOp.member === undefined) return undefined;

    if ('nodeName' in exprPostOp.member) {
        // メソッド診断
        if (typeof (exprValue.sourceNode) === 'string' || exprValue.sourceNode.nodeName !== 'CLASS') {
            diagnostic.addError(exprPostOp.member.identifier.location, `Undefined member: ${exprPostOp.member.identifier.text}`);
            return undefined;
        }

        const classScope = findClassScopeWithParent(scope, exprValue.sourceNode.identifier.text);
        if (classScope === undefined) {
            diagnostic.addError(exprPostOp.member.identifier.location, `Undefined class: ${exprValue.sourceNode.identifier.text}`);
            return undefined;
        }

        return analyzeFuncCall(classScope, exprPostOp.member);
    } else {
        // フィールド診断
        // TODO
    }
}

// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
function analyzeLITERAL(scope: SymbolScope, literal: NodeLiteral): DeducedType | undefined {
    if (literal.value.kind === 'number') {
        return {symbol: builtinNumberType};
    }
    const literalText = literal.value.text;
    if (literalText === 'true' || literalText === 'false') {
        return {symbol: builtinBoolType};
    }
    // TODO
    return undefined;
}

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
function analyzeFuncCall(scope: SymbolScope, funcCall: NodeFuncCall): DeducedType | undefined {
    if (funcCall.scope !== undefined) {
        const namespaceScope = analyzeScope(scope, funcCall.scope);
        if (namespaceScope === undefined) return undefined;
        scope = namespaceScope;
    }
    const calleeFunc = findSymbolicFunctionWithParent(scope, funcCall.identifier.text);
    if (calleeFunc === undefined) {
        diagnostic.addError(funcCall.identifier.location, `Undefined function: ${funcCall.identifier.text}`);
        return undefined;
    }
    return analyzeFunctionCall(scope, funcCall, calleeFunc);
}

function analyzeFunctionCall(scope: SymbolScope, funcCall: NodeFuncCall, calleeFunc: SymbolicFunction) {
    const head = calleeFunc.sourceNode.head;
    const returnType = head !== '~' ? analyzeTYPE(scope, head.returnType) : undefined;
    calleeFunc.usageList.push(funcCall.identifier);
    const argTypes = analyzeArgList(scope, funcCall.argList);
    if (argTypes.length === calleeFunc.sourceNode.paramList.length) {
        for (let i = 0; i < argTypes.length; i++) {
            const actualType = argTypes[i];
            const expectedType = findSymbolicTypeWithParent(scope, calleeFunc.sourceNode.paramList[i].type.datatype.identifier);
            if (actualType === undefined || expectedType === undefined) continue;
            if (isTypeMatch(actualType, {symbol: expectedType}) === false) {
                diagnostic.addError(getNodeLocation(funcCall.argList.args[i].assign.nodeRange), `Argument type mismatch: ${funcCall.identifier.text}`);
            }
        }
    } else {
        diagnostic.addError(funcCall.identifier.location, `Argument count mismatch: ${funcCall.identifier.text}`);
    }
    return returnType;
}

// VARACCESS     ::= SCOPE IDENTIFIER
function analyzeVarAccess(scope: SymbolScope, varAccess: NodeVarAccess): DeducedType | undefined {
    if (varAccess.scope !== undefined) {
        const namespaceScope = analyzeScope(scope, varAccess.scope);
        if (namespaceScope === undefined) return undefined;
        scope = namespaceScope;
    }

    if (varAccess.identifier === undefined) {
        return undefined;
    }

    const token = varAccess.identifier;
    const declared = findSymbolicVariableWithParent(scope, token.text);
    if (declared === undefined) {
        diagnostic.addError(token.location, `Undefined variable: ${token.text}`);
        return undefined;
    }
    declared.usageList.push(token);
    return declared.type === undefined ? undefined : {symbol: declared.type};
}

// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
function analyzeArgList(scope: SymbolScope, argList: NodeArgList): (DeducedType | undefined)[] {
    const types: (DeducedType | undefined)[] = [];
    for (const arg of argList.args) {
        types.push(analyzeAssign(scope, arg.assign));
    }
    return types;
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
function analyzeAssign(scope: SymbolScope, assign: NodeAssign): DeducedType | undefined {
    const lhs = analyzeCondition(scope, assign.condition);
    if (assign.tail === undefined) return lhs;
    const rhs = analyzeAssign(scope, assign.tail.assign);
    // if (lhs !== undefined && rhs !== undefined) checkTypeMatch(lhs, rhs);
    return lhs;
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
export function analyzeCondition(scope: SymbolScope, condition: NodeCondition): DeducedType | undefined {
    const exprType = analyzeEXPR(scope, condition.expr);
    if (condition.ternary === undefined) return exprType;
    const ta = analyzeAssign(scope, condition.ternary.ta);
    const fa = analyzeAssign(scope, condition.ternary.fa);
    // if (ta !== undefined && fa !== undefined) checkTypeMatch(ta, fa);
    return ta;
}

export function asAnalyze(ast: NodeScript) {
    const globalScope: SymbolScope = createSymbolScope(undefined, undefined);

    const queue: AnalyzeQueue = {
        classQueue: [],
        funcQueue: [],
    };

    forwardSCRIPT(queue, globalScope, ast);

    analyzeSCRIPT(queue, globalScope, ast);

    return globalScope;
}

// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_expressions.html

import {
    DeclaredEnumMember,
    funcHeadDestructor,
    getNextTokenIfExist,
    getNodeLocation,
    isFunctionHeadReturns,
    NodeArgList,
    NodeAssign,
    NodeCase,
    NodeClass,
    NodeCondition,
    NodeConstructCall,
    NodeDoWhile,
    NodeEnum,
    NodeExpr,
    NodeExprPostOp,
    NodeExprPostOp1,
    NodeExprStat,
    NodeExprTerm,
    NodeExprTerm2,
    NodeExprValue,
    NodeFor,
    NodeFunc,
    NodeFuncCall,
    NodeIf,
    NodeLiteral,
    NodeName,
    NodeNamespace,
    NodeParamList,
    NodeReturn,
    NodeScope,
    NodeScript,
    NodeStatBlock,
    NodeStatement,
    NodeSwitch,
    NodeType,
    NodeVar,
    NodeVarAccess,
    NodeWhile
} from "./nodes";
import {
    builtinBoolType,
    builtinNumberType,
    DeducedType,
    findSymbolShallowly,
    findSymbolWithParent,
    insertSymbolicObject,
    isPrimitiveType,
    PrimitiveType,
    SymbolicFunction,
    SymbolicType,
    SymbolicVariable,
    SymbolKind,
    SymbolScope,
    tryGetBuiltInType
} from "./symbolic";
import {diagnostic} from "../code/diagnostic";
import {Range} from "vscode-languageserver";
import {TokenKind} from "./token";
import {ParsingToken} from "./parsing";
import {
    AnalyzedScope,
    copySymbolsInScope,
    createSymbolScope,
    createSymbolScopeAndInsert,
    findGlobalScope,
    findScopeShallowly,
    findScopeShallowlyOrInsert,
    findScopeWithParent
} from "./scope";
import {isTypeMatch} from "./typeMatch";

type HoistingQueue = (() => void)[];

type AnalyzingQueue = (() => void)[];

let s_uniqueIdentifier = -1;

function createUniqueIdentifier(): string {
    s_uniqueIdentifier++;
    return `~${s_uniqueIdentifier}`;
}

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
function hoistScript(parentScope: SymbolScope, ast: NodeScript, analyzing: AnalyzingQueue, hoisting: HoistingQueue) {
    // 宣言分析
    for (const statement of ast) {
        const nodeName = statement.nodeName;
        if (nodeName === NodeName.Enum) {
            hoistEnum(parentScope, statement);
        } else if (nodeName === NodeName.Class) {
            hoistClass(parentScope, statement, analyzing, hoisting);
        } else if (nodeName === NodeName.Var) {
            analyzeVar(parentScope, statement);
        } else if (nodeName === NodeName.Func) {
            hoistFunc(parentScope, statement, analyzing, hoisting);
        } else if (nodeName === NodeName.Namespace) {
            hoistNamespace(parentScope, statement, analyzing);
        }
    }
}

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
function hoistNamespace(parentScope: SymbolScope, nodeNamespace: NodeNamespace, queue: AnalyzingQueue) {
    if (nodeNamespace.namespaceList.length === 0) return;

    let scopeIterator = parentScope;
    for (let i = 0; i < nodeNamespace.namespaceList.length; i++) {
        const nextNamespace = nodeNamespace.namespaceList[i].text;
        scopeIterator = findScopeShallowlyOrInsert(undefined, scopeIterator, nextNamespace);
    }

    hoistScript(scopeIterator, nodeNamespace.script, queue, queue);
}

// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
function hoistEnum(parentScope: SymbolScope, nodeEnum: NodeEnum) {
    const symbol: SymbolicType = {
        symbolKind: SymbolKind.Type,
        declaredPlace: nodeEnum.identifier,
        sourceType: nodeEnum,
    };

    if (insertSymbolicObject(parentScope.symbolMap, symbol) === false) return;
    const scope = findScopeShallowlyOrInsert(nodeEnum, parentScope, nodeEnum.identifier.text);
    hoistEnumMembers(scope, nodeEnum.memberList);
}

function hoistEnumMembers(parentScope: SymbolScope, memberList: DeclaredEnumMember[]) {
    for (const member of memberList) {
        const symbol: SymbolicVariable = {
            symbolKind: SymbolKind.Variable,
            declaredPlace: member.identifier,
            type: builtinNumberType,
        };
        insertSymbolicObject(parentScope.symbolMap, symbol);
    }
}

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
function hoistClass(parentScope: SymbolScope, nodeClass: NodeClass, analyzing: AnalyzingQueue, hoisting: HoistingQueue) {
    const symbol: SymbolicType = {
        symbolKind: SymbolKind.Type,
        declaredPlace: nodeClass.identifier,
        sourceType: nodeClass,
    };
    if (insertSymbolicObject(parentScope.symbolMap, symbol) === false) return;
    const scope: SymbolScope = findScopeShallowlyOrInsert(nodeClass, parentScope, nodeClass.identifier.text);
    // analyzing.push(() => {analyzeClass}) // TODO

    hoisting.push(() => {
        hoistClassMembers(scope, nodeClass, analyzing, hoisting);
    });
}

function hoistClassMembers(scope: SymbolScope, nodeClass: NodeClass, analyzing: AnalyzingQueue, hoisting: HoistingQueue) {
    for (const member of nodeClass.memberList) {
        if (member.nodeName === NodeName.VirtualProp) {
            // TODO
        } else if (member.nodeName === NodeName.Func) {
            hoistFunc(scope, member, analyzing, hoisting);
        } else if (member.nodeName === NodeName.Var) {
            analyzeVar(scope, member);
        }
    }
}

// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
function hoistFunc(parentScope: SymbolScope, nodeFunc: NodeFunc, analyzing: AnalyzingQueue, hoisting: HoistingQueue) {
    if (nodeFunc.head === funcHeadDestructor) return;

    const symbol: SymbolicFunction = {
        symbolKind: SymbolKind.Function,
        declaredPlace: nodeFunc.identifier,
        returnType: isFunctionHeadReturns(nodeFunc.head) ? analyzeType(parentScope, nodeFunc.head.returnType) : undefined,
        parameterTypes: [],
        sourceNode: nodeFunc,
        nextOverload: undefined,
    };
    if (insertSymbolicObject(parentScope.symbolMap, symbol) === false) return;

    const scope: SymbolScope = createSymbolScopeAndInsert(nodeFunc, parentScope, nodeFunc.identifier.text);

    hoisting.push(() => {
        symbol.parameterTypes = hoistParamList(scope, nodeFunc.paramList);
    });

    analyzing.push(() => {
        analyzeFunc(scope, nodeFunc);
    });
}

function analyzeFunc(scope: SymbolScope, ast: NodeFunc) {
    if (ast.head === funcHeadDestructor) {
        analyzeStatBlock(scope, ast.statBlock);
        return;
    }

    // 引数をスコープに追加
    analyzeParamList(scope, ast.paramList);

    // スコープ分析
    analyzeStatBlock(scope, ast.statBlock);
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST]} ';'
function analyzeVar(scope: SymbolScope, nodeVar: NodeVar) {
    const type = analyzeType(scope, nodeVar.type);
    for (const declaredVar of nodeVar.variables) {
        const initializer = declaredVar.initializer;
        if (initializer !== undefined) {
            if (initializer.nodeName === NodeName.Expr) analyzeExpr(scope, initializer);
            if (initializer.nodeName === NodeName.ArgList) analyzeArgList(scope, initializer);
        }
        const variable: SymbolicVariable = {
            symbolKind: SymbolKind.Variable,
            type: type?.symbol,
            declaredPlace: declaredVar.identifier,
        };
        insertSymbolicObject(scope.symbolMap, variable);
    }
}

// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
// MIXIN         ::= 'mixin' CLASS
// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
function analyzeStatBlock(scope: SymbolScope, ast: NodeStatBlock) {
    for (const statement of ast.statements) {
        if (statement.nodeName === NodeName.Var) {
            analyzeVar(scope, statement);
        } else {
            analyzeStatement(scope, statement as NodeStatement);
        }
    }
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
function hoistParamList(scope: SymbolScope, paramList: NodeParamList) {
    const deducedTypes: (DeducedType | undefined)[] = [];
    for (const param of paramList) {
        if (param.identifier === undefined) continue;

        const type = analyzeType(scope, param.type);
        if (type === undefined) deducedTypes.push(undefined);
        else deducedTypes.push(type);

        insertSymbolicObject(scope.symbolMap, {
            symbolKind: SymbolKind.Variable,
            type: type?.symbol,
            declaredPlace: param.identifier,
        });
    }
    return deducedTypes;
}

function analyzeParamList(scope: SymbolScope, paramList: NodeParamList) {
    for (const param of paramList) {
        if (param.defaultExpr === undefined) continue;
        analyzeExpr(scope, param.defaultExpr);
    }
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
function analyzeType(scope: SymbolScope, nodeType: NodeType): DeducedType | undefined {
    let searchScope = scope;
    if (nodeType.scope !== undefined) searchScope = analyzeScope(scope, nodeType.scope) ?? searchScope;

    const ownerNode = searchScope.ownerNode;
    const dataTypeIdentifier = nodeType.dataType.identifier;
    if (ownerNode?.nodeName === 'Class' && ownerNode.identifier.text === dataTypeIdentifier.text) {
        // コンストラクタと衝突するので上の階層から探す
        searchScope = scope.parentScope ?? searchScope;
    }

    const foundBuiltin = tryGetBuiltInType(dataTypeIdentifier);
    if (foundBuiltin !== undefined) return {symbol: foundBuiltin, sourceScope: undefined};

    const foundSymbol = findSymbolWithParent(searchScope, dataTypeIdentifier.text);
    if (foundSymbol === undefined) {
        diagnostic.addError(nodeType.dataType.identifier.location, `Undefined type: ${nodeType.dataType.identifier.text} 💢`);
        return undefined;
    } else if (foundSymbol.symbol.symbolKind !== SymbolKind.Type) {
        diagnostic.addError(nodeType.dataType.identifier.location, `Not a type: ${nodeType.dataType.identifier.text} 💢`);
        return undefined;
    }

    scope.referencedList.push({
        declaredSymbol: foundSymbol.symbol,
        referencedToken: nodeType.dataType.identifier
    });
    return {symbol: foundSymbol.symbol, sourceScope: foundSymbol.scope};
}

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
function analyzeINITLIST(scope: SymbolScope, ast: NodeExpr) {
    // TODO
}

// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
function analyzeScope(symbolScope: SymbolScope, nodeScope: NodeScope): SymbolScope | undefined {
    let scopeIterator = symbolScope;
    if (nodeScope.isGlobal) {
        scopeIterator = findGlobalScope(symbolScope);
    }
    for (let i = 0; i < nodeScope.scopeList.length; i++) {
        const nextScope = nodeScope.scopeList[i];

        // 名前に対応するスコープを探す
        let found: SymbolScope | undefined = undefined;
        for (; ;) {
            found = findScopeShallowly(scopeIterator, nextScope.text);
            if (found !== undefined) break;
            if (i == 0 && scopeIterator.parentScope !== undefined) {
                // グローバルスコープでないなら、上の階層を更に探索
                scopeIterator = scopeIterator.parentScope;
            } else {
                diagnostic.addError(nextScope.location, `Undefined scope: ${nextScope.text}`);
                return undefined;
            }
        }

        // スコープを更新
        scopeIterator = found;

        // 名前空間に対する補完を行う
        const complementRange: Range = {start: nextScope.location.start, end: nextScope.location.end};
        complementRange.end = getNextTokenIfExist(getNextTokenIfExist(nextScope)).location.start;
        symbolScope.completionHints.push({
            complementKind: NodeName.Namespace,
            complementRange: complementRange,
            namespaceList: nodeScope.scopeList.slice(0, i + 1)
        });
    }

    return scopeIterator;
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
// PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
// FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property'}

// STATEMENT     ::= (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
function analyzeStatement(scope: SymbolScope, ast: NodeStatement) {
    switch (ast.nodeName) {
    case NodeName.If:
        analyzeIf(scope, ast);
        break;
    case NodeName.For:
        analyzeFor(scope, ast);
        break;
    case NodeName.While:
        analyzeWhile(scope, ast);
        break;
    case NodeName.Return:
        analyzeReturn(scope, ast);
        break;
    case NodeName.StatBlock: {
        const childScope = createSymbolScopeAndInsert(undefined, scope, createUniqueIdentifier());
        analyzeStatBlock(childScope, ast);
        break;
    }
    case NodeName.Break:
        break;
    case NodeName.Continue:
        break;
    case NodeName.DoWhile:
        analyzeDoWhile(scope, ast);
        break;
    case NodeName.Switch:
        analyzeSwitch(scope, ast);
        break;
    case NodeName.ExprStat:
        analyzeEexprStat(scope, ast);
        break;
        // case NodeName.Try:
        //     break;
    default:
        break;
    }
}

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
function analyzeSwitch(scope: SymbolScope, ast: NodeSwitch) {
    analyzeAssign(scope, ast.assign);
    for (const c of ast.cases) {
        analyzeCASE(scope, c);
    }
}

// BREAK         ::= 'break' ';'

// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
function analyzeFor(scope: SymbolScope, ast: NodeFor) {
    if (ast.initial.nodeName === NodeName.Var) analyzeVar(scope, ast.initial);
    else analyzeEexprStat(scope, ast.initial);

    analyzeEexprStat(scope, ast.condition);

    for (const inc of ast.incrementList) {
        analyzeAssign(scope, inc);
    }

    analyzeStatement(scope, ast.statement);
}

// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
function analyzeWhile(scope: SymbolScope, ast: NodeWhile) {
    analyzeAssign(scope, ast.assign);
    analyzeStatement(scope, ast.statement);
}

// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
function analyzeDoWhile(scope: SymbolScope, ast: NodeDoWhile) {
    analyzeStatement(scope, ast.statement);
    analyzeAssign(scope, ast.assign);
}

// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
function analyzeIf(scope: SymbolScope, ast: NodeIf) {
    analyzeAssign(scope, ast.condition);
    analyzeStatement(scope, ast.ts);
    if (ast.fs !== undefined) analyzeStatement(scope, ast.fs);
}

// CONTINUE      ::= 'continue' ';'

// EXPRSTAT      ::= [ASSIGN] ';'
function analyzeEexprStat(scope: SymbolScope, ast: NodeExprStat) {
    if (ast.assign !== undefined) analyzeAssign(scope, ast.assign);
}

// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK

// RETURN        ::= 'return' [ASSIGN] ';'
function analyzeReturn(scope: SymbolScope, ast: NodeReturn) {
    analyzeAssign(scope, ast.assign);
}

// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
function analyzeCASE(scope: SymbolScope, ast: NodeCase) {
    if (ast.expr !== undefined) analyzeExpr(scope, ast.expr);
    for (const statement of ast.statementList) {
        analyzeStatement(scope, statement);
    }
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
function analyzeExpr(scope: SymbolScope, ast: NodeExpr): DeducedType | undefined {
    const lhs = analyzeExprTerm(scope, ast.head);
    // TODO: 型チェック
    if (ast.tail !== undefined) {
        const rhs = analyzeExpr(scope, ast.tail.expression);
        // if (lhs !== undefined && rhs !== undefined) checkTypeMatch(lhs, rhs);
    }
    return lhs;
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function analyzeExprTerm(scope: SymbolScope, ast: NodeExprTerm): DeducedType | undefined {
    if (ast.exprTerm === 1) {
        // TODO
    } else if (ast.exprTerm === 2) {
        return analyzeExprTerm2(scope, ast);
    }
    return undefined;
}

function analyzeExprTerm2(scope: SymbolScope, exprTerm: NodeExprTerm2) {
    const exprValue = analyzeExprValue(scope, exprTerm.value);
    if (exprTerm.postOp !== undefined && exprValue !== undefined) {
        analyzeExprPostOp(scope, exprTerm.postOp, exprValue.symbol);
    }
    return exprValue;
}

// EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
function analyzeExprValue(scope: SymbolScope, exprValue: NodeExprValue): DeducedType | undefined {
    switch (exprValue.nodeName) {
    case NodeName.ConstructCall:
        break;
    case NodeName.FuncCall:
        return analyzeFuncCall(scope, exprValue);
    case NodeName.VarAccess:
        return analyzeVarAccess(scope, exprValue);
    case NodeName.Cast:
        break;
    case NodeName.Literal:
        return analyzeLiteral(scope, exprValue);
    case NodeName.Assign:
        return analyzeAssign(scope, exprValue);
    case NodeName.Lambda:
        break;
    default:
        break;
    }
    return undefined;
}

// CONSTRUCTCALL ::= TYPE ARGLIST
function analyzeConstructorByType(scope: SymbolScope, funcCall: NodeFuncCall, constructorType: SymbolicType): DeducedType | undefined {
    const classScope = findScopeWithParent(scope, funcCall.identifier.text);
    if (classScope === undefined) {
        diagnostic.addError(funcCall.identifier.location, `Undefined class: ${funcCall.identifier.text} 💢`);
        return undefined;
    }

    const constructor = findSymbolShallowly(classScope, funcCall.identifier.text);
    if (constructor === undefined || constructor.symbolKind !== SymbolKind.Function) {
        diagnostic.addError(funcCall.identifier.location, `Missing constructor: ${funcCall.identifier.text} 💢`);
        return undefined;
    }

    analyzeFunctionCaller(scope, funcCall, constructor);
    return {symbol: constructorType, sourceScope: classScope};
}

// EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']') | ARGLIST | '++' | '--'
function analyzeExprPostOp(scope: SymbolScope, exprPostOp: NodeExprPostOp, exprValue: SymbolicType) {
    if (exprPostOp.postOp === 1) {
        return analyzeExprPostOp1(scope, exprPostOp, exprValue);
    }
}

// ('.' (FUNCCALL | IDENTIFIER))
function analyzeExprPostOp1(scope: SymbolScope, exprPostOp: NodeExprPostOp1, exprValue: SymbolicType) {
    const complementRange = getNodeLocation(exprPostOp.nodeRange);

    // メンバが存在しない場合は、次のトークンまでを補完範囲とする
    if (exprPostOp.member === undefined) {
        complementRange.end = getNextTokenIfExist(exprPostOp.nodeRange.end).location.start;
    }

    // クラスメンバ補完
    scope.completionHints.push({
        complementKind: NodeName.Type,
        complementRange: complementRange,
        targetType: exprValue
    });

    if (exprPostOp.member === undefined) return undefined;

    if ('nodeName' in exprPostOp.member) {
        // メソッド診断
        if (typeof (exprValue.sourceType) === 'string' || exprValue.sourceType.nodeName !== NodeName.Class) {
            diagnostic.addError(exprPostOp.member.identifier.location, `Undefined member: ${exprPostOp.member.identifier.text}`);
            return undefined;
        }

        const classScope = findScopeWithParent(scope, exprValue.sourceType.identifier.text);
        if (classScope === undefined) {
            diagnostic.addError(exprPostOp.member.identifier.location, `Undefined class: ${exprValue.sourceType.identifier.text}`);
            return undefined;
        }

        const classMethod = findSymbolShallowly(classScope, exprPostOp.member.identifier.text);
        if (classMethod === undefined || classMethod.symbolKind !== SymbolKind.Function) {
            diagnostic.addError(exprPostOp.member.identifier.location, `Missing method: ${exprPostOp.member.identifier.text}`);
            return undefined;
        }

        return analyzeFunctionCaller(scope, exprPostOp.member, classMethod);
    } else {
        // フィールド診断
        // TODO
    }
}

// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
function analyzeLiteral(scope: SymbolScope, literal: NodeLiteral): DeducedType | undefined {
    if (literal.value.kind === TokenKind.Number) {
        return {symbol: builtinNumberType, sourceScope: undefined};
    }
    const literalText = literal.value.text;
    if (literalText === 'true' || literalText === 'false') {
        return {symbol: builtinBoolType, sourceScope: undefined};
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
    const calleeFunc = findSymbolWithParent(scope, funcCall.identifier.text)?.symbol;
    if (calleeFunc === undefined) {
        diagnostic.addError(funcCall.identifier.location, `Undefined function: ${funcCall.identifier.text}`);
        return undefined;
    }

    if (calleeFunc.symbolKind === SymbolKind.Type) {
        return analyzeConstructorByType(scope, funcCall, calleeFunc);
    }

    if (calleeFunc.symbolKind !== SymbolKind.Function) {
        diagnostic.addError(funcCall.identifier.location, `Not a function: ${funcCall.identifier.text}`);
        return undefined;
    }
    return analyzeFunctionCaller(scope, funcCall, calleeFunc);
}

function analyzeFunctionCaller(scope: SymbolScope, callerNode: NodeFuncCall | NodeConstructCall, calleeFunc: SymbolicFunction) {
    const pushReference = () => {
        const callerIdentifier = getIdentifierInFuncOrConstructor(callerNode);
        scope.referencedList.push({declaredSymbol: calleeFunc, referencedToken: callerIdentifier});
    };

    const returnType = calleeFunc.returnType;
    const callerArgs = analyzeArgList(scope, callerNode.argList);

    const calleeParams = calleeFunc.sourceNode.paramList;

    // 呼び出し側の引数の数が多すぎる場合はエラー
    if (callerArgs.length > calleeParams.length) {
        // オーバーロード存在するなら採用
        if (calleeFunc.nextOverload !== undefined) return analyzeFunctionCaller(scope, callerNode, calleeFunc.nextOverload);
        diagnostic.addError(getNodeLocation(callerNode.nodeRange),
            `Function has ${calleeFunc.sourceNode.paramList.length} parameters, but ${callerArgs.length} were provided 💢`);
        pushReference();
        return returnType;
    }

    for (let i = 0; i < calleeParams.length; i++) {
        const expectedType = calleeFunc.parameterTypes[i];
        let actualType: DeducedType | undefined;
        if (i >= callerArgs.length) {
            // デフォルト値があればそれを採用
            const param = calleeParams[i];
            if (param.defaultExpr === undefined) {
                // オーバーロード存在するなら採用
                if (calleeFunc.nextOverload !== undefined) return analyzeFunctionCaller(scope, callerNode, calleeFunc.nextOverload);
                diagnostic.addError(getNodeLocation(callerNode.nodeRange), `Missing argument for parameter '${param.identifier?.text}' 💢`);
                break;
            }
            actualType = analyzeExpr(scope, param.defaultExpr);
        } else {
            actualType = callerArgs[i];
        }
        if (actualType === undefined || expectedType === undefined) continue;
        if (isTypeMatch(actualType, expectedType)) continue;

        // オーバーロード存在するなら使用
        if (calleeFunc.nextOverload !== undefined) return analyzeFunctionCaller(scope, callerNode, calleeFunc.nextOverload);
        diagnostic.addError(getNodeLocation(callerNode.argList.argList[i].assign.nodeRange),
            `Cannot convert '${actualType.symbol.declaredPlace.text}' to parameter type '${expectedType.symbol.declaredPlace.text}' 💢`);
    }

    pushReference();
    return returnType;
}

function getIdentifierInFuncOrConstructor(funcCall: NodeFuncCall | NodeConstructCall): ParsingToken {
    if (funcCall.nodeName === NodeName.FuncCall) {
        return funcCall.identifier;
    } else {
        return funcCall.type.dataType.identifier;
    }
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
    const declared = findSymbolWithParent(scope, token.text);
    if (declared === undefined) {
        diagnostic.addError(token.location, `Undefined variable: ${token.text}`);
        return undefined;
    } else if (declared.symbol.symbolKind !== SymbolKind.Variable) {
        diagnostic.addError(token.location, `Not a variable: ${token.text}`);
        return undefined;
    }
    scope.referencedList.push({
        declaredSymbol: declared.symbol,
        referencedToken: token
    });
    if (declared.symbol.type === undefined) return undefined;
    return {symbol: declared.symbol.type, sourceScope: declared.scope};
}

// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
function analyzeArgList(scope: SymbolScope, argList: NodeArgList): (DeducedType | undefined)[] {
    const types: (DeducedType | undefined)[] = [];
    for (const arg of argList.argList) {
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
    const exprType = analyzeExpr(scope, condition.expr);
    if (condition.ternary === undefined) return exprType;
    const ta = analyzeAssign(scope, condition.ternary.ta);
    const fa = analyzeAssign(scope, condition.ternary.fa);
    // if (ta !== undefined && fa !== undefined) checkTypeMatch(ta, fa);
    return ta;
}

export function analyzeFromParsed(ast: NodeScript, path: string, includedScopes: AnalyzedScope[]): AnalyzedScope {
    const globalScope: SymbolScope = createSymbolScope(undefined, undefined);

    for (const included of includedScopes) {
        // インクルードされたスコープのシンボルをコピー
        copySymbolsInScope(included.pureScope, globalScope);
    }

    const analyzing: AnalyzingQueue = [];
    const hoisting: HoistingQueue = [];

    // 宣言されたシンボルを巻き上げ
    hoistScript(globalScope, ast, analyzing, hoisting);
    while (hoisting.length > 0) {
        const next = hoisting.shift();
        if (next !== undefined) next();
    }

    // 処理を行うスコープの中身を解析
    while (analyzing.length > 0) {
        const next = analyzing.shift();
        if (next !== undefined) next();
    }

    return new AnalyzedScope(path, globalScope);
}

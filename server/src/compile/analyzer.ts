// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_expressions.html

import {
    funcHeadDestructor,
    getIdentifierInType,
    getNextTokenIfExist,
    getNodeLocation,
    getRangedLocation,
    isFunctionHeadReturns,
    isMemberMethodInPostOp,
    NodeArgList,
    NodeAssign,
    NodeCase,
    NodeCast,
    NodeClass,
    NodeCondition,
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
    NodeInitList,
    NodeLiteral,
    NodeMixin,
    NodeName,
    NodeNamespace,
    NodeParamList,
    NodeReturn,
    NodeScope,
    NodeScript,
    NodeStatBlock,
    NodeStatement,
    NodeSwitch,
    NodeTry,
    NodeType,
    NodeVar,
    NodeVarAccess,
    NodeWhile,
    ParsedEnumMember, ParsedRange
} from "./nodes";
import {
    builtinBoolType,
    builtinDoubleType,
    builtinFloatType,
    builtinIntType,
    builtinStringType,
    ComplementKind,
    DeducedType,
    findSymbolShallowly,
    findSymbolWithParent,
    insertSymbolicObject,
    isSourceNodeClass, isSourcePrimitiveType,
    PrimitiveType,
    stringifyDeducedType,
    SymbolicFunction,
    SymbolicType,
    SymbolicVariable,
    SymbolKind,
    SymbolScope,
    TemplateTranslation,
    tryGetBuiltInType
} from "./symbolic";
import {diagnostic} from "../code/diagnostic";
import {NumberLiterals, TokenKind} from "./tokens";
import {
    AnalyzedScope,
    copySymbolsInScope,
    createAnonymousIdentifier,
    createSymbolScope,
    createSymbolScopeAndInsert,
    findGlobalScope,
    findScopeShallowly,
    findScopeShallowlyOrInsert,
    findScopeWithParent,
    findScopeWithParentByNode,
    isSymbolConstructorInScope
} from "./scope";
import {checkFunctionMatch} from "./checkFunction";
import {ParsingToken} from "./parsingToken";
import {checkTypeMatch, isTypeMatch} from "./checkType";
import assert = require("node:assert");

type HoistingQueue = (() => void)[];

type AnalyzingQueue = (() => void)[];

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
function hoistScript(parentScope: SymbolScope, ast: NodeScript, analyzing: AnalyzingQueue, hoisting: HoistingQueue) {
    // 宣言分析
    for (const statement of ast) {
        const nodeName = statement.nodeName;
        if (nodeName === NodeName.Enum) {
            hoistEnum(parentScope, statement);
        } else if (nodeName === NodeName.Class) {
            hoistClass(parentScope, statement, analyzing, hoisting);
        } else if (nodeName === NodeName.Mixin) {
            hoistMixin(parentScope, statement, analyzing, hoisting);
        } else if (nodeName === NodeName.Var) {
            analyzeVar(parentScope, statement, false);
        } else if (nodeName === NodeName.Func) {
            hoistFunc(parentScope, statement, analyzing, hoisting, false);
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
        const nextNamespace = nodeNamespace.namespaceList[i];
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
        membersScope: undefined,
    };

    if (insertSymbolicObject(parentScope.symbolMap, symbol) === false) return;

    const scope = findScopeShallowlyOrInsert(nodeEnum, parentScope, nodeEnum.identifier);
    symbol.membersScope = scope;

    hoistEnumMembers(scope, nodeEnum.memberList, {symbol: symbol, sourceScope: scope});
}

function hoistEnumMembers(parentScope: SymbolScope, memberList: ParsedEnumMember[], type: DeducedType) {
    for (const member of memberList) {
        const symbol: SymbolicVariable = {
            symbolKind: SymbolKind.Variable,
            declaredPlace: member.identifier,
            type: type,
            isInstanceMember: false,
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
        membersScope: undefined,
    };
    if (insertSymbolicObject(parentScope.symbolMap, symbol) === false) return;

    const scope: SymbolScope = findScopeShallowlyOrInsert(nodeClass, parentScope, nodeClass.identifier);
    symbol.membersScope = scope;

    const templateTypes = hoistClassTemplateTypes(scope, nodeClass.typeTemplates);
    if (templateTypes.length > 0) symbol.templateTypes = templateTypes;

    hoisting.push(() => {
        hoistClassMembers(scope, nodeClass, analyzing, hoisting);
    });
}

function hoistClassTemplateTypes(scope: SymbolScope, types: NodeType[] | undefined) {
    const templateTypes: ParsingToken[] = [];
    for (const type of types ?? []) {
        insertSymbolicObject(scope.symbolMap, {
            symbolKind: SymbolKind.Type,
            declaredPlace: getIdentifierInType(type),
            sourceType: PrimitiveType.Template,
            membersScope: undefined,
        } satisfies SymbolicType);

        templateTypes.push(getIdentifierInType(type));
    }
    return templateTypes;
}

function hoistClassMembers(scope: SymbolScope, nodeClass: NodeClass, analyzing: AnalyzingQueue, hoisting: HoistingQueue) {
    for (const member of nodeClass.memberList) {
        if (member.nodeName === NodeName.VirtualProp) {
            // TODO
        } else if (member.nodeName === NodeName.Func) {
            hoistFunc(scope, member, analyzing, hoisting, true);
        } else if (member.nodeName === NodeName.Var) {
            analyzeVar(scope, member, true);
        }
    }
}

// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
function hoistFunc(
    parentScope: SymbolScope, nodeFunc: NodeFunc, analyzing: AnalyzingQueue, hoisting: HoistingQueue, isInstanceMember: boolean
) {
    if (nodeFunc.head === funcHeadDestructor) return;

    const symbol: SymbolicFunction = {
        symbolKind: SymbolKind.Function,
        declaredPlace: nodeFunc.identifier,
        returnType: isFunctionHeadReturns(nodeFunc.head) ? analyzeType(parentScope, nodeFunc.head.returnType) : undefined,
        parameterTypes: [],
        sourceNode: nodeFunc,
        nextOverload: undefined,
        isInstanceMember: isInstanceMember,
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

function analyzeFunc(scope: SymbolScope, func: NodeFunc) {
    if (func.head === funcHeadDestructor) {
        analyzeStatBlock(scope, func.statBlock);
        return;
    }

    // 引数をスコープに追加
    analyzeParamList(scope, func.paramList);

    // スコープ分析
    analyzeStatBlock(scope, func.statBlock);
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
function analyzeVar(scope: SymbolScope, nodeVar: NodeVar, isInstanceMember: boolean) {
    let varType = analyzeType(scope, nodeVar.type);
    for (const declaredVar of nodeVar.variables) {
        const initializer = declaredVar.initializer;
        if (initializer !== undefined) {
            const initType = analyzeVarInitializer(scope, varType, declaredVar.identifier, initializer);
            if (varType?.symbol.sourceType === PrimitiveType.Auto && initType !== undefined) {
                varType = initType;
            }
        }

        const variable: SymbolicVariable = {
            symbolKind: SymbolKind.Variable,
            declaredPlace: declaredVar.identifier,
            type: varType,
            isInstanceMember: isInstanceMember,
        };
        insertSymbolicObject(scope.symbolMap, variable);
    }
}

function analyzeVarInitializer(
    scope: SymbolScope,
    varType: DeducedType | undefined,
    identifier: ParsingToken,
    initializer: NodeInitList | NodeAssign | NodeArgList
): DeducedType | undefined {
    if (initializer.nodeName === NodeName.InitList) {
        return analyzeInitList(scope, initializer);
    } else if (initializer.nodeName === NodeName.Assign) {
        const exprType = analyzeAssign(scope, initializer);
        checkTypeMatch(exprType, varType, initializer.nodeRange);
        return exprType;
    } else if (initializer.nodeName === NodeName.ArgList) {
        if (varType === undefined) return undefined;
        return analyzeConstructorByType(scope, identifier, initializer, varType.symbol, varType.templateTranslate);
    }
}

// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'

// MIXIN         ::= 'mixin' CLASS
function hoistMixin(parentScope: SymbolScope, mixin: NodeMixin, analyzing: AnalyzingQueue, hoisting: HoistingQueue) {
    hoistClass(parentScope, mixin.mixinClass, analyzing, hoisting);
}

// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
function analyzeStatBlock(scope: SymbolScope, statBlock: NodeStatBlock) {
    // スコープ内の補完情報を追加
    scope.parentScope?.completionHints.push({
        complementKind: ComplementKind.Scope,
        complementLocation: getNodeLocation(statBlock.nodeRange),
        targetScope: scope
    });

    for (const statement of statBlock.statementList) {
        if (statement.nodeName === NodeName.Var) {
            analyzeVar(scope, statement, false);
        } else {
            analyzeStatement(scope, statement as NodeStatement);
        }
    }
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
function hoistParamList(scope: SymbolScope, paramList: NodeParamList) {
    const deducedTypes: (DeducedType | undefined)[] = [];
    for (const param of paramList) {
        const type = analyzeType(scope, param.type);
        if (type === undefined) deducedTypes.push(undefined);
        else deducedTypes.push(type);

        if (param.identifier === undefined) continue;
        insertSymbolicObject(scope.symbolMap, {
            symbolKind: SymbolKind.Variable,
            declaredPlace: param.identifier,
            type: type,
            isInstanceMember: false,
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
    const reservedType = analyzeReservedType(scope, nodeType);
    if (reservedType !== undefined) return reservedType;

    const typeIdentifier = nodeType.dataType.identifier;

    const searchScope = nodeType.scope !== undefined
        ? (analyzeScope(scope, nodeType.scope) ?? scope)
        : scope;

    let foundSymbol = findSymbolWithParent(searchScope, typeIdentifier.text);
    if (foundSymbol !== undefined
        && isSymbolConstructorInScope(foundSymbol.symbol, foundSymbol.scope)
        && foundSymbol.scope.parentScope !== undefined
    ) {
        // コンストラクタの場合は上の階層を探索
        foundSymbol = findSymbolWithParent(foundSymbol.scope.parentScope, typeIdentifier.text);
    }

    if (foundSymbol === undefined) {
        diagnostic.addError(typeIdentifier.location, `'${typeIdentifier.text}' is not defined 💢`);
        return undefined;
    } else if (foundSymbol.symbol.symbolKind !== SymbolKind.Type) {
        diagnostic.addError(typeIdentifier.location, `'${typeIdentifier.text}' is not a type 💢`);
        return undefined;
    }

    const typeTemplates = analyzeTemplateTypes(scope, nodeType.typeTemplates, foundSymbol.symbol.templateTypes);

    scope.referencedList.push({
        declaredSymbol: foundSymbol.symbol,
        referencedToken: nodeType.dataType.identifier
    });

    return {
        symbol: foundSymbol.symbol,
        sourceScope: foundSymbol.scope,
        templateTranslate: typeTemplates
    };
}

// PRIMTYPE | '?' | 'auto'
function analyzeReservedType(scope: SymbolScope, nodeType: NodeType): DeducedType | undefined {
    const typeIdentifier = nodeType.dataType.identifier;
    if (typeIdentifier.kind !== TokenKind.Reserved) return;

    if (nodeType.scope !== undefined) {
        diagnostic.addError(typeIdentifier.location, `Invalid scope 💢`);
    }

    const foundBuiltin = tryGetBuiltInType(typeIdentifier);
    if (foundBuiltin !== undefined) return {symbol: foundBuiltin, sourceScope: undefined};

    return undefined;
}

function analyzeTemplateTypes(scope: SymbolScope, nodeType: NodeType[], templateTypes: ParsingToken[] | undefined) {
    if (templateTypes === undefined) return undefined;

    const translation: TemplateTranslation = new Map();
    for (let i = 0; i < nodeType.length; i++) {
        if (i >= templateTypes.length) {
            diagnostic.addError(getNodeLocation(nodeType[nodeType.length - 1].nodeRange), `Too many template types 💢`);
            break;
        }

        const template = nodeType[i];
        translation.set(templateTypes[i], analyzeType(scope, template));
    }

    return translation;
}

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
function analyzeInitList(scope: SymbolScope, initList: NodeInitList) {
    for (const init of initList.initList) {
        if (init.nodeName === NodeName.Assign) {
            analyzeAssign(scope, init);
        } else if (init.nodeName === NodeName.InitList) {
            analyzeInitList(scope, init);
        }
    }

    // TODO: InitList 型判定
    return undefined;
}

// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
function analyzeScope(parentScope: SymbolScope, nodeScope: NodeScope): SymbolScope | undefined {
    let scopeIterator = parentScope;
    if (nodeScope.isGlobal) {
        scopeIterator = findGlobalScope(parentScope);
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
        const complementRange = {...nextScope.location};
        complementRange.end = getNextTokenIfExist(getNextTokenIfExist(nextScope)).location.start;
        parentScope.completionHints.push({
            complementKind: ComplementKind.Namespace,
            complementLocation: complementRange,
            namespaceList: nodeScope.scopeList.slice(0, i + 1)
        });
    }

    return scopeIterator;
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')

// PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'

// FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property'}

// STATEMENT     ::= (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
function analyzeStatement(scope: SymbolScope, statement: NodeStatement) {
    switch (statement.nodeName) {
    case NodeName.If:
        analyzeIf(scope, statement);
        break;
    case NodeName.For:
        analyzeFor(scope, statement);
        break;
    case NodeName.While:
        analyzeWhile(scope, statement);
        break;
    case NodeName.Return:
        analyzeReturn(scope, statement);
        break;
    case NodeName.StatBlock: {
        const childScope = createSymbolScopeAndInsert(undefined, scope, createAnonymousIdentifier());
        analyzeStatBlock(childScope, statement);
        break;
    }
    case NodeName.Break:
        break;
    case NodeName.Continue:
        break;
    case NodeName.DoWhile:
        analyzeDoWhile(scope, statement);
        break;
    case NodeName.Switch:
        analyzeSwitch(scope, statement);
        break;
    case NodeName.ExprStat:
        analyzeEexprStat(scope, statement);
        break;
    case NodeName.Try:
        analyzeTry(scope, statement);
        break;
    default:
        break;
    }
}

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
function analyzeSwitch(scope: SymbolScope, ast: NodeSwitch) {
    analyzeAssign(scope, ast.assign);
    for (const c of ast.cases) {
        analyzeCase(scope, c);
    }
}

// BREAK         ::= 'break' ';'

// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
function analyzeFor(scope: SymbolScope, ast: NodeFor) {
    if (ast.initial.nodeName === NodeName.Var) analyzeVar(scope, ast.initial, false);
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
function analyzeIf(scope: SymbolScope, nodeIf: NodeIf) {
    const conditionType = analyzeAssign(scope, nodeIf.condition);
    checkTypeMatch(conditionType, {symbol: builtinBoolType, sourceScope: undefined}, nodeIf.condition.nodeRange);

    if (nodeIf.thenStat !== undefined) analyzeStatement(scope, nodeIf.thenStat);
    if (nodeIf.elseStat !== undefined) analyzeStatement(scope, nodeIf.elseStat);
}

// CONTINUE      ::= 'continue' ';'

// EXPRSTAT      ::= [ASSIGN] ';'
function analyzeEexprStat(scope: SymbolScope, exprStat: NodeExprStat) {
    if (exprStat.assign !== undefined) analyzeAssign(scope, exprStat.assign);
}

// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK
function analyzeTry(scope: SymbolScope, nodeTry: NodeTry) {
    analyzeStatBlock(scope, nodeTry.tryBlock);
    if (nodeTry.catchBlock !== undefined) analyzeStatBlock(scope, nodeTry.catchBlock);
}

// RETURN        ::= 'return' [ASSIGN] ';'
function analyzeReturn(scope: SymbolScope, nodeReturn: NodeReturn) {
    const returnType = analyzeAssign(scope, nodeReturn.assign);

    const functionScope = findScopeWithParentByNode(scope, NodeName.Func);
    if (functionScope === undefined || functionScope.ownerNode === undefined) return;

    // TODO: 仮想プロパティやラムダ式に対応

    if (functionScope.ownerNode.nodeName === NodeName.Func) {
        const functionReturn = functionScope.parentScope?.symbolMap.get(functionScope.ownerNode.identifier.text);
        if (functionReturn === undefined || functionReturn.symbolKind !== SymbolKind.Function) return;
        checkTypeMatch(returnType, functionReturn.returnType, nodeReturn.nodeRange);
    }
}

// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
function analyzeCase(scope: SymbolScope, nodeCase: NodeCase) {
    if (nodeCase.expr !== undefined) analyzeExpr(scope, nodeCase.expr);
    for (const statement of nodeCase.statementList) {
        analyzeStatement(scope, statement);
    }
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
function analyzeExpr(scope: SymbolScope, expr: NodeExpr): DeducedType | undefined {
    // 左から畳み込みを行う
    let cursor = expr;
    let lhs = analyzeExprTerm(scope, expr.head);
    for (; ;) {
        if (cursor.tail === undefined) break;
        const rhs = analyzeExprTerm(scope, cursor.tail.expression.head);
        lhs = analyzeExprOp(scope, cursor.tail.operator, lhs, rhs, cursor.head.nodeRange, cursor.tail.expression.head.nodeRange);
        cursor = cursor.tail.expression;
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

// {EXPRPREOP} EXPRVALUE {EXPRPOSTOP}
function analyzeExprTerm2(scope: SymbolScope, exprTerm: NodeExprTerm2) {
    let exprValue = analyzeExprValue(scope, exprTerm.value);

    for (const postOp of exprTerm.postOps) {
        if (exprValue === undefined) break;
        exprValue = analyzeExprPostOp(scope, postOp, exprValue);
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
        return analyzeCast(scope, exprValue);
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
function analyzeConstructorByType(
    scope: SymbolScope,
    callerIdentifier: ParsingToken,
    callerArgList: NodeArgList,
    constructorType: SymbolicType,
    templateTranslate: TemplateTranslation | undefined
): DeducedType | undefined {
    const constructorIdentifier = constructorType.declaredPlace.text;
    const classScope = findScopeWithParent(scope, constructorIdentifier);
    if (classScope === undefined) {
        diagnostic.addError(callerIdentifier.location, `Undefined class: ${constructorIdentifier} 💢`);
        return undefined;
    }

    const constructor = findSymbolShallowly(classScope, constructorIdentifier);
    if (constructor === undefined || constructor.symbolKind !== SymbolKind.Function) {
        diagnostic.addError(callerIdentifier.location, `Missing constructor: ${constructorIdentifier} 💢`);
        return undefined;
    }

    analyzeFunctionCaller(scope, callerIdentifier, callerArgList, constructor, templateTranslate);
    return {symbol: constructorType, sourceScope: classScope};
}

// EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']') | ARGLIST | '++' | '--'
function analyzeExprPostOp(scope: SymbolScope, exprPostOp: NodeExprPostOp, exprValue: DeducedType) {
    if (exprPostOp.postOp === 1) {
        return analyzeExprPostOp1(scope, exprPostOp, exprValue);
    }
}

// ('.' (FUNCCALL | IDENTIFIER))
function analyzeExprPostOp1(scope: SymbolScope, exprPostOp: NodeExprPostOp1, exprValue: DeducedType) {
    const complementRange = getRangedLocation(exprPostOp.nodeRange.start, getNextTokenIfExist(exprPostOp.nodeRange.start));

    // クラスメンバ補完
    scope.completionHints.push({
        complementKind: ComplementKind.Type,
        complementLocation: complementRange,
        targetType: exprValue.symbol
    });

    const member = exprPostOp.member;
    const isMemberMethod = isMemberMethodInPostOp(member);

    const identifier = isMemberMethod ? member.identifier : member;
    if (identifier === undefined) return undefined;

    if (isSourceNodeClass(exprValue.symbol.sourceType) === false) {
        diagnostic.addError(identifier.location, `'${identifier.text}' is not a member 💢`);
        return undefined;
    }

    const classScope = exprValue.symbol.membersScope;
    if (classScope === undefined) return undefined;

    if (isMemberMethod) {
        // メソッド診断
        const method = findSymbolShallowly(classScope, identifier.text);
        if (method === undefined) {
            diagnostic.addError(identifier.location, `'${identifier.text}' is not defined 💢`);
            return undefined;
        }

        if (method.symbolKind !== SymbolKind.Function) {
            diagnostic.addError(identifier.location, `'${identifier.text}' is not a method 💢`);
            return undefined;
        }

        return analyzeFunctionCaller(scope, identifier, member.argList, method, exprValue.templateTranslate);
    } else {
        // フィールド診断
        return analyzeVariableAccess(classScope, identifier);
    }
}

// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
function analyzeCast(scope: SymbolScope, cast: NodeCast): DeducedType | undefined {
    const castedType = analyzeType(scope, cast.type);
    analyzeAssign(scope, cast.assign);
    return castedType;
}

// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
function analyzeLiteral(scope: SymbolScope, literal: NodeLiteral): DeducedType | undefined {
    const literalValue = literal.value;
    if (literalValue.kind === TokenKind.Number) {
        switch (literalValue.numeric) {
        case NumberLiterals.Integer:
            return {symbol: builtinIntType, sourceScope: undefined};
        case NumberLiterals.Float:
            return {symbol: builtinFloatType, sourceScope: undefined};
        case NumberLiterals.Double:
            return {symbol: builtinDoubleType, sourceScope: undefined};
        }
    }

    if (literalValue.kind === TokenKind.String) {
        return {symbol: builtinStringType, sourceScope: undefined};
    }

    if (literalValue.text === 'true' || literalValue.text === 'false') {
        return {symbol: builtinBoolType, sourceScope: undefined};
    }

    // FIXME: null へ対処?
    return undefined;
}

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
function analyzeFuncCall(scope: SymbolScope, funcCall: NodeFuncCall): DeducedType | undefined {
    let searchScope = scope;
    if (funcCall.scope !== undefined) {
        const namespaceScope = analyzeScope(scope, funcCall.scope);
        if (namespaceScope === undefined) return undefined;
        searchScope = namespaceScope;
    }

    const calleeFunc = findSymbolWithParent(searchScope, funcCall.identifier.text)?.symbol;
    if (calleeFunc === undefined) {
        diagnostic.addError(funcCall.identifier.location, `'${funcCall.identifier.text}' is not defined 💢`);
        return undefined;
    }

    if (calleeFunc.symbolKind === SymbolKind.Type) {
        return analyzeConstructorByType(scope, funcCall.identifier, funcCall.argList, calleeFunc, undefined);
    }

    if (calleeFunc.symbolKind !== SymbolKind.Function) {
        diagnostic.addError(funcCall.identifier.location, `'${funcCall.identifier.text}' is not a function 💢`);
        return undefined;
    }

    return analyzeFunctionCaller(scope, funcCall.identifier, funcCall.argList, calleeFunc, undefined);
}

function analyzeFunctionCaller(
    scope: SymbolScope,
    callerIdentifier: ParsingToken,
    callerArgList: NodeArgList,
    calleeFunc: SymbolicFunction,
    templateTranslate: TemplateTranslation | undefined
) {
    const callerArgTypes = analyzeArgList(scope, callerArgList);
    return checkFunctionMatch({
        scope: scope,
        callerIdentifier: callerIdentifier,
        callerRange: callerArgList.nodeRange,
        callerArgRanges: callerArgList.argList.map(arg => arg.assign.nodeRange),
        callerArgTypes: callerArgTypes,
        calleeFunc: calleeFunc,
        templateTranslators: [templateTranslate]
    });
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

    const varIdentifier = varAccess.identifier;
    return analyzeVariableAccess(scope, varIdentifier);
}

function analyzeVariableAccess(scope: SymbolScope, varIdentifier: ParsingToken) {
    const declared = findSymbolWithParent(scope, varIdentifier.text);
    if (declared === undefined) {
        diagnostic.addError(varIdentifier.location, `'${varIdentifier.text}' is not defined 💢`);
        return undefined;
    } else if (declared.symbol.symbolKind !== SymbolKind.Variable) {
        diagnostic.addError(varIdentifier.location, `'${varIdentifier.text}' is not a variable 💢`);
        return undefined;
    }

    scope.referencedList.push({
        declaredSymbol: declared.symbol,
        referencedToken: varIdentifier
    });

    if (declared.symbol.type === undefined) return undefined;
    return declared.symbol.type;
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
    // 左から畳み込みを行う
    let cursor = assign;
    let lhs = analyzeCondition(scope, assign.condition);
    for (; ;) {
        if (cursor.tail === undefined) break;
        const rhs = analyzeCondition(scope, cursor.tail.assign.condition);
        lhs = analyzeAssignOp(scope, cursor.tail.operator, lhs, rhs, cursor.condition.nodeRange, cursor.tail.assign.condition.nodeRange);
        cursor = cursor.tail.assign;
    }
    return lhs;
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
export function analyzeCondition(scope: SymbolScope, condition: NodeCondition): DeducedType | undefined {
    const exprType = analyzeExpr(scope, condition.expr);
    if (condition.ternary === undefined) return exprType;

    checkTypeMatch(exprType, {symbol: builtinBoolType, sourceScope: undefined}, condition.expr.nodeRange);

    const trueAssign = analyzeAssign(scope, condition.ternary.trueAssign);
    const falseAssign = analyzeAssign(scope, condition.ternary.falseAssign);

    if (trueAssign === undefined && falseAssign !== undefined) return falseAssign;
    if (trueAssign !== undefined && falseAssign === undefined) return trueAssign;
    if (trueAssign === undefined || falseAssign === undefined) return undefined;

    if (isTypeMatch(trueAssign, falseAssign)) return falseAssign;
    if (isTypeMatch(falseAssign, trueAssign)) return trueAssign;

    diagnostic.addError(getRangedLocation(condition.ternary.trueAssign.nodeRange.start, condition.ternary.falseAssign.nodeRange.end),
        `Type mismatches between '${stringifyDeducedType(trueAssign)}' and '${stringifyDeducedType(falseAssign)}' 💢`);
    return undefined;
}

// EXPROP        ::= MATHOP | COMPOP | LOGICOP | BITOP
function analyzeExprOp(
    scope: SymbolScope, operator: ParsingToken,
    lhs: DeducedType | undefined, rhs: DeducedType | undefined,
    leftRange: ParsedRange, rightRange: ParsedRange
): DeducedType | undefined {
    if (operator.kind !== TokenKind.Reserved) return undefined;
    if (lhs === undefined || rhs === undefined) return undefined;

    if (operator.property.isMathOp) {
        return analyzeMathOp(scope, operator, lhs, rhs, leftRange, rightRange);
    } else if (operator.property.isCompOp) {
        return analyzeCompOp(scope, operator, lhs, rhs, leftRange, rightRange);
    } else if (operator.property.isLogicOp) {
        return analyzeLogicOp(scope, operator, lhs, rhs, leftRange, rightRange);
    } else if (operator.property.isBitOp) {
        return analyzeBitOp(scope, operator, lhs, rhs, leftRange, rightRange);
    }
    assert(false);
}

function analyzeOperatorAlias(
    scope: SymbolScope, operator: ParsingToken,
    lhs: DeducedType, rhs: DeducedType,
    leftRange: ParsedRange, rightRange: ParsedRange,
    alias: string
) {
    if (isSourcePrimitiveType(lhs.symbol.sourceType)) {
        diagnostic.addError(operator.location, `Operator '${alias}' of '${stringifyDeducedType(lhs)}' is not defined 💢`);
        return undefined;
    }

    if (lhs.sourceScope === undefined) return undefined;

    const classScope = lhs.symbol.membersScope;
    if (classScope === undefined) return undefined;

    const aliasFunction = findSymbolShallowly(classScope, alias);
    if (aliasFunction === undefined || aliasFunction.symbolKind !== SymbolKind.Function) {
        diagnostic.addError(operator.location, `Operator '${alias}' of '${stringifyDeducedType(lhs)}' is not defined 💢`);
        return undefined;
    }

    return checkFunctionMatch({
        scope: scope,
        callerIdentifier: operator,
        callerRange: {start: operator, end: operator},
        callerArgRanges: [rightRange],
        callerArgTypes: [rhs],
        calleeFunc: aliasFunction,
        templateTranslators: [lhs.templateTranslate, rhs.templateTranslate]
    });
}

// BITOP         ::= '&' | '|' | '^' | '<<' | '>>' | '>>>'
function analyzeBitOp(
    scope: SymbolScope, operator: ParsingToken,
    lhs: DeducedType, rhs: DeducedType,
    leftRange: ParsedRange, rightRange: ParsedRange
): DeducedType | undefined {
    if (lhs.symbol.sourceType === PrimitiveType.Number && rhs.symbol.sourceType === PrimitiveType.Number) return lhs;

    const alias = bitOpAliases.get(operator.text);
    assert(alias !== undefined);

    // 左辺がプリミティブ型なら、右辺の型のオペレータを仕様
    return isSourcePrimitiveType(lhs.symbol.sourceType)
        ? analyzeOperatorAlias(scope, operator, rhs, lhs, rightRange, leftRange, alias[1])
        : analyzeOperatorAlias(scope, operator, lhs, rhs, leftRange, rightRange, alias[0]);
}

const bitOpAliases = new Map<string, [string, string]>([
    ['&', ['opAnd', 'opAnd_r']],
    ['|', ['opOr', 'opOr_r']],
    ['^', ['opXor', 'opXor_r']],
    ['<<', ['opShl', 'opShl_r']],
    ['>>', ['opShr', 'opShr_r']],
    ['>>>', ['opShrU', 'opShrU_r']]
]);

// MATHOP        ::= '+' | '-' | '*' | '/' | '%' | '**'
function analyzeMathOp(
    scope: SymbolScope, operator: ParsingToken,
    lhs: DeducedType, rhs: DeducedType,
    leftRange: ParsedRange, rightRange: ParsedRange
): DeducedType | undefined {
    if (lhs.symbol.sourceType === PrimitiveType.Number && rhs.symbol.sourceType === PrimitiveType.Number) return lhs;

    const alias = mathOpAliases.get(operator.text);
    assert(alias !== undefined);

    // 左辺がプリミティブ型なら、右辺の型のオペレータを仕様
    return isSourcePrimitiveType(lhs.symbol.sourceType)
        ? analyzeOperatorAlias(scope, operator, rhs, lhs, rightRange, leftRange, alias[1])
        : analyzeOperatorAlias(scope, operator, lhs, rhs, leftRange, rightRange, alias[0]);
}

const mathOpAliases = new Map<string, [string, string]>([
    ['+', ['opAdd', 'opAdd_r']],
    ['-', ['opSub', 'opSub_r']],
    ['*', ['opMul', 'opMul_r']],
    ['/', ['opDiv', 'opDiv_r']],
    ['%', ['opMod', 'opMod_r']],
    ['**', ['opPow', 'opPow_r']]
]);

// COMPOP        ::= '==' | '!=' | '<' | '<=' | '>' | '>=' | 'is' | '!is'
function analyzeCompOp(
    scope: SymbolScope, operator: ParsingToken,
    lhs: DeducedType, rhs: DeducedType,
    leftRange: ParsedRange, rightRange: ParsedRange
): DeducedType | undefined {
    if (lhs.symbol.sourceType === rhs.symbol.sourceType) {
        return {symbol: builtinBoolType, sourceScope: undefined};
    }

    const alias = compOpAliases.get(operator.text);
    assert(alias !== undefined);
    return analyzeOperatorAlias(scope, operator, lhs, rhs, leftRange, rightRange, alias);
}

const compOpAliases = new Map<string, string>([
    ['==', 'opEquals'],
    ['!=', 'opEquals'],
    ['<', 'opCmp'],
    ['<=', 'opCmp'],
    ['>', 'opCmp'],
    ['>=', 'opCmp'],
    ['is', 'opEquals'],
    ['!is', 'opEquals'],
]);

// LOGICOP       ::= '&&' | '||' | '^^' | 'and' | 'or' | 'xor'
function analyzeLogicOp(
    scope: SymbolScope, operator: ParsingToken,
    lhs: DeducedType, rhs: DeducedType,
    leftRange: ParsedRange, rightRange: ParsedRange
): DeducedType | undefined {
    checkTypeMatch(lhs, {symbol: builtinBoolType, sourceScope: undefined}, leftRange);
    checkTypeMatch(rhs, {symbol: builtinBoolType, sourceScope: undefined}, rightRange);
    return {symbol: builtinBoolType, sourceScope: undefined};
}

// ASSIGNOP      ::= '=' | '+=' | '-=' | '*=' | '/=' | '|=' | '&=' | '^=' | '%=' | '**=' | '<<=' | '>>=' | '>>>='
function analyzeAssignOp(
    scope: SymbolScope, operator: ParsingToken,
    lhs: DeducedType | undefined, rhs: DeducedType | undefined,
    leftRange: ParsedRange, rightRange: ParsedRange
): DeducedType | undefined {
    if (lhs === undefined || rhs === undefined) return undefined;
    if (lhs.symbol.sourceType === PrimitiveType.Number && rhs.symbol.sourceType === PrimitiveType.Number) return lhs;

    if (operator.text === '=') {
        if (isTypeMatch(rhs, lhs)) return lhs;
    }

    const alias = assignOpAliases.get(operator.text);
    assert(alias !== undefined);
    return analyzeOperatorAlias(scope, operator, lhs, rhs, leftRange, rightRange, alias);
}

const assignOpAliases = new Map<string, string>([
    ['=', 'opAssign'],
    ['+=', 'opAddAssign'],
    ['-=', 'opSubAssign'],
    ['*=', 'opMulAssign'],
    ['/=', 'opDivAssign'],
    ['%=', 'opModAssign'],
    ['**=', 'opPowAssign'],
    ['&=', 'opAndAssign'],
    ['|=', 'opOrAssign'],
    ['^=', 'opXorAssign'],
    ['<<=', 'opShlAssign'],
    ['>>=', 'opShrAssign'],
    ['>>>=', 'opUShrAssign'],
]);

// 解析器のエントリーポイント
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

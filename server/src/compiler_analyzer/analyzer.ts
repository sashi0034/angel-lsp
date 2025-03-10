// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_expressions.html

import {
    funcHeadDestructor,
    isMemberMethodInPostOp,
    NodeArgList,
    NodeAssign,
    NodeCase,
    NodeCast,
    NodeCondition,
    NodeDoWhile,
    NodeExpr,
    NodeExprPostOp,
    NodeExprPostOp1,
    NodeExprPostOp2,
    NodeExprStat,
    NodeExprTerm,
    NodeExprTerm2,
    NodeExprValue,
    NodeFor,
    NodeForEach,
    NodeForEachVar,
    NodeFunc,
    NodeFuncCall,
    NodeIf,
    NodeInitList,
    NodeLambda,
    NodeLiteral,
    NodeName,
    NodeParamList,
    NodeReturn,
    NodeScope,
    NodeStatBlock,
    NodeStatement,
    NodeSwitch,
    NodeTry,
    NodeType,
    NodeVar,
    NodeVarAccess,
    NodeWhile
} from "../compiler_parser/nodes";
import {
    isDefinitionNodeClassOrInterface,
    SymbolFunction,
    SymbolFunctionHolder,
    SymbolObjectHolder,
    SymbolType,
    SymbolVariable
} from "./symbolObject";
import {NumberLiterals, TokenKind, TokenObject} from "../compiler_tokenizer/tokenObject";
import {
    createAnonymousIdentifier,
    findGlobalScope, resolveActiveScope,
    isSymbolConstructorInScope, SymbolScope
} from "./symbolScope";
import {checkFunctionMatch} from "./checkFunction";
import {canTypeConvert, checkTypeMatch, isAllowedToAccessMember} from "./checkType";
import {
    builtinBoolType,
    resolvedBuiltinBool,
    resolvedBuiltinDouble,
    resolvedBuiltinFloat,
    resolvedBuiltinInt,
    tryGetBuiltInType
} from "./symbolBuiltin";
import {complementHintForScope, ComplementKind} from "./complementHint";
import {
    findSymbolShallowly,
    findSymbolWithParent,
    getSymbolAndScopeIfExist,
    isResolvedAutoType,
    stringifyResolvedType,
    stringifyResolvedTypes,
    TemplateTranslation
} from "./symbolUtils";
import {Mutable} from "../utils/utilities";
import {getGlobalSettings} from "../core/settings";
import assert = require("node:assert");
import {ResolvedType} from "./resolvedType";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {TextLocation} from "../compiler_tokenizer/textLocation";
import {getBoundingLocationBetween, TokenRange} from "../compiler_parser/tokenRange";
import {AnalyzerScope} from "./analyzerScope";

export type HoistQueue = (() => void)[];

export type AnalyzeQueue = (() => void)[];

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'

// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))

// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
export function analyzeFunc(scope: SymbolScope, func: NodeFunc) {
    if (func.head === funcHeadDestructor) {
        analyzeStatBlock(scope, func.statBlock);
        return;
    }

    // Add arguments to the scope
    analyzeParamList(scope, func.paramList);

    // Analyze the scope
    analyzeStatBlock(scope, func.statBlock);
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
export function analyzeVar(scope: SymbolScope, nodeVar: NodeVar, isInstanceMember: boolean) {
    let varType = analyzeType(scope, nodeVar.type);

    for (const declaredVar of nodeVar.variables) {
        const initializer = declaredVar.initializer;
        if (initializer === undefined) continue;

        const initType = analyzeVarInitializer(scope, varType, declaredVar.identifier, initializer);

        // Resolve the auto type
        if (initType !== undefined && isResolvedAutoType(varType)) {
            varType = initType;
        }
    }

    insertVariables(scope, varType, nodeVar, isInstanceMember);
}

// TYPE IDENTIFIER
export function analyzeForEachVar(scope: SymbolScope, nodeForEachVar: NodeForEachVar, nodeAssign: NodeAssign) {
    // TODO: figure out how to resolve `opForValue{N}`
    // when `auto` is used
    const variable: SymbolVariable = SymbolVariable.create({
        defToken: nodeForEachVar.identifier,
        defScope: scope.scopePath,
        type: analyzeType(scope, nodeForEachVar.type),
        isInstanceMember: false,
        accessRestriction: undefined,
    });
    scope.insertSymbolAndCheck(variable);
}

export function insertVariables(scope: SymbolScope, varType: ResolvedType | undefined, nodeVar: NodeVar, isInstanceMember: boolean) {
    for (const declaredVar of nodeVar.variables) {
        const variable: SymbolVariable = SymbolVariable.create({
            defToken: declaredVar.identifier,
            defScope: scope.scopePath,
            type: varType,
            isInstanceMember: isInstanceMember,
            accessRestriction: nodeVar.accessor,
        });
        scope.insertSymbolAndCheck(variable);
    }
}

export function analyzeVarInitializer(
    scope: SymbolScope,
    varType: ResolvedType | undefined,
    varIdentifier: TokenObject,
    initializer: NodeInitList | NodeAssign | NodeArgList
): ResolvedType | undefined {
    if (initializer.nodeName === NodeName.InitList) {
        return analyzeInitList(scope, initializer);
    } else if (initializer.nodeName === NodeName.Assign) {
        const exprType = analyzeAssign(scope, initializer);
        checkTypeMatch(exprType, varType, initializer.nodeRange);
        return exprType;
    } else if (initializer.nodeName === NodeName.ArgList) {
        if (varType === undefined || varType.symbolType.isFunction()) return undefined;
        return analyzeConstructorCaller(scope, varIdentifier, initializer, varType);
    }
}

// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'

// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'

// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'

// MIXIN         ::= 'mixin' CLASS

// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
export function analyzeStatBlock(scope: SymbolScope, statBlock: NodeStatBlock) {
    // Append completion information to the scope
    complementHintForScope(scope, statBlock.nodeRange);

    for (const statement of statBlock.statementList) {
        if (statement.nodeName === NodeName.Var) {
            analyzeVar(scope, statement, false);
        } else {
            analyzeStatement(scope, statement as NodeStatement);
        }
    }
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' [EXPR | 'void']] {',' TYPE TYPEMOD [IDENTIFIER] ['=' [EXPR | 'void']]})] ')'
export function analyzeParamList(scope: SymbolScope, paramList: NodeParamList) {
    for (const param of paramList) {
        if (param.defaultExpr === undefined || param.defaultExpr.nodeName === NodeName.ExprVoid) continue;
        analyzeExpr(scope, param.defaultExpr);
    }
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
export function analyzeType(scope: SymbolScope, nodeType: NodeType): ResolvedType | undefined {
    const reservedType = nodeType.isArray ? undefined : analyzeReservedType(scope, nodeType);
    if (reservedType !== undefined) return reservedType;

    const typeIdentifier = nodeType.dataType.identifier;

    const searchScope = nodeType.scope !== undefined
        ? (analyzeScope(scope, nodeType.scope) ?? scope)
        : scope;

    let givenTypeTemplates = nodeType.typeTemplates;
    let givenIdentifier = typeIdentifier.text;

    if (nodeType.isArray) {
        // If the type is an array, we replace the identifier with array type.
        givenIdentifier = getGlobalSettings().builtinArrayType;
        const copiedNodeType: Mutable<NodeType> = {...nodeType};
        copiedNodeType.isArray = false;
        givenTypeTemplates = [copiedNodeType];
    }

    let symbolAndScope = findSymbolWithParent(searchScope, givenIdentifier);
    if (symbolAndScope !== undefined
        && isSymbolConstructorInScope(symbolAndScope)
        && symbolAndScope.scope.parentScope !== undefined
    ) {
        // When traversing the parent hierarchy, the constructor is sometimes found before the class type,
        // in which case search further up the hierarchy.
        symbolAndScope = getSymbolAndScopeIfExist(
            findSymbolShallowly(symbolAndScope.scope.parentScope, givenIdentifier), symbolAndScope.scope.parentScope);
    }
    if (symbolAndScope === undefined) {
        analyzerDiagnostic.add(typeIdentifier.location, `'${givenIdentifier}' is not defined.`);
        return undefined;
    }

    const {symbol: foundSymbol, scope: foundScope} = symbolAndScope;
    if (foundSymbol.isFunctionHolder() && foundSymbol.first.defNode.nodeName === NodeName.FuncDef) {
        return completeAnalyzingType(scope, typeIdentifier, foundSymbol.first, foundScope, true);
    } else if (foundSymbol instanceof SymbolType === false) {
        analyzerDiagnostic.add(typeIdentifier.location, `'${givenIdentifier}' is not a type.`);
        return undefined;
    } else {
        const typeTemplates = analyzeTemplateTypes(scope, givenTypeTemplates, foundSymbol.templateTypes);
        return completeAnalyzingType(scope, typeIdentifier, foundSymbol, foundScope, undefined, typeTemplates);
    }
}

function completeAnalyzingType(
    scope: SymbolScope,
    identifier: TokenObject,
    foundSymbol: SymbolType | SymbolFunction,
    foundScope: SymbolScope,
    isHandler?: boolean,
    typeTemplates?: TemplateTranslation | undefined,
): ResolvedType | undefined {
    scope.referencedList.push({
        declaredSymbol: foundSymbol,
        referencedToken: identifier
    });

    return ResolvedType.create({
        symbolType: foundSymbol,
        isHandler: isHandler,
        templateTranslate: typeTemplates
    });
}

// PRIMTYPE | '?' | 'auto'
function analyzeReservedType(scope: SymbolScope, nodeType: NodeType): ResolvedType | undefined {
    const typeIdentifier = nodeType.dataType.identifier;
    if (typeIdentifier.kind !== TokenKind.Reserved) return;

    if (nodeType.scope !== undefined) {
        analyzerDiagnostic.add(typeIdentifier.location, `Invalid scope.`);
    }

    const foundBuiltin = tryGetBuiltInType(typeIdentifier);
    if (foundBuiltin !== undefined) return new ResolvedType(foundBuiltin);

    return undefined;
}

function analyzeTemplateTypes(scope: SymbolScope, nodeType: NodeType[], templateTypes: TokenObject[] | undefined) {
    if (templateTypes === undefined) return undefined;

    const translation: TemplateTranslation = new Map();
    for (let i = 0; i < nodeType.length; i++) {
        if (i >= templateTypes.length) {
            analyzerDiagnostic.add(
                (nodeType[nodeType.length - 1].nodeRange.getBoundingLocation()),
                `Too many template types.`);
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

        // Search for the scope corresponding to the name.
        let found: SymbolScope | undefined = undefined;
        for (; ;) {
            found = scopeIterator.lookupScope(nextScope.text);
            if (found?.linkedNode?.nodeName === NodeName.Func) found = undefined;
            if (found !== undefined) break;
            if (i == 0 && scopeIterator.parentScope !== undefined) {
                // If it is not a global scope, search further up the hierarchy.
                scopeIterator = scopeIterator.parentScope;
            } else {
                analyzerDiagnostic.add(nextScope.location, `Undefined scope: ${nextScope.text}`);
                return undefined;
            }
        }

        // Update the scope iterator.
        scopeIterator = found;

        // Append a hint for completion of the namespace to the scope.
        const complementRange: TextLocation = nextScope.location.withEnd(
            nextScope.getNextOrSelf().getNextOrSelf().location.start);
        parentScope.pushCompletionHint({
            complementKind: ComplementKind.NamespaceSymbol,
            complementLocation: complementRange,
            namespaceList: nodeScope.scopeList.slice(0, i + 1)
        });
    }

    return scopeIterator;
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')

// PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'

// FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property'}

// STATEMENT     ::= (IF | FOR | FOREACH | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
function analyzeStatement(scope: SymbolScope, statement: NodeStatement) {
    switch (statement.nodeName) {
    case NodeName.If:
        analyzeIf(scope, statement);
        break;
    case NodeName.For: {
        const childScope = scope.insertScope(createAnonymousIdentifier(), statement);
        analyzeFor(childScope, statement);
        break;
    }
    case NodeName.ForEach: {
        const childScope = scope.insertScope(createAnonymousIdentifier(), statement);
        analyzeForEach(childScope, statement);
        break;
    }
    case NodeName.While: {
        const childScope = scope.insertScope(createAnonymousIdentifier(), statement);
        analyzeWhile(childScope, statement);
        break;
    }
    case NodeName.Return:
        analyzeReturn(scope, statement);
        break;
    case NodeName.StatBlock: {
        const childScope = scope.insertScope(createAnonymousIdentifier(), statement);
        analyzeStatBlock(childScope, statement);
        break;
    }
    case NodeName.Break:
        break;
    case NodeName.Continue:
        break;
    case NodeName.DoWhile: {
        const childScope = scope.insertScope(createAnonymousIdentifier(), statement);
        analyzeDoWhile(childScope, statement);
        break;
    }
    case NodeName.Switch:
        analyzeSwitch(scope, statement);
        break;
    case NodeName.ExprStat:
        analyzeExprStat(scope, statement);
        break;
    case NodeName.Try: {
        const childScope = scope.insertScope(createAnonymousIdentifier(), statement);
        analyzeTry(childScope, statement);
        break;
    }
    default:
        break;
    }
}

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
function analyzeSwitch(scope: SymbolScope, ast: NodeSwitch) {
    analyzeAssign(scope, ast.assign);
    for (const c of ast.caseList) {
        analyzeCase(scope, c);
    }
}

// BREAK         ::= 'break' ';'

// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
function analyzeFor(scope: SymbolScope, nodeFor: NodeFor) {
    if (nodeFor.initial.nodeName === NodeName.Var) analyzeVar(scope, nodeFor.initial, false);
    else analyzeExprStat(scope, nodeFor.initial);

    if (nodeFor.condition !== undefined) analyzeExprStat(scope, nodeFor.condition);

    for (const inc of nodeFor.incrementList) {
        analyzeAssign(scope, inc);
    }

    if (nodeFor.statement !== undefined) analyzeStatement(scope, nodeFor.statement);
}

// FOREACH       ::= 'foreach' '(' TYPE IDENTIFIER {',' TYPE INDENTIFIER} ':' ASSIGN ')' STATEMENT
function analyzeForEach(scope: SymbolScope, nodeForEach: NodeForEach) {
    // analyze assign first, since vars may need it
    analyzeAssign(scope, nodeForEach.assign as NodeAssign);

    for (const v of nodeForEach.variables) {
        analyzeForEachVar(scope, v, nodeForEach.assign as NodeAssign);
    }

    if (nodeForEach.statement !== undefined) analyzeStatement(scope, nodeForEach.statement);
}

// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
function analyzeWhile(scope: SymbolScope, nodeWhile: NodeWhile) {
    const assignType = analyzeAssign(scope, nodeWhile.assign);
    checkTypeMatch(assignType, new ResolvedType(builtinBoolType), nodeWhile.assign.nodeRange);

    if (nodeWhile.statement !== undefined) analyzeStatement(scope, nodeWhile.statement);
}

// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
function analyzeDoWhile(scope: SymbolScope, doWhile: NodeDoWhile) {
    analyzeStatement(scope, doWhile.statement);

    if (doWhile.assign === undefined) return;
    const assignType = analyzeAssign(scope, doWhile.assign);
    checkTypeMatch(assignType, new ResolvedType(builtinBoolType), doWhile.assign.nodeRange);
}

// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
function analyzeIf(scope: SymbolScope, nodeIf: NodeIf) {
    const conditionType = analyzeAssign(scope, nodeIf.condition);
    checkTypeMatch(conditionType, new ResolvedType(builtinBoolType), nodeIf.condition.nodeRange);

    if (nodeIf.thenStat !== undefined) analyzeStatement(scope, nodeIf.thenStat);
    if (nodeIf.elseStat !== undefined) analyzeStatement(scope, nodeIf.elseStat);
}

// CONTINUE      ::= 'continue' ';'

// EXPRSTAT      ::= [ASSIGN] ';'
function analyzeExprStat(scope: SymbolScope, exprStat: NodeExprStat) {
    if (exprStat.assign === undefined) return;
    const assign = analyzeAssign(scope, exprStat.assign);
    if (assign?.isHandler !== true && assign?.symbolType.isFunction()) {
        analyzerDiagnostic.add(exprStat.assign.nodeRange.getBoundingLocation(), `Function call without handler.`);
    }
}

// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK
function analyzeTry(scope: SymbolScope, nodeTry: NodeTry) {
    analyzeStatBlock(scope, nodeTry.tryBlock);
    if (nodeTry.catchBlock !== undefined) analyzeStatBlock(scope, nodeTry.catchBlock);
}

// RETURN        ::= 'return' [ASSIGN] ';'
function analyzeReturn(scope: SymbolScope, nodeReturn: NodeReturn) {
    const returnType = nodeReturn.assign !== undefined ? analyzeAssign(scope, nodeReturn.assign) : undefined;

    const functionScope = scope.takeParentByNode([NodeName.Func, NodeName.VirtualProp, NodeName.Lambda]);
    if (functionScope === undefined || functionScope.linkedNode === undefined) return;

    // TODO: Support for lambda

    if (functionScope.linkedNode.nodeName === NodeName.Func) {
        const functionReturnHolder = functionScope.parentScope?.symbolTable.get(functionScope.key);
        if (functionReturnHolder?.isFunctionHolder() === false) return;

        // Select suitable overload if there are multiple overloads
        let functionReturn = functionReturnHolder.first;
        for (const nextOverload of functionReturnHolder.overloadList) {
            if (nextOverload.defNode === functionScope.linkedNode) {
                functionReturn = nextOverload;
                break;
            }
        }

        const expectedReturn = functionReturn.returnType?.symbolType;
        if (expectedReturn instanceof SymbolType && expectedReturn?.identifierText === 'void') {
            if (nodeReturn.assign === undefined) return;
            analyzerDiagnostic.add(nodeReturn.nodeRange.getBoundingLocation(), `Function does not return a value.`);
        } else {
            checkTypeMatch(returnType, functionReturn.returnType, nodeReturn.nodeRange);
        }
    } else if (functionScope.linkedNode.nodeName === NodeName.VirtualProp) {
        const key = functionScope.key;
        const isGetter = key.startsWith('get_');
        if (isGetter === false) {
            if (nodeReturn.assign === undefined) return;
            analyzerDiagnostic.add(
                nodeReturn.nodeRange.getBoundingLocation(),
                `Property setter does not return a value.`);
            return;
        }

        const varName = key.substring(4, key.length);
        const functionReturn = functionScope.parentScope?.symbolTable.get(varName);
        if (functionReturn === undefined || functionReturn instanceof SymbolVariable === false) return;

        checkTypeMatch(returnType, functionReturn.type, nodeReturn.nodeRange);
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
function analyzeExpr(scope: SymbolScope, expr: NodeExpr): ResolvedType | undefined {
    // Evaluate by Shunting Yard Algorithm
    // https://qiita.com/phenan/items/df157fef2fea590e3fa9

    type Term = [ResolvedType | undefined, TokenRange];
    type Op = TokenObject;

    function isOp(termOrOp: (Term | Op)): termOrOp is Op {
        return 'text' in termOrOp;
    }

    function precedence(termOrOp: (Term | Op)) {
        return isOp(termOrOp) ? getOperatorPrecedence(termOrOp) : 1;
    }

    const inputList: (Term | Op)[] = [];
    for (let cursor: NodeExpr | undefined = expr; ;) {
        inputList.push([analyzeExprTerm(scope, cursor.head), cursor.head.nodeRange]);
        if (cursor.tail === undefined) break;
        inputList.push(cursor.tail.operator);
        cursor = cursor.tail.expression;
    }

    const stackList: (Term | Op)[] = [];
    const outputList: (Term | Op)[] = [];

    while (inputList.length > 0 || stackList.length > 0) {
        const inputToStack: boolean = stackList.length === 0
            || (inputList.length > 0 && precedence(inputList[0]) > precedence(stackList[stackList.length - 1]));

        if (inputToStack) {
            stackList.push(inputList.shift()!);
        } else {
            outputList.push(stackList.pop()!);
        }
    }

    const outputTerm: Term[] = [];
    while (outputList.length > 0) {
        const item = outputList.shift()!;
        if (isOp(item)) {
            const rhs = outputTerm.pop();
            const lhs = outputTerm.pop();
            if (lhs === undefined || rhs === undefined) return undefined;

            outputTerm.push([analyzeExprOp(
                scope, item, lhs[0], rhs[0], lhs[1], rhs[1]), new TokenRange(lhs[1].start, rhs[1].end)]);
        } else {
            outputTerm.push(item);
        }
    }

    return outputTerm.length > 0 ? outputTerm[0][0] : undefined;
}

function getOperatorPrecedence(operator: TokenObject): number {
    const op = operator.text;
    switch (op) {
    case '**':
        return 0;
    case '*':
    case '/':
    case '%':
        return -1;
    case '+':
    case '-':
        return -2;
    case '<<':
    case '>>':
    case '>>>':
        return -3;
    case '&':
        return -4;
    case '^':
        return -5;
    case '|':
        return -6;
    case '<':
    case '>':
    case '<=':
    case '>=':
        return -7;
    case '==':
    case '!=':
    case 'xor':
    case '^^':
    case 'is':
    case '!is':
        return -8;
    case 'and':
    case '&&':
        return -9;
    case 'or':
    case '||':
        return -10;
    default:
        assert(false);
    }
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function analyzeExprTerm(scope: SymbolScope, ast: NodeExprTerm): ResolvedType | undefined {
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
        exprValue = analyzeExprPostOp(scope, postOp, exprValue, exprTerm.nodeRange);
    }

    return exprValue;
}

// EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
function analyzeExprValue(scope: SymbolScope, exprValue: NodeExprValue): ResolvedType | undefined {
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
        return analyzeLambda(scope, exprValue);
    default:
        break;
    }
    return undefined;
}

// CONSTRUCTCALL ::= TYPE ARGLIST
export function analyzeConstructorCaller(
    scope: SymbolScope,
    callerIdentifier: TokenObject,
    callerArgList: NodeArgList,
    constructorType: ResolvedType
): ResolvedType | undefined {
    const constructor = findConstructorForResolvedType(constructorType);
    if (constructor === undefined || constructor.isFunctionHolder() === false) {
        return analyzeBuiltinConstructorCaller(scope, callerIdentifier, callerArgList, constructorType);
    }

    analyzeFunctionCaller(scope, callerIdentifier, callerArgList, constructor, constructorType.templateTranslate);
    return constructorType;
}

export function findConstructorForResolvedType(resolvedType: ResolvedType | undefined): SymbolObjectHolder | undefined {
    if (resolvedType?.sourceScope === undefined) return undefined;

    const constructorIdentifier = resolvedType.symbolType.identifierText;
    const classScope = resolveActiveScope(resolvedType.sourceScope).lookupScope(constructorIdentifier);
    return classScope !== undefined ? findSymbolShallowly(classScope, constructorIdentifier) : undefined;
}

function analyzeBuiltinConstructorCaller(
    scope: SymbolScope,
    callerIdentifier: TokenObject,
    callerArgList: NodeArgList,
    constructorType: ResolvedType
) {
    const constructorIdentifier = constructorType.symbolType.identifierText;
    if (constructorType.sourceScope === undefined) return undefined;

    if (constructorType.symbolType instanceof SymbolType
        && constructorType.symbolType.defNode?.nodeName === NodeName.Enum) {
        // Constructor for enum
        const argList = callerArgList.argList;
        if (argList.length != 1 || canTypeConvert(
            analyzeAssign(scope, argList[0].assign),
            resolvedBuiltinInt) === false) {
            analyzerDiagnostic.add(
                callerIdentifier.location,
                `Enum constructor '${constructorIdentifier}' requires an integer.`);
        }

        scope.referencedList.push({declaredSymbol: constructorType.symbolType, referencedToken: callerIdentifier});

        return constructorType;
    }

    if (callerArgList.argList.length === 0) {
        // Default constructor
        scope.referencedList.push({
            declaredSymbol: constructorType.symbolType,
            referencedToken: callerIdentifier
        });
        return constructorType;
    }

    analyzerDiagnostic.add(callerIdentifier.location, `Constructor '${constructorIdentifier}' is missing.`);
    return undefined;
}

// EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']') | ARGLIST | '++' | '--'
function analyzeExprPostOp(scope: SymbolScope, exprPostOp: NodeExprPostOp, exprValue: ResolvedType, exprRange: TokenRange) {
    if (exprPostOp.postOp === 1) {
        return analyzeExprPostOp1(scope, exprPostOp, exprValue);
    } else if (exprPostOp.postOp === 2) {
        return analyzeExprPostOp2(scope, exprPostOp, exprValue, exprRange);
    }
}

// ('.' (FUNCCALL | IDENTIFIER))
function analyzeExprPostOp1(scope: SymbolScope, exprPostOp: NodeExprPostOp1, exprValue: ResolvedType) {
    if (exprValue.symbolType instanceof SymbolType === false) {
        analyzerDiagnostic.add(exprPostOp.nodeRange.getBoundingLocation(), `Invalid access to type.`);
        return undefined;
    }

    // Append a hint for complement of class members.
    const complementRange = getBoundingLocationBetween(
        exprPostOp.nodeRange.start,
        exprPostOp.nodeRange.start.getNextOrSelf());
    scope.pushCompletionHint({
        complementKind: ComplementKind.InstanceMember,
        complementLocation: complementRange,
        targetType: exprValue.symbolType
    });

    const member = exprPostOp.member;
    const isMemberMethod = isMemberMethodInPostOp(member);

    const identifier = isMemberMethod ? member.identifier : member;
    if (identifier === undefined) return undefined;

    if (isDefinitionNodeClassOrInterface(exprValue.symbolType.defNode) === false) {
        analyzerDiagnostic.add(identifier.location, `'${identifier.text}' is not a member.`);
        return undefined;
    }

    const classScope = exprValue.symbolType.membersScope;
    if (classScope === undefined) return undefined;

    if (isMemberMethod) {
        // Analyze method call.
        const method = findSymbolShallowly(resolveActiveScope(classScope), identifier.text);
        if (method === undefined) {
            analyzerDiagnostic.add(identifier.location, `'${identifier.text}' is not defined.`);
            return undefined;
        }

        if (method.isFunctionHolder() === false) {
            analyzerDiagnostic.add(identifier.location, `'${identifier.text}' is not a method.`);
            return undefined;
        }

        return analyzeFunctionCaller(scope, identifier, member.argList, method, exprValue.templateTranslate);
    } else {
        // Analyze field access.
        return analyzeVariableAccess(scope, resolveActiveScope(classScope), identifier);
    }
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
function analyzeExprPostOp2(scope: SymbolScope, exprPostOp: NodeExprPostOp2, exprValue: ResolvedType, exprRange: TokenRange) {
    const args = exprPostOp.indexingList.map(indexer => analyzeAssign(scope, indexer.assign));
    return analyzeOperatorAlias(
        scope,
        exprPostOp.nodeRange.end,
        exprValue,
        args,
        exprRange,
        exprPostOp.nodeRange,
        'opIndex');
}

// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
function analyzeCast(scope: SymbolScope, cast: NodeCast): ResolvedType | undefined {
    const castedType = analyzeType(scope, cast.type);
    analyzeAssign(scope, cast.assign);
    return castedType;
}

// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
function analyzeLambda(scope: SymbolScope, lambda: NodeLambda): ResolvedType | undefined {
    const childScope = scope.insertScope(createAnonymousIdentifier(), lambda);

    // Append arguments to the scope
    for (const param of lambda.paramList) {
        if (param.identifier === undefined) continue;

        const argument: SymbolVariable = SymbolVariable.create({
            defToken: param.identifier,
            defScope: scope.scopePath,
            type: param.type !== undefined ? analyzeType(scope, param.type) : undefined,
            isInstanceMember: false,
            accessRestriction: undefined,
        });
        childScope.insertSymbolAndCheck(argument);
    }

    if (lambda.statBlock !== undefined) analyzeStatBlock(childScope, lambda.statBlock);

    // TODO: 左辺からラムダ式の型を推定したい

    return undefined;
}

// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
function analyzeLiteral(scope: SymbolScope, literal: NodeLiteral): ResolvedType | undefined {
    const literalValue = literal.value;
    if (literalValue.isNumberToken()) {
        switch (literalValue.numberLiteral) {
        case NumberLiterals.Integer:
            return resolvedBuiltinInt;
        case NumberLiterals.Float:
            return resolvedBuiltinFloat;
        case NumberLiterals.Double:
            return resolvedBuiltinDouble;
        }
    }

    if (literalValue.kind === TokenKind.String) {
        const stringType = scope.getBuiltinStringType();
        return stringType === undefined ? undefined : new ResolvedType(stringType);
    }

    if (literalValue.text === 'true' || literalValue.text === 'false') {
        return resolvedBuiltinBool;
    }

    // FIXME: Handling null?
    return undefined;
}

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
function analyzeFuncCall(scope: SymbolScope, funcCall: NodeFuncCall): ResolvedType | undefined {
    let searchScope = scope;
    if (funcCall.scope !== undefined) {
        const namespaceScope = analyzeScope(scope, funcCall.scope);
        if (namespaceScope === undefined) return undefined;
        searchScope = namespaceScope;
    }

    const calleeFunc = findSymbolWithParent(searchScope, funcCall.identifier.text);
    if (calleeFunc?.symbol === undefined) {
        analyzerDiagnostic.add(funcCall.identifier.location, `'${funcCall.identifier.text}' is not defined.`);
        return undefined;
    }

    const [calleeSymbol, calleeScope] = [calleeFunc.symbol, calleeFunc.scope];

    if (calleeSymbol instanceof SymbolType) {
        const constructorType: ResolvedType = new ResolvedType(calleeSymbol);
        return analyzeConstructorCaller(scope, funcCall.identifier, funcCall.argList, constructorType);
    }

    if (calleeSymbol instanceof SymbolVariable && calleeSymbol.type?.symbolType.isFunction()) {
        return analyzeFunctionCaller(
            scope,
            funcCall.identifier,
            funcCall.argList,
            new SymbolFunctionHolder(calleeSymbol.type.symbolType),
            undefined);
    }

    if (calleeSymbol instanceof SymbolVariable) {
        return analyzeOpCallCaller(scope, funcCall, calleeSymbol);
    }

    if (calleeSymbol.isFunctionHolder() === false) {
        analyzerDiagnostic.add(funcCall.identifier.location, `'${funcCall.identifier.text}' is not a function.`);
        return undefined;
    }

    return analyzeFunctionCaller(scope, funcCall.identifier, funcCall.argList, calleeSymbol, undefined);
}

function analyzeOpCallCaller(scope: SymbolScope, funcCall: NodeFuncCall, calleeVariable: SymbolVariable) {
    const varType = calleeVariable.type;
    if (varType === undefined || varType.sourceScope === undefined) {
        analyzerDiagnostic.add(funcCall.identifier.location, `'${funcCall.identifier.text}' is not callable.`);
        return;
    }

    const classScope = resolveActiveScope(varType.sourceScope).lookupScope(varType.symbolType.identifierText);
    if (classScope === undefined) return undefined;

    const opCall = findSymbolShallowly(classScope, 'opCall');
    if (opCall === undefined || opCall.isFunctionHolder() === false) {
        analyzerDiagnostic.add(
            funcCall.identifier.location,
            `'opCall' is not defined in type '${varType.symbolType.identifierText}'.`);
        return;
    }

    return analyzeFunctionCaller(scope, funcCall.identifier, funcCall.argList, opCall, varType.templateTranslate);
}

function analyzeFunctionCaller(
    scope: SymbolScope,
    callerIdentifier: TokenObject,
    callerArgList: NodeArgList,
    calleeFuncHolder: SymbolFunctionHolder,
    templateTranslate: TemplateTranslation | undefined
) {
    const callerArgTypes = analyzeArgList(scope, callerArgList);

    if (calleeFuncHolder.first.defNode.nodeName === NodeName.FuncDef) {
        // If the callee is a delegate, return it as a function handler.
        const handlerType = new ResolvedType(calleeFuncHolder.first);
        if (callerArgTypes.length === 1 && canTypeConvert(callerArgTypes[0], handlerType)) {
            return callerArgTypes[0];
        }
    }

    // Append a hint for completion of function arguments to the scope.
    const complementRange = getBoundingLocationBetween(
        callerArgList.nodeRange.start,
        callerArgList.nodeRange.end.getNextOrSelf());
    scope.pushCompletionHint({
        complementKind: ComplementKind.CallerArguments,
        complementLocation: complementRange,
        expectedCallee: calleeFuncHolder.first,
        passingRanges: callerArgList.argList.map(arg => arg.assign.nodeRange),
        templateTranslate: templateTranslate
    });

    return checkFunctionMatch({
        scope: scope,
        callerIdentifier: callerIdentifier,
        callerRange: callerArgList.nodeRange,
        callerArgRanges: callerArgList.argList.map(arg => arg.assign.nodeRange),
        callerArgTypes: callerArgTypes,
        calleeFuncHolder: calleeFuncHolder,
        templateTranslators: [templateTranslate]
    });
}

// VARACCESS     ::= SCOPE IDENTIFIER
function analyzeVarAccess(scope: SymbolScope, varAccess: NodeVarAccess): ResolvedType | undefined {
    let accessedScope = scope;

    if (varAccess.scope !== undefined) {
        const namespaceScope = analyzeScope(scope, varAccess.scope);
        if (namespaceScope === undefined) return undefined;
        accessedScope = namespaceScope;
    }

    if (varAccess.identifier === undefined) {
        return undefined;
    }

    const varIdentifier = varAccess.identifier;
    return analyzeVariableAccess(scope, accessedScope, varIdentifier);
}

function analyzeVariableAccess(
    checkingScope: SymbolScope, accessedScope: SymbolScope, varIdentifier: TokenObject
): ResolvedType | undefined {
    const declared = findSymbolWithParent(accessedScope, varIdentifier.text);
    if (declared === undefined) {
        analyzerDiagnostic.add(varIdentifier.location, `'${varIdentifier.text}' is not defined.`);
        return undefined;
    }

    if (declared.symbol instanceof SymbolType) {
        analyzerDiagnostic.add(varIdentifier.location, `'${varIdentifier.text}' is type.`);
        return undefined;
    }

    if (isAllowedToAccessMember(checkingScope, declared.symbol) === false) {
        analyzerDiagnostic.add(varIdentifier.location, `'${varIdentifier.text}' is not public member.`);
        return undefined;
    }

    if (declared.symbol.toList()[0].defToken.location.path !== '') {
        // Keywords such as 'this' have an empty defToken. They do not add to the reference list.
        checkingScope.referencedList.push({
            declaredSymbol: declared.symbol.toList()[0],
            referencedToken: varIdentifier
        });
    }

    if (declared.symbol instanceof SymbolVariable) {
        return declared.symbol.type;
    } else {
        return new ResolvedType(declared.symbol.first);
    }
}

// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
function analyzeArgList(scope: SymbolScope, argList: NodeArgList): (ResolvedType | undefined)[] {
    const types: (ResolvedType | undefined)[] = [];
    for (const arg of argList.argList) {
        types.push(analyzeAssign(scope, arg.assign));
    }
    return types;
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
function analyzeAssign(scope: SymbolScope, assign: NodeAssign): ResolvedType | undefined {
    // Perform a left-fold operation
    let cursor = assign;
    let lhs = analyzeCondition(scope, assign.condition);
    for (; ;) {
        if (cursor.tail === undefined) break;
        const rhs = analyzeCondition(scope, cursor.tail.assign.condition);
        lhs = analyzeAssignOp(
            scope,
            cursor.tail.operator,
            lhs,
            rhs,
            cursor.condition.nodeRange,
            cursor.tail.assign.condition.nodeRange);
        cursor = cursor.tail.assign;
    }
    return lhs;
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
export function analyzeCondition(scope: SymbolScope, condition: NodeCondition): ResolvedType | undefined {
    const exprType = analyzeExpr(scope, condition.expr);
    if (condition.ternary === undefined) return exprType;

    checkTypeMatch(exprType, new ResolvedType(builtinBoolType), condition.expr.nodeRange);

    const trueAssign = analyzeAssign(scope, condition.ternary.trueAssign);
    const falseAssign = analyzeAssign(scope, condition.ternary.falseAssign);

    if (trueAssign === undefined && falseAssign !== undefined) return falseAssign;
    if (trueAssign !== undefined && falseAssign === undefined) return trueAssign;
    if (trueAssign === undefined || falseAssign === undefined) return undefined;

    if (canTypeConvert(trueAssign, falseAssign)) return falseAssign;
    if (canTypeConvert(falseAssign, trueAssign)) return trueAssign;

    analyzerDiagnostic.add(
        getBoundingLocationBetween(
            condition.ternary.trueAssign.nodeRange.start,
            condition.ternary.falseAssign.nodeRange.end),
        `Type mismatches between '${stringifyResolvedType(trueAssign)}' and '${stringifyResolvedType(falseAssign)}'.`);
    return undefined;
}

// EXPROP        ::= MATHOP | COMPOP | LOGICOP | BITOP
function analyzeExprOp(
    scope: SymbolScope, operator: TokenObject,
    lhs: ResolvedType | undefined, rhs: ResolvedType | undefined,
    leftRange: TokenRange, rightRange: TokenRange
): ResolvedType | undefined {
    if (operator.isReservedToken() === false) return undefined;
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
    scope: SymbolScope, operator: TokenObject,
    lhs: ResolvedType, rhs: ResolvedType | (ResolvedType | undefined)[],
    leftRange: TokenRange, rightRange: TokenRange,
    alias: string
) {
    const rhsArgs = Array.isArray(rhs) ? rhs : [rhs];

    if (lhs.symbolType instanceof SymbolType === false) {
        analyzerDiagnostic.add(
            operator.location,
            `Invalid operation '${alias}' between '${stringifyResolvedType(lhs)}' and '${stringifyResolvedTypes(rhsArgs)}'.`);
        return undefined;
    }

    if (lhs.symbolType.isPrimitiveType()) {
        analyzerDiagnostic.add(
            operator.location,
            `Operator '${alias}' of '${stringifyResolvedType(lhs)}' is not defined.`);
        return undefined;
    }

    if (lhs.sourceScope === undefined) return undefined;

    const classScope = lhs.symbolType.membersScope;
    if (classScope === undefined) return undefined;

    const aliasFunction = findSymbolShallowly(resolveActiveScope(classScope), alias);
    if (aliasFunction === undefined || aliasFunction.isFunctionHolder() === false) {
        analyzerDiagnostic.add(
            operator.location,
            `Operator '${alias}' of '${stringifyResolvedType(lhs)}' is not defined.`);
        return undefined;
    }

    return checkFunctionMatch({
        scope: scope,
        callerIdentifier: operator,
        callerRange: new TokenRange(operator, operator),
        callerArgRanges: [rightRange],
        callerArgTypes: rhsArgs,
        calleeFuncHolder: aliasFunction,
        templateTranslators: [lhs.templateTranslate, ...rhsArgs.map(rhs => rhs?.templateTranslate)]
    });
}

// BITOP         ::= '&' | '|' | '^' | '<<' | '>>' | '>>>'
function analyzeBitOp(
    scope: SymbolScope, operator: TokenObject,
    lhs: ResolvedType, rhs: ResolvedType,
    leftRange: TokenRange, rightRange: TokenRange
): ResolvedType | undefined {
    if (lhs.symbolType instanceof SymbolType && rhs.symbolType instanceof SymbolType) {
        if (canTypeConvert(lhs, resolvedBuiltinInt) && canTypeConvert(
            rhs,
            resolvedBuiltinInt)) return resolvedBuiltinInt;
    }

    const alias = bitOpAliases.get(operator.text);
    assert(alias !== undefined);

    // If the left-hand side is a primitive type, use the operator of the right-hand side type
    return lhs.symbolType instanceof SymbolType && lhs.symbolType.isPrimitiveType()
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
    scope: SymbolScope, operator: TokenObject,
    lhs: ResolvedType, rhs: ResolvedType,
    leftRange: TokenRange, rightRange: TokenRange
): ResolvedType | undefined {
    if (lhs.symbolType instanceof SymbolType && rhs.symbolType instanceof SymbolType) {
        if (canTypeConvert(lhs, resolvedBuiltinInt) && canTypeConvert(
            rhs,
            resolvedBuiltinInt)) return resolvedBuiltinInt;
    }

    const alias = mathOpAliases.get(operator.text);
    assert(alias !== undefined);

    // If the left-hand side is a primitive type, use the operator of the right-hand side type
    return lhs.symbolType instanceof SymbolType && lhs.symbolType.isPrimitiveType()
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
    scope: SymbolScope, operator: TokenObject,
    lhs: ResolvedType, rhs: ResolvedType,
    leftRange: TokenRange, rightRange: TokenRange
): ResolvedType | undefined {
    if (lhs.symbolType instanceof SymbolType && rhs.symbolType instanceof SymbolType) {
        if (canTypeConvert(lhs, rhs) || canTypeConvert(rhs, lhs)) {
            return new ResolvedType(builtinBoolType);
        }
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
    scope: SymbolScope, operator: TokenObject,
    lhs: ResolvedType, rhs: ResolvedType,
    leftRange: TokenRange, rightRange: TokenRange
): ResolvedType | undefined {
    checkTypeMatch(lhs, new ResolvedType(builtinBoolType), leftRange);
    checkTypeMatch(rhs, new ResolvedType(builtinBoolType), rightRange);
    return new ResolvedType(builtinBoolType);
}

// ASSIGNOP      ::= '=' | '+=' | '-=' | '*=' | '/=' | '|=' | '&=' | '^=' | '%=' | '**=' | '<<=' | '>>=' | '>>>='
function analyzeAssignOp(
    scope: SymbolScope, operator: TokenObject,
    lhs: ResolvedType | undefined, rhs: ResolvedType | undefined,
    leftRange: TokenRange, rightRange: TokenRange
): ResolvedType | undefined {
    if (lhs === undefined || rhs === undefined) return undefined;
    if (lhs.symbolType instanceof SymbolType && rhs.symbolType instanceof SymbolType) {
        if (lhs.symbolType.isNumberType() && rhs.symbolType.isNumberType()) return lhs;
    }

    if (operator.text === '=') {
        if (canTypeConvert(rhs, lhs)) return lhs;
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

export interface HoistResult {
    readonly globalScope: SymbolScope;
    readonly analyzeQueue: AnalyzeQueue;
}

/**
 * Entry point of the analyser.
 * Type checks and function checks are performed here.
 */
export function analyzeAfterHoisted(path: string, hoistResult: HoistResult): AnalyzerScope {
    const {globalScope, analyzeQueue} = hoistResult;

    globalScope.commitContext();

    // Analyze the contents of the scope to be processed.
    while (analyzeQueue.length > 0) {
        const next = analyzeQueue.shift();
        if (next !== undefined) next();
    }

    return new AnalyzerScope(path, globalScope);
}

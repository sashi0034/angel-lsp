// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_expressions.html

import {
    funcHeadDestructor,
    isFuncHeadReturnValue,
    isMemberMethodInPostOp,
    NodeArgList,
    NodeAssign,
    NodeCase,
    NodeCast,
    NodeCondition,
    NodeDoWhile,
    NodeEnum,
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
    NodeUsing,
    NodeVar,
    NodeVarAccess,
    NodeWhile
} from "../compiler_parser/nodes";
import {
    isNodeClassOrInterface,
    SymbolFunction,
    SymbolFunctionHolder,
    SymbolHolder,
    SymbolType,
    SymbolVariable
} from "./symbolObject";
import {NumberLiteral, TokenIdentifier, TokenKind, TokenObject} from "../compiler_tokenizer/tokenObject";
import {
    createAnonymousIdentifier,
    getActiveGlobalScope,
    resolveActiveScope,
    SymbolGlobalScope,
    SymbolScope
} from "./symbolScope";
import {checkFunctionCall} from "./functionCall";
import {checkTypeCast, assertTypeCast} from "./typeCast";
import {
    builtinBoolType,
    resolvedBuiltinBool,
    resolvedBuiltinDouble,
    resolvedBuiltinFloat,
    resolvedBuiltinInt,
    tryGetBuiltinType
} from "./builtinType";
import {
    canAccessInstanceMember,
    findSymbolWithParent,
    getSymbolAndScopeIfExist,
    stringifyResolvedType
} from "./symbolUtils";
import {Mutable} from "../utils/utilities";
import {getGlobalSettings} from "../core/settings";
import {ResolvedType, TemplateTranslator} from "./resolvedType";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {getBoundingLocationBetween, TokenRange} from "../compiler_tokenizer/tokenRange";
import {AnalyzerScope} from "./analyzerScope";
import {canComparisonOperatorCall, checkOverloadedOperatorCall, evaluateNumberOperatorCall} from "./operatorCall";
import {extendTokenLocation} from "../compiler_tokenizer/tokenUtils";
import {checkDefaultConstructorCall, assertDefaultSuperConstructorCall, findConstructorOfType} from "./constrcutorCall";
import assert = require("node:assert");
import {checkForEachIterator} from "./foreachStatement";

export type HoistQueue = (() => void)[];

export type AnalyzeQueue = (() => void)[];

/** @internal */
export function pushScopeRegionInfo(targetScope: SymbolScope, tokenRange: TokenRange) {
    getActiveGlobalScope().info.scopeRegion.push({
        boundingLocation: tokenRange.getBoundingLocation(),
        targetScope: targetScope
    });
}

// BNF: SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | USING | ';'}

// BNF: USING         ::= 'using' 'namespace' IDENTIFIER ('::' IDENTIFIER)* ';'
export function analyzeUsingNamespace(parentScope: SymbolScope, nodeUsing: NodeUsing) {
    parentScope.pushUsingNamespace(nodeUsing);
}

// BNF: NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'

// BNF: ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER [ ':' ('int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64') ] (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))

// BNF: CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))

// BNF: TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// BNF: FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST [LISTPATTERN] ['const'] FUNCATTR (';' | STATBLOCK)
export function analyzeFunc(scope: SymbolScope, func: NodeFunc) {
    if (func.head === funcHeadDestructor) {
        analyzeStatBlock(scope, func.statBlock);
        return;
    }

    const declared = findSymbolWithParent(scope, func.identifier.text);

    if (declared === undefined) {
        // TODO: required?
        analyzerDiagnostic.error(func.identifier.location, `'${func.identifier}' is not defined.`);
        return;
    }

    const typeTemplates = analyzeTemplateTypes(
        scope,
        func.typeTemplates,
        (declared.symbol as SymbolFunctionHolder)?.first?.templateTypes); // FIXME?

    // Add arguments to the scope
    analyzeParamList(scope, func.paramList);

    // Analyze the scope
    analyzeStatBlock(scope, func.statBlock);
}

// BNF: INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))

// BNF: VAR           ::= ['private' | 'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
export function analyzeVar(scope: SymbolScope, nodeVar: NodeVar, isInstanceMember: boolean) {
    let varType = analyzeType(scope, nodeVar.type);

    for (const declaredVar of nodeVar.variables) {
        const initializer = declaredVar.initializer;
        if (initializer === undefined) continue;

        const initType = analyzeVarInitializer(scope, varType, declaredVar.identifier, initializer);

        if (initType !== undefined && varType?.isAutoType()) {
            // Resolved the auto type
            varType = initType;
            pushAutoTypeResolutionInfo(declaredVar.identifier, varType);
        }
    }

    insertVariables(scope, varType, nodeVar, isInstanceMember);
}

function pushAutoTypeResolutionInfo(identifier: TokenObject, initType: ResolvedType) {
    getActiveGlobalScope().info.autoTypeResolution.push({autoToken: identifier, resolvedType: initType,});
}

export function insertVariables(scope: SymbolScope, varType: ResolvedType | undefined, nodeVar: NodeVar, isInstanceMember: boolean) {
    const result: SymbolVariable[] = [];
    for (const variableInitializer of nodeVar.variables) {
        const variable: SymbolVariable = SymbolVariable.create({
            identifierToken: variableInitializer.identifier,
            scopePath: scope.scopePath,
            type: varType,
            isInstanceMember: isInstanceMember,
            accessRestriction: nodeVar.accessor,
        });
        scope.insertSymbolAndCheck(variable);

        result.push(variable);
    }

    return result;
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
        assertTypeCast(exprType, varType, initializer.nodeRange);
        return exprType;
    } else if (initializer.nodeName === NodeName.ArgList) {
        // e.g., `MyClass obj(args1, args2);`

        if (varType === undefined || varType.typeOrFunc.isFunction()) {
            return undefined;
        }

        // FIXME: Think of a better way.
        const callerIdentifier = TokenIdentifier.createVirtual(varType.identifierText);

        return analyzeConstructorCall(scope, callerIdentifier, initializer, varType);
    }
}

// BNF: IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'

// BNF: FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'

// BNF: VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'

// BNF: MIXIN         ::= 'mixin' CLASS

// BNF: INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] FUNCATTR ';'

// BNF: STATBLOCK     ::= '{' {VAR | STATEMENT | USING} '}'
export function analyzeStatBlock(scope: SymbolScope, statBlock: NodeStatBlock) {
    // Append completion information to the scope
    pushScopeRegionInfo(scope, statBlock.nodeRange);

    for (const statement of statBlock.statementList) {
        if (statement.nodeName === NodeName.Var) {
            analyzeVar(scope, statement, false);
        } else if (statement.nodeName === NodeName.Using) {
            analyzeUsingNamespace(scope, statement);
        } else {
            analyzeStatement(scope, statement as NodeStatement);
        }
    }
}

// BNF: PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' [EXPR | 'void']] {',' TYPE TYPEMOD [IDENTIFIER] ['...' | ('=' [EXPR | 'void'])]})] ')'
export function analyzeParamList(scope: SymbolScope, paramList: NodeParamList) {
    for (const param of paramList) {
        if (param.defaultExpr === undefined || param.defaultExpr.nodeName === NodeName.ExprVoid) continue;
        analyzeExpr(scope, param.defaultExpr);
    }
}

// BNF: TYPEMOD       ::= ['&' ['in' | 'out' | 'inout'] ['+'] ['if_handle_then_const']]

// BNF: TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
export function analyzeType(scope: SymbolScope, nodeType: NodeType): ResolvedType | undefined {
    const reservedType = nodeType.isArray ? undefined : analyzeReservedType(scope, nodeType);
    if (reservedType !== undefined) return reservedType;

    const typeIdentifier = nodeType.dataType.identifier;

    const searchScope = nodeType.scope !== undefined
        ? (findOptimalScope(scope, nodeType.scope, typeIdentifier) ?? scope)
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
    if (symbolAndScope !== undefined &&
        isSymbolConstructorOrDestructor(symbolAndScope.symbol) &&
        symbolAndScope.scope.parentScope !== undefined
    ) {
        // When traversing the parent hierarchy, the constructor is sometimes found before the class type,
        // in which case search further up the hierarchy.
        symbolAndScope = getSymbolAndScopeIfExist(
            symbolAndScope.scope.parentScope.lookupSymbol(givenIdentifier), symbolAndScope.scope.parentScope);
    }
    if (symbolAndScope === undefined) {
        analyzerDiagnostic.error(typeIdentifier.location, `'${givenIdentifier}' is not defined.`);
        return undefined;
    }

    const {symbol: foundSymbol, scope: foundScope} = symbolAndScope;
    if (foundSymbol.isFunctionHolder() && foundSymbol.first.linkedNode.nodeName === NodeName.FuncDef) {
        return completeAnalyzingType(scope, typeIdentifier, foundSymbol.first, foundScope, true);
    } else if (foundSymbol instanceof SymbolType === false) {
        analyzerDiagnostic.error(typeIdentifier.location, `'${givenIdentifier}' is not a type.`);
        return undefined;
    } else {
        const typeTemplates = analyzeTemplateTypes(scope, givenTypeTemplates, foundSymbol.templateTypes);
        return completeAnalyzingType(scope, typeIdentifier, foundSymbol, foundScope, undefined, typeTemplates);
    }
}

function isSymbolConstructorOrDestructor(symbol: SymbolHolder): boolean {
    if (symbol.isFunctionHolder() === false) return false;

    const linkedNode = symbol.first.linkedNode;
    if (linkedNode.nodeName !== NodeName.Func) return false;

    return isFuncHeadReturnValue(linkedNode.head) === false;
}

function completeAnalyzingType(
    scope: SymbolScope, // FIXME: Cleanup
    identifier: TokenObject,
    foundSymbol: SymbolType | SymbolFunction,
    foundScope: SymbolScope,
    isHandler?: boolean,
    typeTemplates?: TemplateTranslator | undefined,
): ResolvedType | undefined {
    getActiveGlobalScope().pushReference({
        toSymbol: foundSymbol,
        fromToken: identifier
    });

    return ResolvedType.create({
        typeOrFunc: foundSymbol,
        isHandler: isHandler,
        templateTranslator: typeTemplates
    });
}

// PRIMTYPE | '?' | 'auto'
function analyzeReservedType(scope: SymbolScope, nodeType: NodeType): ResolvedType | undefined {
    const typeIdentifier = nodeType.dataType.identifier;
    if (typeIdentifier.kind !== TokenKind.Reserved) return;

    if (nodeType.scope !== undefined) {
        // This may seem like redundant processing, but it is invoked to add infos, which are used for autocompletion.
        findOptimalScope(scope, nodeType.scope, typeIdentifier);

        analyzerDiagnostic.error(typeIdentifier.location, `A primitive type cannot have namespace qualifiers.`);
    }

    const builtinType = tryGetBuiltinType(typeIdentifier);
    if (builtinType !== undefined) return new ResolvedType(builtinType);

    return undefined;
}

function analyzeTemplateTypes(scope: SymbolScope, nodeType: NodeType[], templateTypes: TokenObject[] | undefined) {
    if (templateTypes === undefined) return undefined;

    const translation: TemplateTranslator = new Map();
    for (let i = 0; i < nodeType.length; i++) {
        if (i >= templateTypes.length) {
            analyzerDiagnostic.error(
                (nodeType[nodeType.length - 1].nodeRange.getBoundingLocation()),
                `Too many template types.`);
            break;
        }

        const template = nodeType[i];
        translation.set(templateTypes[i], analyzeType(scope, template));
    }

    return translation;
}

// BNF: INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
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

// BNF: SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
export function findOptimalScope(
    parentScope: SymbolScope,
    nodeScope: NodeScope | undefined,
    tokenAfterNamespaces: TokenObject | undefined
): SymbolScope | undefined {
    let bestMatch = undefined; // If no valid scope exists, fall back to the most appropriate invalid one.

    if (nodeScope?.isGlobal) {
        bestMatch = evaluateScope(parentScope.getGlobalScope(), nodeScope, tokenAfterNamespaces);
    } else {
        // Iterate through all using namespaces
        for (const usingScope of [[], ...parentScope.getUsingNamespacesWithParent().map(ns => ns.scopePath)]) {
            if (bestMatch?.ok) {
                break;
            }

            let scopeIterator = parentScope;

            // Iterate through current scope and its parent scopes
            for (; ;) {
                if (bestMatch?.ok) {
                    break;
                }

                const relativeScope = scopeIterator.resolveRelativeScope(usingScope);
                if (relativeScope !== undefined) {
                    const candidate = evaluateScope(relativeScope, nodeScope, tokenAfterNamespaces);
                    if (bestMatch === undefined || candidate.ok || candidate.accessIndex > bestMatch.accessIndex) {
                        // If the candidate is valid or has a higher access index, update the best match.
                        bestMatch = candidate;
                    }
                }

                if (scopeIterator.parentScope === undefined) {
                    break;
                }

                scopeIterator = scopeIterator.parentScope;
            }

        }
    }

    if (!bestMatch?.ok && nodeScope === undefined) {
        return undefined;
    }

    bestMatch?.sideEffects.forEach(sideEffect => sideEffect());

    return bestMatch?.accessScope;
}

function evaluateScope(parentScope: SymbolScope, nodeScope: NodeScope | undefined, tokenAfterNamespaces: TokenObject | undefined) {
    if (nodeScope === undefined) {
        const ok = parentScope.lookupSymbol(tokenAfterNamespaces?.text ?? '') !== undefined;

        return {
            ok,
            accessScope: parentScope,
            accessIndex: -1,
            sideEffects: []
        };
    }

    // assert(nodeScope.nodeRange.end.next === identifierAfterNamespaces);

    const sideEffect: (() => void)[] = [];

    let accessScope: SymbolScope = parentScope;
    let accessIndex: number;
    for (accessIndex = 0; accessIndex < nodeScope.scopeList.length; ++accessIndex) {
        const scopeToken = nodeScope.scopeList[accessIndex];
        const found = accessScope.lookupScope(scopeToken.text);
        if (found === undefined || found.isFunctionHolderScope()) {
            sideEffect.push(() => {
                analyzerDiagnostic.error(
                    nodeScope.scopeList[accessIndex].location,
                    `Undefined scope: ${nodeScope.scopeList[accessIndex].text}`
                );
            });

            break;
        }

        accessScope = found;

        // Append an information for completion of the namespace to the scope.
        sideEffect.push(() => {
            getActiveGlobalScope().info.autocompleteNamespaceAccess.push({
                autocompleteLocation: extendTokenLocation(scopeToken, 0, 2), // scopeToken --> '::' --> <token>
                accessScope: found,
                namespaceToken: scopeToken,
                tokenAfterNamespaces: tokenAfterNamespaces,
            });
        });
    }

    const ok: boolean = accessIndex === nodeScope.scopeList.length &&
        // Can the identifier after the qualifiers be accessed?
        accessScope.lookupSymbol(tokenAfterNamespaces?.text ?? '') !== undefined;

    return {ok, accessScope, accessIndex, sideEffects: sideEffect};
}

// BNF: DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')

// BNF: PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'

// BNF: FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property' | 'delete' | 'nodiscard'}

// BNF: STATEMENT     ::= (IF | FOR | FOREACH | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
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

// BNF: SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
function analyzeSwitch(scope: SymbolScope, ast: NodeSwitch) {
    analyzeAssign(scope, ast.assign);
    for (const c of ast.caseList) {
        analyzeCase(scope, c);
    }
}

// BNF: BREAK         ::= 'break' ';'

// BNF: FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
function analyzeFor(scope: SymbolScope, nodeFor: NodeFor) {
    if (nodeFor.initial.nodeName === NodeName.Var) analyzeVar(scope, nodeFor.initial, false);
    else analyzeExprStat(scope, nodeFor.initial);

    if (nodeFor.condition !== undefined) analyzeExprStat(scope, nodeFor.condition);

    for (const inc of nodeFor.incrementList) {
        analyzeAssign(scope, inc);
    }

    if (nodeFor.statement !== undefined) analyzeStatement(scope, nodeFor.statement);
}

// BNF: FOREACH       ::= 'foreach' '(' TYPE IDENTIFIER {',' TYPE INDENTIFIER} ':' ASSIGN ')' STATEMENT
function analyzeForEach(scope: SymbolScope, nodeForEach: NodeForEach) {
    const nodeAssign = nodeForEach.assign;
    const iteratorType =
        nodeAssign !== undefined ? analyzeAssign(scope, nodeAssign) : undefined;
    const forValueTypes =
        nodeAssign !== undefined ? checkForEachIterator(iteratorType, nodeAssign.nodeRange) : undefined;

    if (nodeAssign !== undefined && forValueTypes !== undefined && forValueTypes.length < nodeForEach.variables.length) {
        analyzerDiagnostic.error(
            nodeForEach.nodeRange.getBoundingLocation().withEnd(nodeAssign.nodeRange.start.location.start),
            `Expected ${forValueTypes.length} variable declarations, but got ${nodeForEach.variables.length}.`
        );
    }

    // Iterate through the variables and add them to the scope
    for (let i = 0; i < nodeForEach.variables.length; i++) {
        const forValueType = forValueTypes?.[i];
        const variableDeclaration = nodeForEach.variables[i];
        let variableType =
            variableDeclaration.type !== undefined ? analyzeType(scope, variableDeclaration.type) : undefined;
        if (forValueType !== undefined) {
            if (variableType?.isAutoType()) {
                // Resolved the auto type
                variableType = forValueType;
                pushAutoTypeResolutionInfo(variableDeclaration.identifier, variableType);
            } else {
                assertTypeCast(forValueType, variableType, variableDeclaration.nodeRange);
            }
        }

        const variable: SymbolVariable = SymbolVariable.create({
            identifierToken: variableDeclaration.identifier,
            scopePath: scope.scopePath,
            type: variableType,
            isInstanceMember: false,
            accessRestriction: undefined,
        });
        scope.insertSymbolAndCheck(variable);
    }

    if (nodeForEach.statement !== undefined) {
        analyzeStatement(scope, nodeForEach.statement);
    }
}

// BNF: WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
function analyzeWhile(scope: SymbolScope, nodeWhile: NodeWhile) {
    const assignType = analyzeAssign(scope, nodeWhile.assign);
    assertTypeCast(assignType, new ResolvedType(builtinBoolType), nodeWhile.assign.nodeRange);

    if (nodeWhile.statement !== undefined) analyzeStatement(scope, nodeWhile.statement);
}

// BNF: DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
function analyzeDoWhile(scope: SymbolScope, doWhile: NodeDoWhile) {
    analyzeStatement(scope, doWhile.statement);

    if (doWhile.assign === undefined) return;
    const assignType = analyzeAssign(scope, doWhile.assign);
    assertTypeCast(assignType, new ResolvedType(builtinBoolType), doWhile.assign.nodeRange);
}

// BNF: IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
function analyzeIf(scope: SymbolScope, nodeIf: NodeIf) {
    const conditionType = analyzeAssign(scope, nodeIf.condition);
    assertTypeCast(conditionType, new ResolvedType(builtinBoolType), nodeIf.condition.nodeRange);

    if (nodeIf.thenStat !== undefined) analyzeStatement(scope, nodeIf.thenStat);
    if (nodeIf.elseStat !== undefined) analyzeStatement(scope, nodeIf.elseStat);
}

// BNF: CONTINUE      ::= 'continue' ';'

// BNF: EXPRSTAT      ::= [ASSIGN] ';'
function analyzeExprStat(scope: SymbolScope, exprStat: NodeExprStat) {
    if (exprStat.assign === undefined) return;
    const assign = analyzeAssign(scope, exprStat.assign);
    if (assign?.isHandler !== true && assign?.typeOrFunc.isFunction()) {
        analyzerDiagnostic.error(exprStat.assign.nodeRange.getBoundingLocation(), `Function call without handler.`);
    }
}

// BNF: TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK
function analyzeTry(scope: SymbolScope, nodeTry: NodeTry) {
    analyzeStatBlock(scope, nodeTry.tryBlock);
    if (nodeTry.catchBlock !== undefined) analyzeStatBlock(scope, nodeTry.catchBlock);
}

// BNF: RETURN        ::= 'return' [ASSIGN] ';'
function analyzeReturn(scope: SymbolScope, nodeReturn: NodeReturn) {
    const returnType = nodeReturn.assign !== undefined ? analyzeAssign(scope, nodeReturn.assign) : undefined;

    const functionScope = scope.takeParentByNode([NodeName.Func, NodeName.VirtualProp, NodeName.Lambda]);
    if (functionScope === undefined || functionScope.linkedNode === undefined) return;

    if (functionScope.linkedNode.nodeName === NodeName.Func) {
        // ...
        //   |-- Function holder scope (with no node)
        //       |-- The function scope for one of the overloads (with NodeFunc)
        //           |-- ...
        //               |-- scope containing 'return'

        const functionHolderScope = functionScope.parentScope;
        assert(functionHolderScope !== undefined);

        const functionHolder =
            functionHolderScope.parentScope?.symbolTable.get(functionHolderScope.key);
        if (functionHolder?.isFunctionHolder() === false) return;

        // Select suitable overload if there are multiple overloads
        let functionSymbol = functionHolder.first;
        for (const overload of functionHolder.toList()) {
            if (overload.linkedNode === functionScope.linkedNode) {
                functionSymbol = overload;
                break;
            }
        }

        const expectedReturn = functionSymbol.returnType?.typeOrFunc;
        if (expectedReturn?.isType() && expectedReturn?.identifierText === 'void') {
            if (nodeReturn.assign === undefined) return;
            analyzerDiagnostic.error(nodeReturn.nodeRange.getBoundingLocation(), `Function does not return a value.`);
        } else {
            assertTypeCast(returnType, functionSymbol.returnType, nodeReturn.nodeRange);
        }
    } else if (functionScope.linkedNode.nodeName === NodeName.VirtualProp) {
        const key = functionScope.key;
        const isGetter = key.startsWith('get_');
        if (isGetter === false) {
            if (nodeReturn.assign === undefined) return;
            analyzerDiagnostic.error(
                nodeReturn.nodeRange.getBoundingLocation(),
                `Property setter does not return a value.`);
            return;
        }

        const varName = key.substring(4, key.length);
        const functionReturn = functionScope.parentScope?.symbolTable.get(varName);
        if (functionReturn === undefined || functionReturn instanceof SymbolVariable === false) return;

        assertTypeCast(returnType, functionReturn.type, nodeReturn.nodeRange);
    } else if (functionScope.linkedNode.nodeName === NodeName.Lambda) {
        // TODO: Support for lambda
    }
}

// BNF: CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
function analyzeCase(scope: SymbolScope, nodeCase: NodeCase) {
    if (nodeCase.expr !== undefined) analyzeExpr(scope, nodeCase.expr);
    for (const statement of nodeCase.statementList) {
        analyzeStatement(scope, statement);
    }
}

// BNF: EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
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
        const inputToStack: boolean = stackList.length === 0 ||
            (inputList.length > 0 && precedence(inputList[0]) > precedence(stackList[stackList.length - 1]));

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

// BNF: EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
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

    for (const preOp of exprTerm.preOps) {
        if (exprValue === undefined) break;
        exprValue = analyzeExprPreOp(scope, preOp, exprValue);
    }

    return exprValue;
}

// BNF: EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
function analyzeExprValue(scope: SymbolScope, exprValue: NodeExprValue): ResolvedType | undefined {
    switch (exprValue.nodeName) {
    case NodeName.ConstructCall: {
        const type = analyzeType(scope, exprValue.type);
        if (type === undefined) return undefined;

        return analyzeConstructorCall(scope, exprValue.type.dataType.identifier, exprValue.argList, type);
    }
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

// BNF: CONSTRUCTCALL ::= TYPE ARGLIST
export function analyzeConstructorCall(
    scope: SymbolScope,
    callerIdentifier: TokenObject,
    callerArgList: NodeArgList,
    constructorType: ResolvedType
): ResolvedType | undefined {
    const constructor = findConstructorOfType(constructorType);
    if (constructor === undefined || constructor.isFunctionHolder() === false) {
        const callerArgTypes = callerArgList.argList.map(arg => analyzeAssign(scope, arg.assign));
        return checkDefaultConstructorCall(callerIdentifier, callerArgList.nodeRange, callerArgTypes, constructorType);
    }

    analyzeFunctionCall(scope, callerIdentifier, callerArgList, constructor, constructorType.templateTranslator);
    return constructorType;
}

// BNF: EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'
function analyzeExprPreOp(scope: SymbolScope, exprPreOp: TokenObject, exprValue: ResolvedType) {
    // TODO: Implement like opNeg
    return exprValue;
}

// BNF: EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ']') | ARGLIST | '++' | '--'
function analyzeExprPostOp(scope: SymbolScope, exprPostOp: NodeExprPostOp, exprValue: ResolvedType, exprRange: TokenRange) {
    if (exprPostOp.postOp === 1) {
        return analyzeExprPostOp1(scope, exprPostOp, exprValue);
    } else if (exprPostOp.postOp === 2) {
        return analyzeExprPostOp2(scope, exprPostOp, exprValue, exprRange);
    }
}

// ('.' (FUNCCALL | IDENTIFIER))
function analyzeExprPostOp1(scope: SymbolScope, exprPostOp: NodeExprPostOp1, exprValue: ResolvedType) {
    if (exprValue.typeOrFunc instanceof SymbolType === false) {
        analyzerDiagnostic.error(exprPostOp.nodeRange.getBoundingLocation(), `Invalid access to type.`);
        return undefined;
    }

    // Append an information for autocomplete of class members.
    const autocompleteLocation = getBoundingLocationBetween(
        exprPostOp.nodeRange.start,
        exprPostOp.nodeRange.start.getNextOrSelf());
    getActiveGlobalScope().info.autocompleteInstanceMember.push({
        autocompleteLocation: autocompleteLocation,
        targetType: exprValue.typeOrFunc
    });

    const member = exprPostOp.member;
    const isMemberMethod = isMemberMethodInPostOp(member);

    const identifier = isMemberMethod ? member.identifier : member;
    if (identifier === undefined) return undefined;

    if (isNodeClassOrInterface(exprValue.typeOrFunc.linkedNode) === false) {
        analyzerDiagnostic.error(identifier.location, `'${identifier.text}' is not a member.`);
        return undefined;
    }

    const classScope = exprValue.typeOrFunc.membersScopePath;
    if (classScope === undefined) return undefined;

    if (isMemberMethod) {
        // Analyze method call.
        const instanceMember = resolveActiveScope(classScope).lookupSymbol(identifier.text);
        if (instanceMember === undefined) {
            analyzerDiagnostic.error(identifier.location, `'${identifier.text}' is not defined.`);
            return undefined;
        }

        if (instanceMember.isFunctionHolder()) {
            // This instance member is a method.
            return analyzeFunctionCall(
                scope, identifier, member.argList, instanceMember, exprValue.templateTranslator
            );
        }

        if (instanceMember.isVariable() && instanceMember.type?.typeOrFunc.isFunction()) {
            // This instance member is a delegate.
            const delegate = instanceMember.type.typeOrFunc.toHolder();
            return analyzeFunctionCall(
                scope, identifier, member.argList, delegate, exprValue.templateTranslator, instanceMember
            );
        }

        analyzerDiagnostic.error(identifier.location, `'${identifier.text}' is not a method.`);
        return undefined;
    } else {
        // Analyze field access.
        return analyzeVariableAccess(scope, resolveActiveScope(classScope), identifier);
    }
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
function analyzeExprPostOp2(scope: SymbolScope, exprPostOp: NodeExprPostOp2, exprValue: ResolvedType, exprRange: TokenRange) {
    const args = exprPostOp.indexingList.map(indexer => analyzeAssign(scope, indexer.assign));
    return checkOverloadedOperatorCall({
        callerOperator: exprPostOp.nodeRange.end,
        alias: 'opIndex',
        lhs: exprValue,
        lhsRange: exprRange,
        rhs: args,
        rhsRange: exprPostOp.nodeRange,
        // Support for named args on index operator are not implemented yet in AngelScript?
        rhsArgNames: exprPostOp.indexingList.map(indexer => indexer.identifier)
    });
}

// BNF: CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
function analyzeCast(scope: SymbolScope, cast: NodeCast): ResolvedType | undefined {
    const castedType = analyzeType(scope, cast.type);
    analyzeAssign(scope, cast.assign);
    return castedType;
}

// BNF: LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
function analyzeLambda(scope: SymbolScope, lambda: NodeLambda): ResolvedType | undefined {
    const childScope = scope.insertScope(createAnonymousIdentifier(), lambda);

    // Append arguments to the scope
    for (const param of lambda.paramList) {
        if (param.identifier === undefined) continue;

        const argument: SymbolVariable = SymbolVariable.create({
            identifierToken: param.identifier,
            scopePath: scope.scopePath,
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

// BNF: LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
function analyzeLiteral(scope: SymbolScope, literal: NodeLiteral): ResolvedType | undefined {
    const literalValue = literal.value;
    if (literalValue.isNumberToken()) {
        switch (literalValue.numberLiteral) {
        case NumberLiteral.Integer:
            return resolvedBuiltinInt;
        case NumberLiteral.Float:
            return resolvedBuiltinFloat;
        case NumberLiteral.Double:
            return resolvedBuiltinDouble;
        }
    }

    if (literalValue.kind === TokenKind.String) {
        if (literalValue.text[0] === '\'' && getGlobalSettings().characterLiterals) {
            // TODO: verify utf8 validity
            return resolvedBuiltinInt;
        }

        const stringType = getActiveGlobalScope().getContext().builtinStringType;
        return stringType === undefined ? undefined : new ResolvedType(stringType);
    }

    if (literalValue.text === 'true' || literalValue.text === 'false') {
        return resolvedBuiltinBool;
    }

    // FIXME: Handling null?
    return undefined;
}

// BNF: FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
function analyzeFuncCall(scope: SymbolScope, funcCall: NodeFuncCall): ResolvedType | undefined {
    let searchScope = findOptimalScope(scope, funcCall.scope, funcCall.identifier);
    if (funcCall.scope !== undefined && searchScope === undefined) {
        return undefined;
    } else {
        searchScope = searchScope ?? scope;
    }

    const calleeFunc = findSymbolWithParent(searchScope, funcCall.identifier.text);
    if (calleeFunc?.symbol === undefined) {
        if (funcCall.identifier.text === 'super') {
            assertDefaultSuperConstructorCall(scope, funcCall);
        } else {
            analyzerDiagnostic.error(funcCall.identifier.location, `'${funcCall.identifier.text}' is not defined.`);
        }

        return undefined;
    }

    const [calleeSymbol, calleeScope] = [calleeFunc.symbol, calleeFunc.scope];

    if (calleeSymbol.isType()) {
        const constructorType: ResolvedType = new ResolvedType(calleeSymbol);
        return analyzeConstructorCall(scope, funcCall.identifier, funcCall.argList, constructorType);
    }

    if (calleeSymbol.isVariable() && calleeSymbol.type?.typeOrFunc.isFunction()) {
        // Invoke function handler
        return analyzeFunctionCall(
            scope,
            funcCall.identifier,
            funcCall.argList,
            new SymbolFunctionHolder(calleeSymbol.type.typeOrFunc),
            undefined,
            calleeSymbol
        );
    }

    if (calleeSymbol instanceof SymbolVariable) {
        return analyzeOpCallCaller(scope, funcCall, calleeSymbol);
    }

    if (calleeSymbol.isFunctionHolder() === false) {
        analyzerDiagnostic.error(funcCall.identifier.location, `'${funcCall.identifier.text}' is not a function.`);
        return undefined;
    }

    return analyzeFunctionCall(scope, funcCall.identifier, funcCall.argList, calleeSymbol, undefined);
}

function analyzeOpCallCaller(scope: SymbolScope, funcCall: NodeFuncCall, calleeVariable: SymbolVariable) {
    const varType = calleeVariable.type;
    if (varType === undefined || varType.scopePath === undefined) {
        analyzerDiagnostic.error(funcCall.identifier.location, `'${funcCall.identifier.text}' is not callable.`);
        return;
    }

    const classScope = resolveActiveScope(varType.scopePath).lookupScope(varType.typeOrFunc.identifierText);
    if (classScope === undefined) return undefined;

    const opCall = classScope.lookupSymbol('opCall');
    if (opCall === undefined || opCall.isFunctionHolder() === false) {
        analyzerDiagnostic.error(
            funcCall.identifier.location,
            `'opCall' is not defined in type '${varType.typeOrFunc.identifierText}'.`);
        return;
    }

    return analyzeFunctionCall(scope, funcCall.identifier, funcCall.argList, opCall, varType.templateTranslator);
}

function analyzeFunctionCall(
    scope: SymbolScope,
    callerIdentifier: TokenObject,
    callerArgList: NodeArgList,
    calleeFuncHolder: SymbolFunctionHolder,
    calleeTemplateTranslator: TemplateTranslator | undefined,
    calleeDelegateVariable?: SymbolVariable
) {
    getActiveGlobalScope().info.functionCall.push({
        callerIdentifier: callerIdentifier,
        callerArgumentsNode: callerArgList,
        calleeFuncHolder: calleeFuncHolder,
        calleeTemplateTranslator: calleeTemplateTranslator,
    });

    const callerArgTypes = analyzeArgList(scope, callerArgList);
    const callerArgs =
        callerArgList.argList.map((arg, i) => ({
            name: arg.identifier,
            range: arg.assign.nodeRange,
            type: callerArgTypes[i]
        }));

    return checkFunctionCall({
        callerIdentifier: callerIdentifier,
        callerRange: callerArgList.nodeRange,
        callerArgs: callerArgs,
        calleeFuncHolder: calleeFuncHolder,
        calleeTemplateTranslator: calleeTemplateTranslator,
        calleeDelegateVariable: calleeDelegateVariable
    });
}

// BNF: VARACCESS     ::= SCOPE IDENTIFIER
function analyzeVarAccess(scope: SymbolScope, varAccess: NodeVarAccess): ResolvedType | undefined {
    let accessScope: SymbolScope | undefined = undefined;
    const varIdentifier = varAccess.identifier;
    if (varAccess.scope !== undefined) {
        const fromScope = scope.takeParentByNode([NodeName.Class]) ?? scope; // FXIME?
        accessScope = findOptimalScope(fromScope, varAccess.scope, varIdentifier);
    } else {
        accessScope = findOptimalScope(scope, undefined, varIdentifier) ?? scope;
    }

    if (varIdentifier === undefined) {
        return undefined;
    }

    if (!accessScope) {
        return undefined;
    }

    return analyzeVariableAccess(scope, accessScope, varIdentifier);
}

function analyzeVariableAccess(
    currentScope: SymbolScope, accessScope: SymbolScope, varIdentifier: TokenObject
): ResolvedType | undefined {
    const found = findSymbolWithParent(accessScope, varIdentifier.text);
    if (found === undefined) {
        const enumMemberAccess = analyzeEnumMemberAccess(currentScope, accessScope, varIdentifier);
        if (enumMemberAccess !== undefined) return enumMemberAccess;

        analyzerDiagnostic.error(varIdentifier.location, `'${varIdentifier.text}' is not defined.`);
        return undefined;
    }

    if (found.symbol.isType()) {
        analyzerDiagnostic.error(varIdentifier.location, `'${varIdentifier.text}' is type.`);
        return undefined;
    }

    if (canAccessInstanceMember(currentScope, found.symbol) === false) {
        analyzerDiagnostic.error(varIdentifier.location, `'${varIdentifier.text}' is not public member.`);
        return undefined;
    }

    if (found.symbol.isVariable()) {
        const accessedVariable = found.symbol.toList()[0];
        if (accessedVariable.identifierToken.location.path !== '') {
            // Only add to the reference list if the identifier has a valid path.
            // (Keywords like 'this' have an empty identifierToken, so they are excluded.)
            getActiveGlobalScope().pushReference({
                toSymbol: found.symbol.toList()[0],
                fromToken: varIdentifier
            });
        }

        return found.symbol.type?.cloneWithAccessSource(accessedVariable); // <-- Variable
    } else {
        // Unlike variables, function access is not added to the reference here.
        // It will be added once overload resolution is completed.

        return ResolvedType.create({typeOrFunc: found.symbol.first, accessSource: varIdentifier});
        // <-- Function (tentatively using the first overload)
    }
}

// AngelScript allows ambiguous enum member access.
function analyzeEnumMemberAccess(currentScope: SymbolScope, accessScope: SymbolScope, varIdentifier: TokenObject): ResolvedType | undefined {
    // If no access scope is specified, start with a global.
    accessScope = currentScope === accessScope ? getActiveGlobalScope() : accessScope;

    const accessScopePath = accessScope.scopePath;
    // accessScopePath:
    //   ...
    //     |-- Access::
    //         |-- ...

    const enumCandidates: SymbolVariable[] = [];
    for (const enumScope of getActiveGlobalScope().getContext().enumScopeList) {
        // enumScope.scopePath:
        //   Outer::
        //     |-- Access::
        //         |-- Color

        const ok = accessScopePath.length === 0 || // Access to the global scope or
            // the access scope is a parent of the enum scope.
            accessScopePath.every((key, i) => key === enumScope.scopePath[i]);

        if (ok) {
            const found = enumScope.lookupSymbol(varIdentifier.text);
            if (found !== undefined && found.isVariable()) {
                enumCandidates.push(found);
            }
        }
    }

    if (enumCandidates.length === 0) {
        return undefined;
    } else if (enumCandidates.length == 1) {
        // Resolve the implicit enum member access.
        return enumCandidates[0].type;
    }
    // enumCandidates.length >= 2

    // Create a virtual type for the ambiguous enum member access.
    const virtualType = SymbolType.create({
        identifierToken: varIdentifier,
        scopePath: [],
        linkedNode: {
            nodeName: NodeName.Enum,
            nodeRange: new TokenRange(varIdentifier, varIdentifier),
            scopeRange: new TokenRange(varIdentifier, varIdentifier),
            entity: undefined,
            identifier: varIdentifier,
            memberList: [],
            enumType: undefined
        } satisfies NodeEnum,
        membersScopePath: undefined,
        multipleEnumCandidates: enumCandidates
    });

    return new ResolvedType(virtualType);
}

// BNF: ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
function analyzeArgList(scope: SymbolScope, argList: NodeArgList): (ResolvedType | undefined)[] {
    const types: (ResolvedType | undefined)[] = [];
    for (const arg of argList.argList) {
        types.push(analyzeAssign(scope, arg.assign));
    }
    return types;
}

// BNF: ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
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

// BNF: CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
export function analyzeCondition(scope: SymbolScope, condition: NodeCondition): ResolvedType | undefined {
    const exprType = analyzeExpr(scope, condition.expr);
    if (condition.ternary === undefined) return exprType;

    assertTypeCast(exprType, new ResolvedType(builtinBoolType), condition.expr.nodeRange);

    const trueAssign = analyzeAssign(scope, condition.ternary.trueAssign);
    const falseAssign = analyzeAssign(scope, condition.ternary.falseAssign);

    if (trueAssign === undefined && falseAssign !== undefined) return falseAssign;
    if (trueAssign !== undefined && falseAssign === undefined) return trueAssign;
    if (trueAssign === undefined || falseAssign === undefined) return undefined;

    if (checkTypeCast(trueAssign, falseAssign)) return falseAssign;
    if (checkTypeCast(falseAssign, trueAssign)) return trueAssign;

    analyzerDiagnostic.error(
        getBoundingLocationBetween(
            condition.ternary.trueAssign.nodeRange.start,
            condition.ternary.falseAssign.nodeRange.end),
        `Type mismatches between '${stringifyResolvedType(trueAssign)}' and '${stringifyResolvedType(falseAssign)}'.`);
    return undefined;
}

// BNF: EXPROP        ::= MATHOP | COMPOP | LOGICOP | BITOP
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

// BNF: BITOP         ::= '&' | '|' | '^' | '<<' | '>>' | '>>>'
function analyzeBitOp(
    scope: SymbolScope, callerOperator: TokenObject,
    lhs: ResolvedType, rhs: ResolvedType,
    lhsRange: TokenRange, rhsRange: TokenRange
): ResolvedType | undefined {
    const numberOperatorCall = evaluateNumberOperatorCall(lhs, rhs);
    if (numberOperatorCall) return numberOperatorCall;

    const aliases = bitOpAliases.get(callerOperator.text);
    assert(aliases !== undefined);

    const [alias, alias_r] = aliases;
    return checkOverloadedOperatorCall({
        callerOperator, alias, alias_r, lhs, lhsRange, rhs, rhsRange
    });
}

const bitOpAliases = new Map<string, [string, string]>([
    ['&', ['opAnd', 'opAnd_r']],
    ['|', ['opOr', 'opOr_r']],
    ['^', ['opXor', 'opXor_r']],
    ['<<', ['opShl', 'opShl_r']],
    ['>>', ['opShr', 'opShr_r']],
    ['>>>', ['opShrU', 'opShrU_r']]
]);

// BNF: MATHOP        ::= '+' | '-' | '*' | '/' | '%' | '**'
function analyzeMathOp(
    scope: SymbolScope, callerOperator: TokenObject,
    lhs: ResolvedType, rhs: ResolvedType,
    lhsRange: TokenRange, rhsRange: TokenRange
): ResolvedType | undefined {
    const numberOperatorCall = evaluateNumberOperatorCall(lhs, rhs);
    if (numberOperatorCall) return numberOperatorCall;

    const aliases = mathOpAliases.get(callerOperator.text);
    assert(aliases !== undefined);

    const [alias, alias_r] = aliases;
    return checkOverloadedOperatorCall({
        callerOperator, alias, alias_r, lhs, lhsRange, rhs, rhsRange
    });
}

const mathOpAliases = new Map<string, [string, string]>([
    ['+', ['opAdd', 'opAdd_r']],
    ['-', ['opSub', 'opSub_r']],
    ['*', ['opMul', 'opMul_r']],
    ['/', ['opDiv', 'opDiv_r']],
    ['%', ['opMod', 'opMod_r']],
    ['**', ['opPow', 'opPow_r']]
]);

// BNF: COMPOP        ::= '==' | '!=' | '<' | '<=' | '>' | '>=' | 'is' | '!is'
function analyzeCompOp(
    scope: SymbolScope, callerOperator: TokenObject,
    lhs: ResolvedType, rhs: ResolvedType,
    lhsRange: TokenRange, rhsRange: TokenRange
): ResolvedType | undefined {
    if (canComparisonOperatorCall(lhs, rhs)) return resolvedBuiltinBool;

    const alias = compOpAliases.get(callerOperator.text);
    assert(alias !== undefined);

    return checkOverloadedOperatorCall({
        callerOperator, alias, lhs, lhsRange, rhs, rhsRange
    });
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

// BNF: LOGICOP       ::= '&&' | '||' | '^^' | 'and' | 'or' | 'xor'
function analyzeLogicOp(
    scope: SymbolScope, operator: TokenObject,
    lhs: ResolvedType, rhs: ResolvedType,
    leftRange: TokenRange, rightRange: TokenRange
): ResolvedType | undefined {
    assertTypeCast(lhs, resolvedBuiltinBool, leftRange);
    assertTypeCast(rhs, resolvedBuiltinBool, rightRange);

    return new ResolvedType(builtinBoolType);
}

// BNF: ASSIGNOP      ::= '=' | '+=' | '-=' | '*=' | '/=' | '|=' | '&=' | '^=' | '%=' | '**=' | '<<=' | '>>=' | '>>>='
function analyzeAssignOp(
    scope: SymbolScope, callerOperator: TokenObject,
    lhs: ResolvedType | undefined, rhs: ResolvedType | undefined,
    lhsRange: TokenRange, rhsRange: TokenRange
): ResolvedType | undefined {
    if (lhs === undefined || rhs === undefined) return undefined;

    if (callerOperator.text === '=') {
        if (checkTypeCast(rhs, lhs)) return lhs;
    }

    const numberOperatorCall = evaluateNumberOperatorCall(lhs, rhs);
    if (numberOperatorCall) return numberOperatorCall;

    const alias = assignOpAliases.get(callerOperator.text);
    assert(alias !== undefined);

    return checkOverloadedOperatorCall({
        callerOperator, alias, lhs, lhsRange, rhs, rhsRange
    });
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
    readonly globalScope: SymbolGlobalScope;
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

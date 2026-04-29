// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_expressions.html

import {
    HandleAndConstTokenPair,
    Node_ArgList,
    Node_Assign,
    Node_Case,
    Node_Cast,
    Node_Condition,
    Node_DoWhile,
    Node_Enum,
    Node_Expr,
    Node_ExprPostOp,
    Node_ExprPostOp1,
    Node_ExprPostOp2,
    Node_ExprStat,
    Node_ExprTerm,
    Node_ExprTerm2,
    Node_ExprValue,
    Node_For,
    Node_ForEach,
    VariableInForEach,
    Node_Func,
    Node_FuncCall,
    Node_If,
    Node_InitList,
    Node_Lambda,
    Node_LambdaParam,
    Node_Literal,
    NodeName,
    Node_Parameter,
    Node_ParamList,
    Node_Return,
    Node_Scope,
    Node_StatBlock,
    Node_Statement,
    Node_Switch,
    Node_Try,
    Node_Type,
    Node_Using,
    Node_Var,
    Node_VarAccess,
    Node_While,
    voidParameter,
    IdentifierAndOptionalExpr
} from '../compiler_parser/nodeObject';
import {buildTemplateSignature} from '../compiler_parser/nodeUtils';
import {getAccessRestriction, getHandleModifier, HandleModifier} from './nodeHelper';
import {
    isNodeClassOrInterface,
    FunctionSymbol,
    FunctionSymbolHolder,
    SymbolHolder,
    TypeSymbol,
    VariableSymbol
} from './symbolObject';
import {NumberLiteral, IdentifierToken, TokenKind, TokenObject} from '../compiler_tokenizer/tokenObject';
import {
    createAnonymousIdentifier,
    getActiveGlobalScope,
    resolveActiveScope,
    SymbolGlobalScope,
    SymbolScope
} from './symbolScope';
import {checkFunctionCall} from './functionCall';
import {checkTypeCast, assertTypeCast} from './typeCast';
import {
    builtinBoolType,
    builtinAnyType,
    resolvedBuiltinNull,
    resolvedBuiltinBool,
    resolvedBuiltinDouble,
    resolvedBuiltinFloat,
    resolvedBuiltinInt,
    tryGetBuiltinType
} from './builtinType';
import {canAccessInstanceMember, findSymbolWithParent, getSymbolAndScopeIfExist} from './symbolUtils';
import {getGlobalSettings} from '../core/settings';
import {
    applyTemplateMapping,
    EvaluatedValue,
    mergeTemplateMappings,
    ResolvedType,
    TemplateMapping
} from './resolvedType';
import {analyzerDiagnostic} from './analyzerDiagnostic';
import {getBoundingLocationBetween, TokenRange} from '../compiler_tokenizer/tokenRange';
import {AnalyzerScope} from './analyzerScope';
import {canComparisonOperatorCall, checkOverloadedOperatorCall, evaluateNumberOperatorCall} from './operatorCall';
import {checkDefaultConstructorCall, assertDefaultSuperConstructorCall, findConstructorOfType} from './constrcutorCall';
import assert = require('node:assert');
import {checkForEachIterator} from './foreachStatement';
import {stringifyResolvedType} from './symbolStringifier';
import {ConversionMode} from './typeConversion';

export type HoistQueue = (() => void)[];

export type AnalyzeQueue = (() => void)[];

/** @internal */
export function pushScopeRegionMarker(targetScope: SymbolScope, tokenRange: TokenRange) {
    getActiveGlobalScope().markers.scopeRegion.push({
        boundingLocation: tokenRange.getBoundingLocation(),
        targetScope: targetScope
    });
}

// **BNF** SCRIPT ::= {IMPORT | ENUM | TYPEDEF | CLASS | INTERFACE | FUNCDEF | VIRTUALPROP | VAR | FUNC | NAMESPACE | USING | ';'}

// **BNF** NAMESPACE ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'

// **BNF** USING ::= 'using' 'namespace' IDENTIFIER {'::' IDENTIFIER} ';'
export function analyzeUsingNamespace(parentScope: SymbolScope, usingNode: Node_Using) {
    parentScope.pushUsingNamespace(usingNode);
}

// **BNF** ENUM ::= {'shared' | 'external'} 'enum' IDENTIFIER [ ':' ('int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64') ] (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))

// **BNF** CLASS ::= ['mixin'] {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTUALPROP | FUNC | VAR | FUNCDEF} '}'))

// **BNF** TYPEDEF ::= 'typedef' PRIMITIVETYPE IDENTIFIER ';'

// **BNF** FUNC ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER ['<' TYPE {',' TYPE} '>'] PARAMLIST [LISTPATTERN] ['const'] FUNCATTR (';' | STATBLOCK)
export function analyzeFunc(scope: SymbolScope, func: Node_Func) {
    if (func.head.tag === 'destructor') {
        if (func.statBlock !== undefined) {
            analyzeStatBlock(scope, func.statBlock);
        }

        return;
    }

    const declared = findSymbolWithParent(scope, func.identifier.text);

    if (declared === undefined) {
        // TODO: required?
        analyzerDiagnostic.error(func.identifier.location, `Function '${func.identifier.text}' is not defined.`);
        return;
    }

    analyzeTemplateArguments(
        scope,
        declared.symbol.isFunctionHolder() ? declared.symbol.first : undefined,
        func.typeParameters
    ); // FIXME?

    // Add arguments to the scope
    analyzeParamList(scope, func.paramList);

    // Analyze the scope
    if (func.statBlock !== undefined) {
        analyzeStatBlock(scope, func.statBlock);
    }
}

// **BNF** FUNCATTR ::= {'override' | 'final' | 'explicit' | 'property' | 'delete' | 'nodiscard'}
// n/a

// **BNF** LISTPATTERN ::= '{' LISTENTRY {',' LISTENTRY} '}'
// TODO: IMPLEMENT IT!

// **BNF** LISTENTRY ::= (('repeat' | 'repeat_same') (('{' LISTENTRY '}') | TYPE)) | (TYPE {',' TYPE})
// TODO: IMPLEMENT IT!

// **BNF** INTERFACE ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTUALPROP | INTERFACEMETHOD} '}'))

// **BNF** VAR ::= ['private' | 'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
export function analyzeVar(scope: SymbolScope, varNode: Node_Var, isInstanceMember: boolean) {
    let varType = analyzeType(scope, varNode.type);

    for (const declaredVar of varNode.variables) {
        const initializer = declaredVar.initializer;
        if (initializer === undefined) {
            if (varType?.isAutoType()) {
                analyzerDiagnostic.error(
                    declaredVar.identifier.location,
                    `Variables declared using 'auto' must be initialized.`
                );
            }

            continue;
        }

        const initType = analyzeVarInitializer(scope, varType, declaredVar.identifier, initializer);

        if (initType !== undefined && varType?.isAutoType()) {
            // Resolved the auto type
            varType = resolveAutoType(varType, initType, declaredVar.identifier);
        }
    }

    insertVariables(scope, varType, varNode, isInstanceMember);
}

export function resolveAutoType(autoType: ResolvedType, initType: ResolvedType, identifier: TokenObject): ResolvedType {
    let resolvedType: ResolvedType;

    if (initType.typeOrFunc.isType() && !initType.typeOrFunc.isPrimitiveOrEnum()) {
        resolvedType = initType.cloneWithHandle(autoType.handle ?? HandleModifier.Handle);
    } else {
        if (autoType.handle !== undefined && initType.handle === undefined) {
            analyzerDiagnostic.error(identifier.location, `Object handle is not supported for this type.`);
        }

        resolvedType = initType;
    }

    resolvedType = resolvedType.cloneWithConst(autoType.isConst);

    if (resolvedType !== undefined) {
        getActiveGlobalScope().markers.autoTypeResolution.push({
            autoToken: identifier,
            resolvedType
        });
    }

    return resolvedType;
}

export function insertVariables(
    scope: SymbolScope,
    varType: ResolvedType | undefined,
    varNode: Node_Var,
    isInstanceMember: boolean
) {
    const result: VariableSymbol[] = [];
    for (const variableInitializer of varNode.variables) {
        const variable: VariableSymbol = VariableSymbol.create({
            identifierToken: variableInitializer.identifier,
            scopePath: scope.scopePath,
            type: varType,
            isInstanceMember: isInstanceMember,
            accessRestriction: getAccessRestriction(varNode.accessor)
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
    initializer: Node_InitList | Node_Assign | Node_ArgList
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
        const callerIdentifier = IdentifierToken.createVirtual(varType.identifierText);

        return analyzeConstructorCall(scope, varType, callerIdentifier, initializer);
    }
}

// **BNF** IMPORT ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'

// **BNF** FUNCDEF ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'

// **BNF** VIRTUALPROP ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'

// **BNF** INTERFACEMETHOD ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] FUNCATTR ';'

// **BNF** STATBLOCK ::= '{' {VAR | STATEMENT | USING} '}'
export function analyzeStatBlock(scope: SymbolScope, statBlock: Node_StatBlock) {
    // Append completion markers to the scope
    pushScopeRegionMarker(scope, statBlock.nodeRange);

    for (const statement of statBlock.statementList) {
        if (statement.nodeName === NodeName.Var) {
            analyzeVar(scope, statement, false);
        } else if (statement.nodeName === NodeName.Using) {
            analyzeUsingNamespace(scope, statement);
        } else {
            analyzeStatement(scope, statement);
        }
    }
}

// **BNF** PARAMLIST ::= '(' ['void' | (PARAMETER {',' PARAMETER})] ')'
export function analyzeParamList(scope: SymbolScope, paramList: Node_ParamList) {
    for (const param of paramList.params) {
        analyzeParameter(scope, param);
    }
}

// **BNF** PARAMETER ::= TYPE TYPEMODIFIER [IDENTIFIER] ['...' | ('=' (EXPR | 'void'))]
function analyzeParameter(scope: SymbolScope, parameter: Node_Parameter) {
    if (parameter.defaultExpr === undefined || parameter.defaultExpr === voidParameter) {
        return;
    }

    analyzeExpr(scope, parameter.defaultExpr);
}

// **BNF** TYPEMODIFIER ::= ['&' ['in' | 'out' | 'inout'] ['+'] ['if_handle_then_const']]

// **BNF** TYPE ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
export function analyzeType(scope: SymbolScope, typeNode: Node_Type): ResolvedType | undefined {
    const isArray = typeNode.postfixList.some(p => p.isArray);
    const handle = typeNode.postfixList.find(p => p.handle !== undefined)?.handle;

    const reservedType = isArray ? undefined : analyzeReservedType(scope, typeNode, handle);
    if (reservedType !== undefined) {
        return reservedType;
    }

    const typeIdentifier = typeNode.dataType.identifier;

    const searchScope = findOptimalScope(scope, typeNode.scope, typeIdentifier) ?? scope;

    let givenTemplateArguments = typeNode.typeArguments;
    let givenIdentifier = typeIdentifier.text;

    if (isArray) {
        // If the type is an array, we replace the identifier with array type.
        // Strip the first array postfix; remaining array postfixes apply to the inner type.
        givenIdentifier = getGlobalSettings().builtinArrayType;
        const firstArrayIndex = typeNode.postfixList.findIndex(p => p.isArray);
        const innerPostfixList = typeNode.postfixList.slice(firstArrayIndex + 1).filter(p => p.isArray);
        const innerTypeNode: Node_Type = {...typeNode, postfixList: innerPostfixList};
        givenTemplateArguments = [innerTypeNode];
    }

    if (givenTemplateArguments.length > 0) {
        const specializationKey = givenIdentifier + buildTemplateSignature(givenTemplateArguments);
        const specializationSymbol = findSymbolWithParent(searchScope, specializationKey);
        if (specializationSymbol !== undefined && specializationSymbol.symbol.isType()) {
            return pushReferenceAndResolveType(
                typeIdentifier,
                specializationSymbol.symbol,
                typeNode.constToken !== undefined,
                getHandleModifier(handle)
            );
        }
    }

    let symbolAndScope = findSymbolWithParent(searchScope, givenIdentifier);
    if (
        symbolAndScope !== undefined &&
        isSymbolConstructorOrDestructor(symbolAndScope.symbol) &&
        symbolAndScope.scope.parentScope !== undefined
    ) {
        // When traversing the parent hierarchy, the constructor is sometimes found before the class type,
        // in which case search further up the hierarchy.
        symbolAndScope = getSymbolAndScopeIfExist(
            symbolAndScope.scope.parentScope.lookupSymbol(givenIdentifier),
            symbolAndScope.scope.parentScope
        );
    }

    if (symbolAndScope === undefined) {
        analyzerDiagnostic.error(typeIdentifier.location, `'${givenIdentifier}' is not defined.`);
        return undefined;
    }

    const {symbol: foundSymbol, scope: foundScope} = symbolAndScope;
    if (foundSymbol.isFunctionHolder() && foundSymbol.first.linkedNode.nodeName === NodeName.FuncDef) {
        return pushReferenceAndResolveType(
            typeIdentifier,
            foundSymbol.first,
            typeNode.constToken !== undefined,
            getHandleModifier(handle) ?? HandleModifier.Handle
        );
    } else if (!foundSymbol.isType()) {
        analyzerDiagnostic.error(typeIdentifier.location, `'${givenIdentifier}' is not a type.`);
        return undefined;
    } else if (
        getHandleModifier(handle) !== undefined &&
        foundSymbol.isPrimitiveOrEnum() &&
        foundSymbol.isTemplateParameterType !== true
    ) {
        analyzerDiagnostic.error(typeIdentifier.location, `Object handle is not supported for this type.`);
        return undefined;
    } else {
        const templateArguments = analyzeTemplateArguments(scope, foundSymbol, givenTemplateArguments);
        return pushReferenceAndResolveType(
            typeIdentifier,
            foundSymbol,
            typeNode.constToken !== undefined,
            getHandleModifier(handle),
            templateArguments
        );
    }
}

function isSymbolConstructorOrDestructor(symbol: SymbolHolder): boolean {
    if (symbol.isFunctionHolder() === false) {
        return false;
    }

    const linkedNode = symbol.first.linkedNode;
    if (linkedNode.nodeName !== NodeName.Func) {
        return false;
    }

    return linkedNode.head.tag !== 'function';
}

function pushReferenceAndResolveType(
    identifier: TokenObject,
    foundSymbol: TypeSymbol | FunctionSymbol,
    isConst?: boolean,
    handle?: HandleModifier,
    templateArguments?: TemplateMapping | undefined
): ResolvedType | undefined {
    getActiveGlobalScope().pushReference({
        toSymbol: foundSymbol,
        fromToken: identifier
    });

    return ResolvedType.create({
        typeOrFunc: foundSymbol,
        isConst: isConst,
        handle: handle,
        templateMapping: templateArguments
    });
}

// PRIMITIVETYPE | '?' | 'auto'
function analyzeReservedType(
    scope: SymbolScope,
    typeNode: Node_Type,
    handle: HandleAndConstTokenPair | undefined
): ResolvedType | undefined {
    const typeIdentifier = typeNode.dataType.identifier;
    if (typeIdentifier.kind !== TokenKind.Reserved) {
        return;
    }

    if (typeNode.scope !== undefined) {
        // This may seem like redundant processing, but it is invoked to add markers, which are used for autocompletion.
        findOptimalScope(scope, typeNode.scope, typeIdentifier);

        analyzerDiagnostic.error(typeIdentifier.location, `A primitive type cannot have namespace qualifiers.`);
    }

    const builtinType = tryGetBuiltinType(typeIdentifier);
    if (builtinType !== undefined) {
        if (
            getHandleModifier(handle) !== undefined &&
            builtinType.isPrimitiveOrEnum() &&
            typeIdentifier.text !== 'auto'
        ) {
            analyzerDiagnostic.error(typeIdentifier.location, `Object handle is not supported for this type.`);
            return undefined;
        }

        return ResolvedType.create({
            typeOrFunc: builtinType,
            isConst: typeNode.constToken !== undefined,
            handle: getHandleModifier(handle)
        });
    }

    return undefined;
}

function analyzeTemplateArguments(
    scope: SymbolScope,
    templateOwner: TypeSymbol | FunctionSymbol | undefined,
    templateArgumentNodes: Node_Type[]
) {
    const templateParameters = templateOwner?.templateParameters;
    if (templateOwner === undefined || templateParameters === undefined) {
        return undefined;
    }

    const translation: TemplateMapping = new Map();
    for (let i = 0; i < templateArgumentNodes.length; i++) {
        if (i >= templateParameters.length) {
            analyzerDiagnostic.error(
                templateArgumentNodes[templateArgumentNodes.length - 1].nodeRange.getBoundingLocation(),
                `Too many template arguments.`
            );
            break;
        }

        const templateArgument = templateArgumentNodes[i];
        translation.set(templateParameters[i].qualifiedIdentifier, analyzeType(scope, templateArgument));
    }

    return translation;
}

// **BNF** INITLIST ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
function analyzeInitList(scope: SymbolScope, initList: Node_InitList) {
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

// **BNF** SCOPE ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
export function findOptimalScope(
    parentScope: SymbolScope,
    scopeNode: Node_Scope | undefined,
    tokenAfterScopeAccess: TokenObject | undefined
): SymbolScope | undefined {
    let bestMatch = undefined; // If no valid scope exists, fall back to the most appropriate invalid one.

    if (scopeNode?.isGlobal) {
        bestMatch = evaluateScope(parentScope.getGlobalScope(), scopeNode, tokenAfterScopeAccess);
    } else {
        // Iterate through all using namespaces
        const scopeList = [[], ...parentScope.getUsingNamespacesWithParent().map(ns => ns.scopePath)];
        for (const usingScope of scopeList) {
            if (bestMatch?.ok) {
                break;
            }

            let scopeIterator = parentScope;

            // Iterate through current scope and its parent scopes
            for (;;) {
                if (bestMatch?.ok) {
                    break;
                }

                const relativeScope = scopeIterator.resolveRelativeScope(usingScope);
                if (relativeScope !== undefined) {
                    const candidate = evaluateScope(relativeScope, scopeNode, tokenAfterScopeAccess);
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

    if (!bestMatch?.ok && scopeNode === undefined) {
        return undefined;
    }

    bestMatch?.sideEffects.forEach(sideEffect => sideEffect());

    return bestMatch?.accessScope;
}

function evaluateScope(
    parentScope: SymbolScope,
    scopeNode: Node_Scope | undefined,
    tokenAfterScopeAccess: TokenObject | undefined
) {
    if (scopeNode === undefined) {
        const ok = parentScope.lookupSymbol(tokenAfterScopeAccess?.text ?? '') !== undefined;

        return {
            ok,
            accessScope: parentScope,
            accessIndex: -1,
            sideEffects: []
        };
    }

    // assert(scopeNode.nodeRange.end.next === tokenAfterScopeAccess);

    const sideEffect: (() => void)[] = [];

    let accessScope: SymbolScope = parentScope;
    let accessIndex: number;
    for (accessIndex = 0; accessIndex < scopeNode.scopeList.length; ++accessIndex) {
        const scopeToken = scopeNode.scopeList[accessIndex];
        const found = accessScope.lookupScope(scopeToken.text);
        if (found === undefined || found.isFunctionHolderScope()) {
            sideEffect.push(() => {
                analyzerDiagnostic.error(scopeToken.location, `Undefined scope: ${scopeToken.text}`);
            });

            break;
        }

        accessScope = found;
        const currentAccessIndex = accessIndex;

        // Record this qualifier so services can resolve, reference, or complete the scope access.
        sideEffect.push(() => {
            getActiveGlobalScope().markers.scopeAccess.push({
                scopeAccessNode: scopeNode,
                listIndex: currentAccessIndex,
                targetScope: found,
                tokenAfterScopeAccess: tokenAfterScopeAccess
            });
        });
    }

    const ok: boolean =
        accessIndex === scopeNode.scopeList.length &&
        // Can the identifier after the qualifiers be accessed?
        accessScope.lookupSymbol(tokenAfterScopeAccess?.text ?? '') !== undefined;

    return {ok, accessScope, accessIndex, sideEffects: sideEffect};
}

// **BNF** DATATYPE ::= (IDENTIFIER | PRIMITIVETYPE | '?' | 'auto')

// **BNF** PRIMITIVETYPE ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'

// **BNF** STATEMENT ::= (IF | FOR | FOREACH | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
function analyzeStatement(scope: SymbolScope, statement: Node_Statement) {
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

// **BNF** SWITCH ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
function analyzeSwitch(scope: SymbolScope, ast: Node_Switch) {
    analyzeAssign(scope, ast.assign);
    for (const c of ast.caseList) {
        analyzeCase(scope, c);
    }
}

// **BNF** BREAK ::= 'break' ';'

// **BNF** FOR ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
function analyzeFor(scope: SymbolScope, forNode: Node_For) {
    if (forNode.initial.nodeName === NodeName.Var) {
        analyzeVar(scope, forNode.initial, false);
    } else {
        analyzeExprStat(scope, forNode.initial);
    }

    if (forNode.condition !== undefined) {
        analyzeExprStat(scope, forNode.condition);
    }

    for (const inc of forNode.incrementList) {
        analyzeAssign(scope, inc);
    }

    if (forNode.statement !== undefined) {
        analyzeStatement(scope, forNode.statement);
    }
}

// **BNF** FOREACH ::= 'foreach' '(' TYPE IDENTIFIER {',' TYPE IDENTIFIER} ':' ASSIGN ')' STATEMENT
function analyzeForEach(scope: SymbolScope, forEachNode: Node_ForEach) {
    const assignNode = forEachNode.assign;
    const iteratorType = assignNode !== undefined ? analyzeAssign(scope, assignNode) : undefined;
    const forValueTypes =
        assignNode !== undefined ? checkForEachIterator(iteratorType, assignNode.nodeRange) : undefined;

    if (
        assignNode !== undefined &&
        forValueTypes !== undefined &&
        forValueTypes.length < forEachNode.variables.length
    ) {
        analyzerDiagnostic.error(
            forEachNode.nodeRange.getBoundingLocation().withEnd(assignNode.nodeRange.start.location.start),
            `Expected ${forValueTypes.length} variable declarations, but got ${forEachNode.variables.length}.`
        );
    }

    // Iterate through the variables and add them to the scope
    for (let i = 0; i < forEachNode.variables.length; i++) {
        const forValueType = forValueTypes?.[i];
        const variableDeclaration = forEachNode.variables[i];
        let variableType =
            variableDeclaration.type !== undefined ? analyzeType(scope, variableDeclaration.type) : undefined;
        if (forValueType !== undefined) {
            if (variableType?.isAutoType()) {
                // Resolved the auto type
                variableType = resolveAutoType(variableType, forValueType, variableDeclaration.identifier);
            } else {
                assertTypeCast(
                    forValueType,
                    variableType,
                    new TokenRange(variableDeclaration.type.nodeRange.start, variableDeclaration.identifier)
                );
            }
        }

        const variable: VariableSymbol = VariableSymbol.create({
            identifierToken: variableDeclaration.identifier,
            scopePath: scope.scopePath,
            type: variableType,
            isInstanceMember: false,
            accessRestriction: undefined
        });
        scope.insertSymbolAndCheck(variable);
    }

    if (forEachNode.statement !== undefined) {
        analyzeStatement(scope, forEachNode.statement);
    }
}

// **BNF** WHILE ::= 'while' '(' ASSIGN ')' STATEMENT
function analyzeWhile(scope: SymbolScope, whileNode: Node_While) {
    const assignType = analyzeAssign(scope, whileNode.assign);
    assertTypeCast(assignType, new ResolvedType(builtinBoolType), whileNode.assign.nodeRange);

    if (whileNode.statement !== undefined) {
        analyzeStatement(scope, whileNode.statement);
    }
}

// **BNF** DOWHILE ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
function analyzeDoWhile(scope: SymbolScope, doWhile: Node_DoWhile) {
    analyzeStatement(scope, doWhile.statement);

    if (doWhile.assign === undefined) {
        return;
    }

    const assignType = analyzeAssign(scope, doWhile.assign);
    assertTypeCast(assignType, new ResolvedType(builtinBoolType), doWhile.assign.nodeRange);
}

// **BNF** IF ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
function analyzeIf(scope: SymbolScope, ifNode: Node_If) {
    const conditionType = analyzeAssign(scope, ifNode.condition);
    assertTypeCast(conditionType, new ResolvedType(builtinBoolType), ifNode.condition.nodeRange);

    if (ifNode.thenStat !== undefined) {
        analyzeStatement(scope, ifNode.thenStat);
    }

    if (ifNode.elseStat !== undefined) {
        analyzeStatement(scope, ifNode.elseStat);
    }
}

// **BNF** CONTINUE ::= 'continue' ';'

// **BNF** EXPRSTAT ::= [ASSIGN] ';'
function analyzeExprStat(scope: SymbolScope, exprStat: Node_ExprStat) {
    if (exprStat.assign === undefined) {
        return;
    }

    const assign = analyzeAssign(scope, exprStat.assign);
    if (assign?.handle === undefined && assign?.typeOrFunc.isFunction()) {
        analyzerDiagnostic.error(exprStat.assign.nodeRange.getBoundingLocation(), `Function value is not callable.`);
    }
}

// **BNF** TRY ::= 'try' STATBLOCK 'catch' STATBLOCK
function analyzeTry(scope: SymbolScope, tryNode: Node_Try) {
    analyzeStatBlock(scope, tryNode.tryBlock);
    if (tryNode.catchBlock !== undefined) {
        analyzeStatBlock(scope, tryNode.catchBlock);
    }
}

// **BNF** RETURN ::= 'return' [ASSIGN] ';'
function analyzeReturn(scope: SymbolScope, returnNode: Node_Return) {
    const returnType = returnNode.assign !== undefined ? analyzeAssign(scope, returnNode.assign) : undefined;

    const functionScope = scope.takeParentByNode([NodeName.Func, NodeName.VirtualProp, NodeName.Lambda]);
    if (functionScope === undefined || functionScope.linkedNode === undefined) {
        return;
    }

    if (functionScope.linkedNode.nodeName === NodeName.Func) {
        // ...
        //   |-- Function holder scope (with no node)
        //       |-- The function scope for one of the overloads (with Node_Func)
        //           |-- ...
        //               |-- scope containing 'return'

        const functionHolderScope = functionScope.parentScope;
        assert(functionHolderScope !== undefined);

        const functionHolder = functionHolderScope.parentScope?.symbolTable.get(functionHolderScope.key);
        if (functionHolder?.isFunctionHolder() === false) {
            return;
        }

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
            if (returnNode.assign === undefined) {
                return;
            }

            analyzerDiagnostic.error(
                returnNode.nodeRange.getBoundingLocation(),
                `This function does not return a value.`
            );
        } else {
            assertTypeCast(returnType, functionSymbol.returnType, returnNode.nodeRange);
        }
    } else if (functionScope.linkedNode.nodeName === NodeName.VirtualProp) {
        const key = functionScope.key;
        const isGetter = key.startsWith('get_');
        if (isGetter === false) {
            if (returnNode.assign === undefined) {
                return;
            }

            analyzerDiagnostic.error(
                returnNode.nodeRange.getBoundingLocation(),
                `Property setter does not return a value.`
            );
            return;
        }

        const varName = key.substring(4, key.length);
        const functionReturn = functionScope.parentScope?.symbolTable.get(varName);
        if (functionReturn === undefined || functionReturn instanceof VariableSymbol === false) {
            return;
        }

        assertTypeCast(returnType, functionReturn.type, returnNode.nodeRange);
    } else if (functionScope.linkedNode.nodeName === NodeName.Lambda) {
        // TODO: Support for lambda
    }
}

// **BNF** CASE ::= (('case' EXPR) | 'default') ':' {STATEMENT}
function analyzeCase(scope: SymbolScope, caseNode: Node_Case) {
    if (caseNode.expr !== undefined) {
        analyzeExpr(scope, caseNode.expr);
    }

    for (const statement of caseNode.statementList) {
        analyzeStatement(scope, statement);
    }
}

// **BNF** EXPR ::= EXPRTERM {EXPROP EXPRTERM}
function analyzeExpr(scope: SymbolScope, expr: Node_Expr): ResolvedType | undefined {
    // Evaluate by Shunting Yard Algorithm
    // https://qiita.com/phenan/items/df157fef2fea590e3fa9

    type Term = [ResolvedType | undefined, TokenRange];
    type Op = TokenObject;

    function isOp(termOrOp: Term | Op): termOrOp is Op {
        return 'text' in termOrOp;
    }

    function precedence(termOrOp: Term | Op) {
        return isOp(termOrOp) ? getOperatorPrecedence(termOrOp) : 1;
    }

    const inputList: (Term | Op)[] = [];
    for (let cursor: Node_Expr | undefined = expr; ; ) {
        inputList.push([analyzeExprTerm(scope, cursor.head), cursor.head.nodeRange]);
        if (cursor.tail === undefined) {
            break;
        }

        inputList.push(cursor.tail.operator);
        cursor = cursor.tail.expr;
    }

    const stackList: (Term | Op)[] = [];
    const outputList: (Term | Op)[] = [];

    while (inputList.length > 0 || stackList.length > 0) {
        const inputToStack: boolean =
            stackList.length === 0 ||
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
            if (lhs === undefined || rhs === undefined) {
                return undefined;
            }

            outputTerm.push([
                analyzeExprOp(scope, item, lhs[0], rhs[0], lhs[1], rhs[1]),
                new TokenRange(lhs[1].start, rhs[1].end)
            ]);
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

// **BNF** EXPRTERM ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function analyzeExprTerm(scope: SymbolScope, ast: Node_ExprTerm): ResolvedType | undefined {
    if (ast.exprTerm === 1) {
        // TODO
    } else if (ast.exprTerm === 2) {
        return analyzeExprTerm2(scope, ast);
    }

    return undefined;
}

// {EXPRPREOP} EXPRVALUE {EXPRPOSTOP}
function analyzeExprTerm2(scope: SymbolScope, exprTerm: Node_ExprTerm2) {
    let exprValue = analyzeExprValue(scope, exprTerm.value);

    for (const postOp of exprTerm.postOps) {
        if (exprValue === undefined) {
            break;
        }

        exprValue = analyzeExprPostOp(scope, postOp, exprValue, exprTerm.nodeRange);
    }

    for (const preOp of exprTerm.preOps) {
        if (exprValue === undefined) {
            break;
        }

        exprValue = analyzeExprPreOp(scope, preOp, exprValue);
    }

    return exprValue;
}

// **BNF** EXPRVALUE ::= 'void' | CONSTRUCTORCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
function analyzeExprValue(scope: SymbolScope, exprValue: Node_ExprValue): ResolvedType | undefined {
    switch (exprValue.nodeName) {
        case NodeName.ConstructorCall: {
            const type = analyzeType(scope, exprValue.type);
            if (type === undefined) {
                return undefined;
            }

            return analyzeConstructorCall(scope, type, exprValue.type.dataType.identifier, exprValue.argList);
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

// **BNF** CONSTRUCTORCALL ::= TYPE ARGLIST
export function analyzeConstructorCall(
    scope: SymbolScope,
    constructorType: ResolvedType,
    callerIdentifier: TokenObject,
    callerArgList: Node_ArgList
): ResolvedType | undefined {
    const constructor = findConstructorOfType(constructorType);
    if (constructor === undefined || constructor.isFunctionHolder() === false) {
        const callerArgTypes = callerArgList.argList.map(arg => analyzeAssign(scope, arg.assign));
        return checkDefaultConstructorCall(callerIdentifier, callerArgList.nodeRange, callerArgTypes, constructorType);
    }

    analyzeFunctionCall(scope, callerIdentifier, callerArgList, constructor, constructorType.templateMapping, {
        constructorType: constructorType
    });
    return constructorType;
}

// **BNF** EXPRPREOP ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'
function analyzeExprPreOp(scope: SymbolScope, exprPreOp: TokenObject, exprValue: ResolvedType) {
    const op = exprPreOp.text;

    if (exprPreOp.text === '@') {
        return exprValue
            .cloneWithHandle(exprValue.handle ?? HandleModifier.Handle)
            .cloneWithExplicitHandleAccess(true)
            .cloneWithEvaluatedRvalue(undefined);
    }

    if ((op === '++' || op === '--') && isReadOnlyAssignmentTarget(exprValue)) {
        analyzerDiagnostic.error(exprPreOp.location, `Reference is read-only.`);
        return undefined;
    }

    if (exprValue.typeOrFunc.isType()) {
        if (exprValue.typeOrFunc.isEnumType()) {
            if (op === '-' || op === '+' || op === '~') {
                return resolvedBuiltinInt.cloneWithEvaluatedRvalue(evaluatePreOp(op, exprValue.evaluatedRvalue));
            }
        } else if (exprValue.typeOrFunc.isNumberType()) {
            if (op === '-' || op === '+' || op === '++' || op === '--') {
                return exprValue.cloneWithEvaluatedRvalue(evaluatePreOp(op, exprValue.evaluatedRvalue));
            }

            if (op === '~' && exprValue.typeOrFunc.isIntegerType()) {
                return exprValue.cloneWithEvaluatedRvalue(evaluatePreOp(op, exprValue.evaluatedRvalue));
            }
        } else if (exprValue.typeOrFunc === builtinBoolType) {
            if (op === '!' || op === 'not') {
                return resolvedBuiltinBool.cloneWithEvaluatedRvalue(evaluatePreOp(op, exprValue.evaluatedRvalue));
            }
        }
    }

    const alias = preOpAliases.get(op);
    if (alias !== undefined) {
        return checkOverloadedOperatorCall({
            callerOperator: exprPreOp,
            alias,
            lhs: exprValue,
            lhsRange: new TokenRange(exprPreOp, exprPreOp),
            rhs: [],
            rhsRange: new TokenRange(exprPreOp, exprPreOp)
        });
    }

    analyzerDiagnostic.error(
        exprPreOp.location,
        `Operator '${op}' cannot be applied to ${stringifyResolvedType(exprValue)}.`
    );
    return undefined;
}

const preOpAliases = new Map<string, string>([
    ['-', 'opNeg'],
    ['~', 'opCom'],
    ['++', 'opPreInc'],
    ['--', 'opPreDec']
]);

function evaluatePreOp(op: string, value: EvaluatedValue | undefined): EvaluatedValue | undefined {
    if (value === undefined) {
        return undefined;
    }

    switch (op) {
        case '+':
            return typeof value === 'number' ? value : undefined;
        case '-':
            return typeof value === 'number' ? -value : undefined;
        case '~':
            return typeof value === 'number' ? ~value : undefined;
        case '++':
            return typeof value === 'number' ? value + 1 : undefined;
        case '--':
            return typeof value === 'number' ? value - 1 : undefined;
        case '!':
        case 'not':
            return typeof value === 'boolean' ? !value : undefined;
        default:
            return undefined;
    }
}

// **BNF** EXPRPOSTOP ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ']') | ARGLIST | '++' | '--'
function analyzeExprPostOp(
    scope: SymbolScope,
    exprPostOp: Node_ExprPostOp,
    exprValue: ResolvedType,
    exprRange: TokenRange
) {
    if (exprPostOp.postOpPattern === 1) {
        return analyzeExprPostOp1(scope, exprPostOp, exprValue);
    } else if (exprPostOp.postOpPattern === 2) {
        return analyzeExprPostOp2(scope, exprPostOp, exprValue, exprRange);
    } else if (exprPostOp.postOpPattern === 4) {
        if (isReadOnlyAssignmentTarget(exprValue)) {
            analyzerDiagnostic.error(exprPostOp.nodeRange.getBoundingLocation(), `Reference is read-only.`);
            return undefined;
        }

        return exprValue;
    }
}

// ('.' (FUNCCALL | IDENTIFIER))
function analyzeExprPostOp1(scope: SymbolScope, receiverPostOp: Node_ExprPostOp1, receiverType: ResolvedType) {
    if (receiverType.typeOrFunc instanceof TypeSymbol === false) {
        analyzerDiagnostic.error(receiverPostOp.nodeRange.getBoundingLocation(), `Invalid member access on a type.`);
        return undefined;
    }

    // Record this member access so services can complete instance members.
    getActiveGlobalScope().markers.instanceAccess.push({
        instanceAccessNode: receiverPostOp,
        targetType: receiverType.typeOrFunc
    });

    const member = receiverPostOp.member;
    const isMemberMethod = member?.access === 'method';

    const identifier = isMemberMethod ? member.node.identifier : member?.token;
    if (identifier === undefined) {
        return undefined;
    }

    if (isNodeClassOrInterface(receiverType.typeOrFunc.linkedNode) === false) {
        analyzerDiagnostic.error(identifier.location, `'${identifier.text}' is not a member.`);
        return undefined;
    }

    const receiverScope = receiverType.typeOrFunc.membersScopePath;
    if (receiverScope === undefined) {
        return undefined;
    }

    if (isMemberMethod) {
        // Analyze method call.
        const instanceMember = resolveActiveScope(receiverScope).lookupSymbol(identifier.text);
        if (instanceMember === undefined) {
            analyzerDiagnostic.error(identifier.location, `Member '${identifier.text}' is not defined.`);
            return undefined;
        }

        const callTemplateArguments = member.node.typeArguments ?? [];

        if (instanceMember.isFunctionHolder()) {
            // This instance member is a method.
            const callTemplateMapping =
                callTemplateArguments.length > 0
                    ? analyzeTemplateArguments(scope, instanceMember.first, callTemplateArguments)
                    : undefined;
            return analyzeFunctionCall(
                scope,
                identifier,
                member.node.argList,
                instanceMember,
                mergeTemplateMappings(receiverType.templateMapping, callTemplateMapping),
                {callerInstanceType: receiverType}
            );
        }

        if (instanceMember.isVariable() && instanceMember.type?.typeOrFunc.isFunction()) {
            // This instance member is a delegate.
            const delegate = instanceMember.type.typeOrFunc.toHolder();
            const callTemplateMapping =
                callTemplateArguments.length > 0
                    ? analyzeTemplateArguments(scope, instanceMember.type.typeOrFunc, callTemplateArguments)
                    : undefined;
            return analyzeFunctionCall(
                scope,
                identifier,
                member.node.argList,
                delegate,
                mergeTemplateMappings(receiverType.templateMapping, callTemplateMapping),
                {calleeDelegateVariable: instanceMember}
            );
        }

        analyzerDiagnostic.error(identifier.location, `'${identifier.text}' is not a method.`);
        return undefined;
    } else {
        // Analyze field access.
        const fieldType = applyTemplateMapping(
            analyzeVariableAccess(scope, resolveActiveScope(receiverScope), identifier),
            receiverType.templateMapping
        );
        return applyReceiverConstToFieldType(fieldType, receiverType);
    }
}

function applyReceiverConstToFieldType(
    fieldType: ResolvedType | undefined,
    receiver: ResolvedType
): ResolvedType | undefined {
    if (fieldType === undefined || !receiver.isConst) {
        return fieldType;
    }

    // -----------------------------------------------
    // At this point, the receiver is const, so apply that constness to the field type if necessary.
    // e.g., `const MyObj myObj;`
    // `myObj.field` is treated as const, even if `field` is not declared const.

    if (fieldType.handle !== undefined) {
        return fieldType.cloneWithHandle(HandleModifier.ConstHandle);
    }

    return fieldType.cloneWithConst(true);
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
function analyzeExprPostOp2(
    scope: SymbolScope,
    exprPostOp: Node_ExprPostOp2,
    exprValue: ResolvedType,
    exprRange: TokenRange
) {
    const args = exprPostOp.indexingList.map(indexing => analyzeAssign(scope, indexing.assign));
    return checkOverloadedOperatorCall({
        callerOperator: exprPostOp.nodeRange.end,
        alias: 'opIndex',
        lhs: exprValue,
        lhsRange: exprRange,
        rhs: args,
        rhsRange: exprPostOp.nodeRange,
        // Support for named args on index operator are not implemented yet in AngelScript?
        rhsArgNames: exprPostOp.indexingList.map(indexing => indexing.identifier)
    });
}

// **BNF** CAST ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
function analyzeCast(scope: SymbolScope, cast: Node_Cast): ResolvedType | undefined {
    const targetType = analyzeType(scope, cast.type);
    const fromType = analyzeAssign(scope, cast.assign);
    const toType =
        fromType?.handle !== undefined && targetType?.typeOrFunc.isType() === true
            ? targetType.cloneWithHandle(fromType.handle).cloneWithConst(targetType.isConst || fromType.isConst)
            : targetType;

    const canFallbackToFunctionalCast = toType?.typeOrFunc.isType() === true && !toType.typeOrFunc.isPrimitiveOrEnum();
    const messageRange = new TokenRange(cast.nodeRange.start, cast.type.nodeRange.end.next ?? cast.nodeRange.end);
    if (!checkTypeCast(fromType, toType, messageRange, ConversionMode.ExplicitCast)) {
        if (canFallbackToFunctionalCast) {
            assertTypeCast(fromType, toType, messageRange, ConversionMode.FunctionalCast);
        } else {
            analyzerDiagnostic.error(
                messageRange.getBoundingLocation(),
                `'${stringifyResolvedType(fromType)}' cannot be converted to '${stringifyResolvedType(toType)}'.`
            );
        }
    }

    return toType;
}

// **BNF** LAMBDA ::= 'function' '(' [LAMBDAPARAM {',' LAMBDAPARAM}] ')' STATBLOCK
function analyzeLambda(scope: SymbolScope, lambda: Node_Lambda): ResolvedType | undefined {
    const parameterTypes: (ResolvedType | undefined)[] = [];

    for (const param of lambda.paramList) {
        parameterTypes.push(analyzeLambdaParam(scope, param));
    }

    return ResolvedType.create({
        typeOrFunc: builtinAnyType,
        lambdaInfo: {
            node: lambda,
            parameterTypes: parameterTypes,
            resolve: (expectedType, nodeRange) =>
                analyzeLambdaAsFuncdef(scope, lambda, parameterTypes, expectedType, nodeRange)
        }
    });
}

function analyzeLambdaAsFuncdef(
    scope: SymbolScope,
    lambda: Node_Lambda,
    parameterTypes: (ResolvedType | undefined)[],
    expectedType: ResolvedType,
    nodeRange: TokenRange | undefined
): ResolvedType | undefined {
    const expectedFunc = expectedType.typeOrFunc;
    if (!expectedFunc.isFunction() || expectedFunc.linkedNode.nodeName !== NodeName.FuncDef) {
        analyzerDiagnostic.error(
            (nodeRange ?? lambda.nodeRange).getBoundingLocation(),
            `Lambda requires a funcdef target type.`
        );
        return undefined;
    }

    const childScope = scope.insertScope(createAnonymousIdentifier(), lambda);

    for (let i = 0; i < lambda.paramList.length; i++) {
        const param = lambda.paramList[i];
        if (param.identifier === undefined) {
            continue;
        }

        const inferredType = applyTemplateMapping(expectedFunc.parameterTypes[i], expectedType.templateMapping);
        const argument: VariableSymbol = VariableSymbol.create({
            identifierToken: param.identifier,
            scopePath: childScope.scopePath,
            type: parameterTypes[i] ?? inferredType,
            isInstanceMember: false,
            accessRestriction: undefined
        });
        childScope.insertSymbolAndCheck(argument);
    }

    if (lambda.statBlock !== undefined) {
        analyzeStatBlock(childScope, lambda.statBlock);
    }

    return expectedType;
}

// **BNF** LAMBDAPARAM ::= [TYPE TYPEMODIFIER] [IDENTIFIER]
function analyzeLambdaParam(scope: SymbolScope, param: Node_LambdaParam): ResolvedType | undefined {
    return param.type !== undefined ? analyzeType(scope, param.type) : undefined;
}

// **BNF** LITERAL ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
function analyzeLiteral(scope: SymbolScope, literal: Node_Literal): ResolvedType | undefined {
    const literalValue = literal.value;
    if (literalValue.isNumberToken()) {
        const value = literalValue.getNumberValue();
        switch (literalValue.numberLiteral) {
            case NumberLiteral.Integer:
                return resolvedBuiltinInt.cloneWithEvaluatedRvalue(value);
            case NumberLiteral.Float:
                return resolvedBuiltinFloat.cloneWithEvaluatedRvalue(value);
            case NumberLiteral.Double:
                return resolvedBuiltinDouble.cloneWithEvaluatedRvalue(value);
        }
    }

    if (literalValue.isStringToken()) {
        if (literalValue.text[0] === "'" && getGlobalSettings().characterLiterals) {
            // TODO: verify utf8 validity
            return resolvedBuiltinInt;
        }

        const stringType = getActiveGlobalScope().getContext().builtinStringType;
        return stringType === undefined
            ? undefined
            : new ResolvedType(stringType).cloneWithEvaluatedRvalue(literalValue.getStringContent());
    }

    if (literalValue.text === 'true' || literalValue.text === 'false') {
        return resolvedBuiltinBool.cloneWithEvaluatedRvalue(literalValue.text === 'true');
    }

    if (literalValue.text === 'null') {
        return resolvedBuiltinNull;
    }

    return undefined;
}

// **BNF** FUNCCALL ::= SCOPE IDENTIFIER ['<' TYPE {',' TYPE} '>'] ARGLIST
function analyzeFuncCall(scope: SymbolScope, funcCall: Node_FuncCall): ResolvedType | undefined {
    let searchScope = findOptimalScope(scope, funcCall.scope, funcCall.identifier);
    if (funcCall.scope !== undefined && searchScope === undefined) {
        analyzeArgList(scope, funcCall.argList);
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

        analyzeArgList(scope, funcCall.argList);
        return undefined;
    }

    const [calleeSymbol, calleeScope] = [calleeFunc.symbol, calleeFunc.scope];

    if (calleeSymbol.isType()) {
        const constructorType: ResolvedType = new ResolvedType(calleeSymbol);
        return analyzeConstructorCall(scope, constructorType, funcCall.identifier, funcCall.argList);
    }

    const callTemplateArguments = funcCall.typeArguments ?? [];

    if (calleeSymbol.isVariable() && calleeSymbol.type?.typeOrFunc.isFunction()) {
        // Invoke function handle
        const callTemplateMapping =
            callTemplateArguments.length > 0
                ? analyzeTemplateArguments(scope, calleeSymbol.type.typeOrFunc, callTemplateArguments)
                : undefined;
        return analyzeFunctionCall(
            scope,
            funcCall.identifier,
            funcCall.argList,
            new FunctionSymbolHolder(calleeSymbol.type.typeOrFunc),
            callTemplateMapping,
            {calleeDelegateVariable: calleeSymbol}
        );
    }

    if (calleeSymbol instanceof VariableSymbol) {
        return analyzeOpCallCaller(scope, funcCall, calleeSymbol);
    }

    if (calleeSymbol.isFunctionHolder() === false) {
        analyzerDiagnostic.error(funcCall.identifier.location, `'${funcCall.identifier.text}' is not a function.`);
        analyzeArgList(scope, funcCall.argList);
        return undefined;
    }

    const callTemplateMapping =
        callTemplateArguments.length > 0
            ? analyzeTemplateArguments(scope, calleeSymbol.first, callTemplateArguments)
            : undefined;
    return analyzeFunctionCall(scope, funcCall.identifier, funcCall.argList, calleeSymbol, callTemplateMapping);
}

function analyzeOpCallCaller(scope: SymbolScope, funcCall: Node_FuncCall, calleeVariable: VariableSymbol) {
    const varType = calleeVariable.type;
    if (varType === undefined || varType.scopePath === undefined) {
        analyzerDiagnostic.error(funcCall.identifier.location, `'${funcCall.identifier.text}' is not callable.`);
        return;
    }

    const classScope = resolveActiveScope(varType.scopePath).lookupScope(varType.typeOrFunc.identifierText);
    if (classScope === undefined) {
        return undefined;
    }

    const opCall = classScope.lookupSymbol('opCall');
    if (opCall === undefined || opCall.isFunctionHolder() === false) {
        analyzerDiagnostic.error(
            funcCall.identifier.location,
            `'opCall' is not defined in type '${varType.typeOrFunc.identifierText}'.`
        );
        return;
    }

    return analyzeFunctionCall(scope, funcCall.identifier, funcCall.argList, opCall, varType.templateMapping);
}

function analyzeFunctionCall(
    scope: SymbolScope,
    callerIdentifier: TokenObject,
    callerArgList: Node_ArgList,
    calleeFuncHolder: FunctionSymbolHolder,
    calleeTemplateMapping: TemplateMapping | undefined,
    options?: {
        constructorType?: ResolvedType;
        callerInstanceType?: ResolvedType;
        calleeDelegateVariable?: VariableSymbol;
    }
) {
    getActiveGlobalScope().markers.functionCall.push({
        callerIdentifier: callerIdentifier,
        callerArgumentsNode: callerArgList,
        calleeFuncHolder: calleeFuncHolder,
        calleeTemplateMapping: calleeTemplateMapping
    });

    const callerArgTypes = analyzeArgList(scope, callerArgList);
    const callerArgs = callerArgList.argList.map((arg, i) => ({
        name: arg.identifier,
        range: arg.assign.nodeRange,
        type: callerArgTypes[i]
    }));

    if (options?.constructorType !== undefined && callerArgList.argList.length === 1) {
        // A one-argument type call can be an `Type(arg)` cast even when the type has constructors.
        const callerArgType = analyzeAssign(scope, callerArgList.argList[0].assign);
        if (
            checkTypeCast(
                callerArgType,
                options?.constructorType,
                callerArgList.nodeRange,
                ConversionMode.FunctionalCast
            )
        ) {
            return options?.constructorType;
        }
    }

    return checkFunctionCall({
        callerIdentifier: callerIdentifier,
        callerRange: callerArgList.nodeRange,
        callerArgs: callerArgs,
        callerInstanceType: options?.callerInstanceType,
        calleeFuncHolder: calleeFuncHolder,
        calleeTemplateMapping: calleeTemplateMapping,
        calleeDelegateVariable: options?.calleeDelegateVariable
    });
}

// **BNF** VARACCESS ::= SCOPE IDENTIFIER
function analyzeVarAccess(scope: SymbolScope, varAccess: Node_VarAccess): ResolvedType | undefined {
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
    currentScope: SymbolScope,
    accessScope: SymbolScope,
    varIdentifier: TokenObject
): ResolvedType | undefined {
    const found = findSymbolWithParent(accessScope, varIdentifier.text);
    if (found === undefined) {
        const enumMemberAccess = analyzeEnumMemberAccess(currentScope, accessScope, varIdentifier);
        if (enumMemberAccess !== undefined) {
            return enumMemberAccess;
        }

        analyzerDiagnostic.error(varIdentifier.location, `'${varIdentifier.text}' is not defined.`);
        return undefined;
    }

    if (found.symbol.isType()) {
        analyzerDiagnostic.error(varIdentifier.location, `'${varIdentifier.text}' is a type, not a variable.`);
        return undefined;
    }

    if (canAccessInstanceMember(currentScope, found.symbol) === false) {
        analyzerDiagnostic.error(varIdentifier.location, `Member '${varIdentifier.text}' is not accessible here.`);
        return undefined;
    }

    if (found.symbol.isVariable()) {
        // NOTE: Delegate variables also go through here.

        const accessedVariable = found.symbol.toList()[0];
        if (accessedVariable.identifierToken.location.path !== '') {
            // Only add to the reference list if the identifier has a valid path.
            // (Keywords like 'this' have an empty identifierToken, so they are excluded.)
            getActiveGlobalScope().pushReference({
                toSymbol: found.symbol.toList()[0],
                fromToken: varIdentifier
            });
        }

        return found.symbol.type
            ?.cloneWithAttachedAccessSource(accessedVariable)
            .cloneWithEvaluatedRvalue(accessedVariable.evaluatedValue); // <-- Variable
    } else {
        // Unlike variables, function access is not added to the reference here.
        // It will be added once overload resolution is completed.

        return ResolvedType.create({typeOrFunc: found.symbol.first, attachedAccessSource: varIdentifier}); // <-- Function (tentatively using the first overload)
    }
}

// AngelScript allows ambiguous enum member access.
function analyzeEnumMemberAccess(
    currentScope: SymbolScope,
    accessScope: SymbolScope,
    varIdentifier: TokenObject
): ResolvedType | undefined {
    // If no access scope is specified, start with a global.
    accessScope = currentScope === accessScope ? getActiveGlobalScope() : accessScope;

    const accessScopePath = accessScope.scopePath;
    // accessScopePath:
    //   ...
    //     |-- Access::
    //         |-- ...

    const enumCandidates: VariableSymbol[] = [];
    for (const enumScope of getActiveGlobalScope().getContext().enumScopeList) {
        // enumScope.scopePath:
        //   Outer::
        //     |-- Access::
        //         |-- Color

        const ok =
            accessScopePath.length === 0 || // Access to the global scope or
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
    const virtualType = TypeSymbol.create({
        identifierToken: varIdentifier,
        scopePath: [],
        linkedNode: {
            nodeName: NodeName.Enum,
            nodeRange: new TokenRange(varIdentifier, varIdentifier),
            scopeRange: new TokenRange(varIdentifier, varIdentifier),
            metadata: [],
            entityTokens: undefined,
            identifier: varIdentifier,
            memberList: [],
            enumType: undefined
        } satisfies Node_Enum,
        membersScopePath: undefined,
        multipleEnumCandidates: enumCandidates
    });

    return new ResolvedType(virtualType);
}

export function analyzeEnumMemberValues(scope: SymbolScope, memberList: IdentifierAndOptionalExpr[]) {
    let nextValue = 0;
    for (const member of memberList) {
        if (member.expr !== undefined) {
            const evaluated = analyzeExpr(scope, member.expr)?.evaluatedRvalue;
            if (typeof evaluated === 'number') {
                nextValue = evaluated;
            }
        }

        const symbol = scope.lookupSymbol(member.identifier.text);
        if (symbol?.isVariable()) {
            symbol.assignEvaluatedValue(nextValue);
        }

        nextValue++;
    }
}

// **BNF** ARGLIST ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
function analyzeArgList(scope: SymbolScope, argList: Node_ArgList): (ResolvedType | undefined)[] {
    const types: (ResolvedType | undefined)[] = [];
    for (const arg of argList.argList) {
        types.push(analyzeAssign(scope, arg.assign));
    }

    return types;
}

// **BNF** ASSIGN ::= CONDITION [ ASSIGNOP ASSIGN ]
function analyzeAssign(scope: SymbolScope, assign: Node_Assign): ResolvedType | undefined {
    // Perform a left-fold operation
    let cursor = assign;
    let lhs = analyzeCondition(scope, assign.condition);
    for (;;) {
        if (cursor.tail === undefined) {
            break;
        }

        const rhs = analyzeCondition(scope, cursor.tail.assign.condition);
        lhs = analyzeAssignOp(
            scope,
            cursor.tail.operator,
            lhs,
            rhs,
            cursor.condition.nodeRange,
            cursor.tail.assign.condition.nodeRange
        );
        cursor = cursor.tail.assign;
    }

    return lhs;
}

// **BNF** CONDITION ::= EXPR ['?' ASSIGN ':' ASSIGN]
export function analyzeCondition(scope: SymbolScope, condition: Node_Condition): ResolvedType | undefined {
    const exprType = analyzeExpr(scope, condition.expr);
    if (condition.ternary === undefined) {
        return exprType;
    }

    assertTypeCast(exprType, new ResolvedType(builtinBoolType), condition.expr.nodeRange);

    const trueAssign = analyzeAssign(scope, condition.ternary.trueAssign);
    const falseAssign = analyzeAssign(scope, condition.ternary.falseAssign);

    if (trueAssign === undefined && falseAssign !== undefined) {
        return falseAssign;
    }

    if (trueAssign !== undefined && falseAssign === undefined) {
        return trueAssign;
    }

    if (trueAssign === undefined || falseAssign === undefined) {
        return undefined;
    }

    if (checkTypeCast(trueAssign, falseAssign)) {
        return falseAssign;
    }

    if (checkTypeCast(falseAssign, trueAssign)) {
        return trueAssign;
    }

    analyzerDiagnostic.error(
        getBoundingLocationBetween(
            condition.ternary.trueAssign.nodeRange.start,
            condition.ternary.falseAssign.nodeRange.end
        ),
        `Type mismatch between '${stringifyResolvedType(trueAssign)}' and '${stringifyResolvedType(falseAssign)}'.`
    );
    return undefined;
}

// **BNF** EXPROP ::= MATHOP | COMPOP | LOGICOP | BITOP
function analyzeExprOp(
    scope: SymbolScope,
    operator: TokenObject,
    lhs: ResolvedType | undefined,
    rhs: ResolvedType | undefined,
    leftRange: TokenRange,
    rightRange: TokenRange
): ResolvedType | undefined {
    if (operator.isReservedToken() === false) {
        return undefined;
    }

    if (lhs === undefined || rhs === undefined) {
        return undefined;
    }

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

// **BNF** BITOP ::= '&' | '|' | '^' | '<<' | '>>' | '>>>'
function analyzeBitOp(
    scope: SymbolScope,
    callerOperator: TokenObject,
    lhs: ResolvedType,
    rhs: ResolvedType,
    lhsRange: TokenRange,
    rhsRange: TokenRange
): ResolvedType | undefined {
    const numberOperatorCall = evaluateNumberOperatorCall(lhs, rhs);
    if (numberOperatorCall) {
        return numberOperatorCall.cloneWithEvaluatedRvalue(
            evaluateNumberBinaryOp(callerOperator.text, lhs.evaluatedRvalue, rhs.evaluatedRvalue)
        );
    }

    const aliases = bitOpAliases.get(callerOperator.text);
    assert(aliases !== undefined);

    const [alias, alias_r] = aliases;
    return checkOverloadedOperatorCall({
        callerOperator,
        alias,
        alias_r,
        lhs,
        lhsRange,
        rhs,
        rhsRange
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

// **BNF** MATHOP ::= '+' | '-' | '*' | '/' | '%' | '**'
function analyzeMathOp(
    scope: SymbolScope,
    callerOperator: TokenObject,
    lhs: ResolvedType,
    rhs: ResolvedType,
    lhsRange: TokenRange,
    rhsRange: TokenRange
): ResolvedType | undefined {
    const numberOperatorCall = evaluateNumberOperatorCall(lhs, rhs);
    if (numberOperatorCall) {
        return numberOperatorCall.cloneWithEvaluatedRvalue(
            evaluateNumberBinaryOp(callerOperator.text, lhs.evaluatedRvalue, rhs.evaluatedRvalue)
        );
    }

    const aliases = mathOpAliases.get(callerOperator.text);
    assert(aliases !== undefined);

    const [alias, alias_r] = aliases;
    const result = checkOverloadedOperatorCall({
        callerOperator,
        alias,
        alias_r,
        lhs,
        lhsRange,
        rhs,
        rhsRange
    });

    if (callerOperator.text === '+' && isBuiltinStringType(lhs) && isBuiltinStringType(rhs)) {
        // Constant string concatenation for better editor experience.
        return result?.cloneWithEvaluatedRvalue(evaluateStringBinaryOp(lhs.evaluatedRvalue, rhs.evaluatedRvalue));
    }

    return result;
}

const mathOpAliases = new Map<string, [string, string]>([
    ['+', ['opAdd', 'opAdd_r']],
    ['-', ['opSub', 'opSub_r']],
    ['*', ['opMul', 'opMul_r']],
    ['/', ['opDiv', 'opDiv_r']],
    ['%', ['opMod', 'opMod_r']],
    ['**', ['opPow', 'opPow_r']]
]);

function evaluateNumberBinaryOp(
    op: string,
    lhs: EvaluatedValue | undefined,
    rhs: EvaluatedValue | undefined
): number | undefined {
    if (typeof lhs !== 'number' || typeof rhs !== 'number') {
        return undefined;
    }

    return evaluateBinaryOp(op, lhs, rhs);
}

function evaluateStringBinaryOp(lhs: EvaluatedValue | undefined, rhs: EvaluatedValue | undefined): string | undefined {
    if (typeof lhs !== 'string' || typeof rhs !== 'string') {
        return undefined;
    }

    return lhs + rhs;
}

function isBuiltinStringType(type: ResolvedType): boolean {
    const stringType = getActiveGlobalScope().getContext().builtinStringType;
    return stringType !== undefined && type.typeOrFunc === stringType;
}

function evaluateBinaryOp(op: string, lhs: number, rhs: number): number | undefined {
    switch (op) {
        case '+':
            return lhs + rhs;
        case '-':
            return lhs - rhs;
        case '*':
            return lhs * rhs;
        case '/':
            return lhs / rhs;
        case '%':
            return lhs % rhs;
        case '**':
            return lhs ** rhs;
        case '&':
            return lhs & rhs;
        case '|':
            return lhs | rhs;
        case '^':
            return lhs ^ rhs;
        case '<<':
            return lhs << rhs;
        case '>>':
            return lhs >> rhs;
        case '>>>':
            return lhs >>> rhs;
        default:
            return undefined;
    }
}

// **BNF** COMPOP ::= '==' | '!=' | '<' | '<=' | '>' | '>=' | 'is' | '!is'
function analyzeCompOp(
    scope: SymbolScope,
    callerOperator: TokenObject,
    lhs: ResolvedType,
    rhs: ResolvedType,
    lhsRange: TokenRange,
    rhsRange: TokenRange
): ResolvedType | undefined {
    if (callerOperator.text === 'is' || callerOperator.text === '!is') {
        if (canReferenceComparison(lhs, rhs)) {
            return resolvedBuiltinBool;
        }

        analyzerDiagnostic.error(
            callerOperator.location,
            `Operator '${callerOperator.text}' requires handles or null.`
        );
        return undefined;
    }

    if (canComparisonOperatorCall(lhs, rhs)) {
        return resolvedBuiltinBool.cloneWithEvaluatedRvalue(
            evaluateComparisonOp(callerOperator.text, lhs.evaluatedRvalue, rhs.evaluatedRvalue)
        );
    }

    const alias = compOpAliases.get(callerOperator.text);
    assert(alias !== undefined);

    return checkOverloadedOperatorCall({
        callerOperator,
        alias,
        lhs,
        lhsRange,
        rhs,
        rhsRange
    });
}

function canReferenceComparison(lhs: ResolvedType, rhs: ResolvedType): boolean {
    const lhsIsReference = lhs.handle !== undefined || lhs.isNullType();
    const rhsIsReference = rhs.handle !== undefined || rhs.isNullType();
    if (lhsIsReference === false || rhsIsReference === false) {
        return false;
    }

    return checkTypeCast(lhs, rhs) || checkTypeCast(rhs, lhs);
}

function evaluateComparisonOp(
    op: string,
    lhs: EvaluatedValue | undefined,
    rhs: EvaluatedValue | undefined
): boolean | undefined {
    if (lhs === undefined || rhs === undefined) {
        return undefined;
    }

    switch (op) {
        case '==':
            return lhs === rhs;
        case '!=':
            return lhs !== rhs;
        case '<':
            return typeof lhs === 'number' && typeof rhs === 'number' ? lhs < rhs : undefined;
        case '<=':
            return typeof lhs === 'number' && typeof rhs === 'number' ? lhs <= rhs : undefined;
        case '>':
            return typeof lhs === 'number' && typeof rhs === 'number' ? lhs > rhs : undefined;
        case '>=':
            return typeof lhs === 'number' && typeof rhs === 'number' ? lhs >= rhs : undefined;
        default:
            return undefined;
    }
}

const compOpAliases = new Map<string, string>([
    ['==', 'opEquals'],
    ['!=', 'opEquals'],
    ['<', 'opCmp'],
    ['<=', 'opCmp'],
    ['>', 'opCmp'],
    ['>=', 'opCmp'],
    ['is', 'opEquals'],
    ['!is', 'opEquals']
]);

// **BNF** LOGICOP ::= '&&' | '||' | '^^' | 'and' | 'or' | 'xor'
function analyzeLogicOp(
    scope: SymbolScope,
    operator: TokenObject,
    lhs: ResolvedType,
    rhs: ResolvedType,
    leftRange: TokenRange,
    rightRange: TokenRange
): ResolvedType | undefined {
    assertTypeCast(lhs, resolvedBuiltinBool, leftRange);
    assertTypeCast(rhs, resolvedBuiltinBool, rightRange);

    return resolvedBuiltinBool.cloneWithEvaluatedRvalue(
        evaluateLogicOp(operator.text, lhs.evaluatedRvalue, rhs.evaluatedRvalue)
    );
}

function evaluateLogicOp(
    op: string,
    lhs: EvaluatedValue | undefined,
    rhs: EvaluatedValue | undefined
): boolean | undefined {
    if (typeof lhs !== 'boolean' || typeof rhs !== 'boolean') {
        return undefined;
    }

    switch (op) {
        case '&&':
        case 'and':
            return lhs && rhs;
        case '||':
        case 'or':
            return lhs || rhs;
        case '^^':
        case 'xor':
            return lhs !== rhs;
        default:
            return undefined;
    }
}

// **BNF** ASSIGNOP ::= '=' | '+=' | '-=' | '*=' | '/=' | '|=' | '&=' | '^=' | '%=' | '**=' | '<<=' | '>>=' | '>>>='
function analyzeAssignOp(
    scope: SymbolScope,
    callerOperator: TokenObject,
    lhs: ResolvedType | undefined,
    rhs: ResolvedType | undefined,
    lhsRange: TokenRange,
    rhsRange: TokenRange
): ResolvedType | undefined {
    if (lhs === undefined || rhs === undefined) {
        return undefined;
    }

    if (isReadOnlyAssignmentTarget(lhs)) {
        analyzerDiagnostic.error(lhsRange.getBoundingLocation(), `Cannot assign to a read-only expression.`);
        return undefined;
    }

    if (callerOperator.text === '=') {
        if (lhs.handle !== undefined && !lhs.isExplicitHandleAccess && rhs.isNullType()) {
            analyzerDiagnostic.error(
                rhsRange.getBoundingLocation(),
                `Use '@' to assign null to the object handle itself.`
            );
            return undefined;
        }

        if (checkTypeCast(rhs, lhs)) {
            return lhs;
        }
    }

    const numberOperatorCall = evaluateNumberOperatorCall(lhs, rhs);
    if (numberOperatorCall) {
        return numberOperatorCall;
    }

    const alias = assignOpAliases.get(callerOperator.text);
    assert(alias !== undefined);

    return checkOverloadedOperatorCall({
        callerOperator,
        alias,
        lhs,
        lhsRange,
        rhs,
        rhsRange
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
    ['>>>=', 'opUShrAssign']
]);

function isReadOnlyAssignmentTarget(type: ResolvedType): boolean {
    if (type.handle === HandleModifier.ConstHandle) {
        return true;
    }

    if (type.isExplicitHandleAccess) {
        return false;
    }

    return type.isConst === true;
}

export interface HoistResult {
    readonly globalScope: SymbolGlobalScope;
    readonly analyzeQueue: AnalyzeQueue;
}

/**
 * Entry point of the analyzer.
 * Type checks and function checks are performed here.
 */
export function analyzeAfterHoist(path: string, hoistResult: HoistResult): AnalyzerScope {
    const {globalScope, analyzeQueue} = hoistResult;

    // Analyze the contents of the scope to be processed.
    while (analyzeQueue.length > 0) {
        const next = analyzeQueue.shift();
        if (next !== undefined) {
            next();
        }
    }

    return new AnalyzerScope(path, globalScope);
}

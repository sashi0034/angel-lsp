// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_expressions.html

import {
    AccessModifier,
    funcHeadDestructor,
    getIdentifierInType,
    getLocationBetween,
    getNextTokenIfExist,
    getNodeLocation,
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
    NodeExprPostOp2,
    NodeExprStat,
    NodeExprTerm,
    NodeExprTerm2,
    NodeExprValue,
    NodeFor,
    NodeFunc,
    NodeFuncCall,
    NodeFuncDef,
    NodeIf,
    NodeInitList,
    NodeInterface,
    NodeIntfMethod,
    NodeLambda,
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
    NodeTypeDef,
    NodeVar,
    NodeVarAccess,
    NodeVirtualProp,
    NodeWhile,
    ParsedEnumMember,
    ParsedRange
} from "./nodes";
import {
    builtinBoolType,
    builtinDoubleType,
    builtinFloatType,
    builtinIntType,
    builtinSetterValueToken,
    builtinStringType,
    builtinThisToken,
    ComplementKind,
    DeducedType,
    findSymbolShallowly,
    findSymbolWithParent,
    getSymbolAndScopeIfExist,
    hintsCompletionScope,
    insertSymbolicObject,
    isDeducedAutoType,
    isSourceNodeClassOrInterface,
    isSourcePrimitiveType,
    PrimitiveType,
    stringifyDeducedType,
    stringifyDeducedTypes,
    SymbolicFunction,
    SymbolicType,
    SymbolicVariable,
    SymbolKind,
    SymbolScope,
    TemplateTranslation,
    tryGetBuiltInType,
    tryInsertSymbolicObject
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
    findScopeWithParentByNodes,
    isSymbolConstructorInScope
} from "./scope";
import {checkFunctionMatch} from "./checkFunction";
import {ParsingToken} from "./parsingToken";
import {isAllowedToAccessMember, checkTypeMatch, isTypeMatch} from "./checkType";
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
        } else if (nodeName === NodeName.TypeDef) {
            hoistTypeDef(parentScope, statement);
        } else if (nodeName === NodeName.Class) {
            hoistClass(parentScope, statement, analyzing, hoisting);
        } else if (nodeName === NodeName.Mixin) {
            hoistMixin(parentScope, statement, analyzing, hoisting);
        } else if (nodeName === NodeName.Interface) {
            hoistInterface(parentScope, statement, analyzing, hoisting);
        } else if (nodeName === NodeName.FuncDef) {
            hoistFuncDef(parentScope, statement, analyzing, hoisting);
        } else if (nodeName === NodeName.VirtualProp) {
            hoistVirtualProp(parentScope, statement, analyzing, hoisting, false);
        } else if (nodeName === NodeName.Var) {
            hoistVar(parentScope, statement, analyzing, false);
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

    hintsCompletionScope(parentScope, scopeIterator, nodeNamespace.nodeRange);
}

// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
function hoistEnum(parentScope: SymbolScope, nodeEnum: NodeEnum) {
    const symbol: SymbolicType = {
        symbolKind: SymbolKind.Type,
        declaredPlace: nodeEnum.identifier,
        declaredScope: parentScope,
        sourceType: nodeEnum,
        membersScope: undefined,
    };

    if (insertSymbolicObject(parentScope.symbolMap, symbol) === false) return;

    const scope = findScopeShallowlyOrInsert(nodeEnum, parentScope, nodeEnum.identifier);
    symbol.membersScope = scope;

    hoistEnumMembers(scope, nodeEnum.memberList, {symbolType: symbol, sourceScope: scope});
}

function hoistEnumMembers(parentScope: SymbolScope, memberList: ParsedEnumMember[], type: DeducedType) {
    for (const member of memberList) {
        const symbol: SymbolicVariable = {
            symbolKind: SymbolKind.Variable,
            declaredPlace: member.identifier,
            declaredScope: parentScope,
            type: type,
            isInstanceMember: false,
            accessRestriction: undefined,
        };
        insertSymbolicObject(parentScope.symbolMap, symbol);
    }
}

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
function hoistClass(parentScope: SymbolScope, nodeClass: NodeClass, analyzing: AnalyzingQueue, hoisting: HoistingQueue) {
    const symbol: SymbolicType = {
        symbolKind: SymbolKind.Type,
        declaredPlace: nodeClass.identifier,
        declaredScope: parentScope,
        sourceType: nodeClass,
        membersScope: undefined,
    };
    if (insertSymbolicObject(parentScope.symbolMap, symbol) === false) return;

    const scope: SymbolScope = findScopeShallowlyOrInsert(nodeClass, parentScope, nodeClass.identifier);
    symbol.membersScope = scope;

    const thisVariable: SymbolicVariable = {
        symbolKind: SymbolKind.Variable,
        declaredPlace: builtinThisToken,
        declaredScope: parentScope,
        type: {symbolType: symbol, sourceScope: scope},
        isInstanceMember: false,
        accessRestriction: AccessModifier.Private,
    };
    insertSymbolicObject(scope.symbolMap, thisVariable);

    const templateTypes = hoistClassTemplateTypes(scope, nodeClass.typeTemplates);
    if (templateTypes.length > 0) symbol.templateTypes = templateTypes;

    const baseList = hoistBaseList(scope, nodeClass);
    if (baseList !== undefined) symbol.baseList = baseList;

    hoisting.push(() => {
        hoistClassMembers(scope, nodeClass, analyzing, hoisting);
        if (baseList !== undefined) copyBaseMembers(scope, baseList);
    });

    hintsCompletionScope(parentScope, scope, nodeClass.nodeRange);
}

function hoistClassTemplateTypes(scope: SymbolScope, types: NodeType[] | undefined) {
    const templateTypes: ParsingToken[] = [];
    for (const type of types ?? []) {
        insertSymbolicObject(scope.symbolMap, {
            symbolKind: SymbolKind.Type,
            declaredPlace: getIdentifierInType(type),
            declaredScope: scope,
            sourceType: PrimitiveType.Template,
            membersScope: undefined,
        } satisfies SymbolicType);

        templateTypes.push(getIdentifierInType(type));
    }
    return templateTypes;
}

function hoistBaseList(scope: SymbolScope, nodeClass: NodeClass | NodeInterface): (DeducedType | undefined)[] | undefined {
    if (nodeClass.baseList.length === 0) return undefined;

    const baseList: (DeducedType | undefined)[] = [];
    for (const baseIdentifier of nodeClass.baseList) {
        const baseType = findSymbolWithParent(scope, baseIdentifier.text);

        if (baseType === undefined) {
            diagnostic.addError(baseIdentifier.location, `'${baseIdentifier.text}' is not defined type`);
            baseList.push(undefined);
        } else if (baseType.symbol.symbolKind !== SymbolKind.Type) {
            diagnostic.addError(baseIdentifier.location, `'${baseIdentifier.text}' is not class or interface`);
            baseList.push(undefined);
        } else {
            // 継承元を発見
            baseList.push({symbolType: baseType.symbol, sourceScope: baseType.scope});

            scope.referencedList.push({
                declaredSymbol: baseType.symbol,
                referencedToken: baseIdentifier
            });
        }
    }
    return baseList;
}

function copyBaseMembers(scope: SymbolScope, baseList: (DeducedType | undefined)[]) {
    for (const baseType of baseList) {
        if (baseType === undefined) continue;
        if (baseType.symbolType.symbolKind === SymbolKind.Function) continue;

        const baseScope = baseType.symbolType.membersScope;
        if (baseScope === undefined) continue;

        for (const [key, symbol] of baseScope.symbolMap) {
            if (key === 'this') continue;
            const errored = tryInsertSymbolicObject(scope.symbolMap, symbol);
            if (errored !== undefined) {
                diagnostic.addError(errored.declaredPlace.location, `Duplicated symbol '${key}'`);
            }
        }
    }
}

// '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'
function hoistClassMembers(scope: SymbolScope, nodeClass: NodeClass, analyzing: AnalyzingQueue, hoisting: HoistingQueue) {
    for (const member of nodeClass.memberList) {
        if (member.nodeName === NodeName.VirtualProp) {
            hoistVirtualProp(scope, member, analyzing, hoisting, true);
        } else if (member.nodeName === NodeName.Func) {
            hoistFunc(scope, member, analyzing, hoisting, true);
        } else if (member.nodeName === NodeName.Var) {
            hoistVar(scope, member, analyzing, true);
        } else if (member.nodeName === NodeName.FuncDef) {
            hoistFuncDef(scope, member, analyzing, hoisting);
        }
    }
}

// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'
function hoistTypeDef(parentScope: SymbolScope, typeDef: NodeTypeDef) {
    const builtInType = tryGetBuiltInType(typeDef.type);
    if (builtInType === undefined) return;

    const symbol: SymbolicType = {
        symbolKind: SymbolKind.Type,
        declaredPlace: typeDef.identifier,
        declaredScope: parentScope,
        sourceType: builtInType.sourceType,
        membersScope: undefined,
    };
    insertSymbolicObject(parentScope.symbolMap, symbol);
}

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
function hoistFunc(
    parentScope: SymbolScope, nodeFunc: NodeFunc, analyzing: AnalyzingQueue, hoisting: HoistingQueue, isInstanceMember: boolean
) {
    if (nodeFunc.head === funcHeadDestructor) return;

    const symbol: SymbolicFunction = {
        symbolKind: SymbolKind.Function,
        declaredPlace: nodeFunc.identifier,
        declaredScope: parentScope,
        returnType: isFunctionHeadReturns(nodeFunc.head) ? analyzeType(parentScope, nodeFunc.head.returnType) : undefined,
        parameterTypes: [],
        sourceNode: nodeFunc,
        nextOverload: undefined,
        isInstanceMember: isInstanceMember,
        accessRestriction: nodeFunc.accessor
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
function hoistInterface(parentScope: SymbolScope, nodeInterface: NodeInterface, analyzing: AnalyzingQueue, hoisting: HoistingQueue) {
    const symbol: SymbolicType = {
        symbolKind: SymbolKind.Type,
        declaredPlace: nodeInterface.identifier,
        declaredScope: parentScope,
        sourceType: nodeInterface,
        membersScope: undefined,
    };
    if (insertSymbolicObject(parentScope.symbolMap, symbol) === false) return;

    const scope: SymbolScope = findScopeShallowlyOrInsert(nodeInterface, parentScope, nodeInterface.identifier);
    symbol.membersScope = scope;

    const baseList = hoistBaseList(scope, nodeInterface);
    if (baseList !== undefined) symbol.baseList = baseList;

    hoisting.push(() => {
        hoistInterfaceMembers(scope, nodeInterface, analyzing, hoisting);
        if (baseList !== undefined) copyBaseMembers(scope, baseList);
    });

    hintsCompletionScope(parentScope, scope, nodeInterface.nodeRange);
}

function hoistInterfaceMembers(scope: SymbolScope, nodeInterface: NodeInterface, analyzing: AnalyzingQueue, hoisting: HoistingQueue) {
    for (const member of nodeInterface.memberList) {
        if (member.nodeName === NodeName.VirtualProp) {
            hoistVirtualProp(scope, member, analyzing, hoisting, true);
        } else if (member.nodeName === NodeName.IntfMethod) {
            hoistIntfMethod(scope, member);
        }
    }
}

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
function hoistVar(scope: SymbolScope, nodeVar: NodeVar, analyzing: AnalyzingQueue, isInstanceMember: boolean) {
    const varType = analyzeType(scope, nodeVar.type);

    analyzing.push(() => {
        for (const declaredVar of nodeVar.variables) {
            const initializer = declaredVar.initializer;
            if (initializer === undefined) continue;
            analyzeVarInitializer(scope, varType, declaredVar.identifier, initializer);
        }
    });

    insertVariables(scope, varType, nodeVar, isInstanceMember);
}

function analyzeVar(scope: SymbolScope, nodeVar: NodeVar, isInstanceMember: boolean) {
    let varType = analyzeType(scope, nodeVar.type);

    for (const declaredVar of nodeVar.variables) {
        const initializer = declaredVar.initializer;
        if (initializer === undefined) continue;

        const initType = analyzeVarInitializer(scope, varType, declaredVar.identifier, initializer);

        // 自動推論の解決
        if (initType !== undefined && isDeducedAutoType(varType)) {
            varType = initType;
        }
    }

    insertVariables(scope, varType, nodeVar, isInstanceMember);
}

function analyzeVarInitializer(
    scope: SymbolScope,
    varType: DeducedType | undefined,
    varIdentifier: ParsingToken,
    initializer: NodeInitList | NodeAssign | NodeArgList
): DeducedType | undefined {
    if (initializer.nodeName === NodeName.InitList) {
        return analyzeInitList(scope, initializer);
    } else if (initializer.nodeName === NodeName.Assign) {
        const exprType = analyzeAssign(scope, initializer);
        checkTypeMatch(exprType, varType, initializer.nodeRange);
        return exprType;
    } else if (initializer.nodeName === NodeName.ArgList) {
        if (varType === undefined || varType.symbolType.symbolKind === SymbolKind.Function) return undefined;
        return analyzeConstructorCaller(scope, varIdentifier, initializer, varType);
    }
}

function insertVariables(scope: SymbolScope, varType: DeducedType | undefined, nodeVar: NodeVar, isInstanceMember: boolean) {
    for (const declaredVar of nodeVar.variables) {
        const variable: SymbolicVariable = {
            symbolKind: SymbolKind.Variable,
            declaredPlace: declaredVar.identifier,
            declaredScope: scope,
            type: varType,
            isInstanceMember: isInstanceMember,
            accessRestriction: nodeVar.accessor,
        };
        insertSymbolicObject(scope.symbolMap, variable);
    }
}

// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'

// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
function hoistFuncDef(parentScope: SymbolScope, funcDef: NodeFuncDef, analyzing: AnalyzingQueue, hoisting: HoistingQueue) {
    const symbol: SymbolicFunction = {
        symbolKind: SymbolKind.Function,
        declaredPlace: funcDef.identifier,
        declaredScope: parentScope,
        returnType: analyzeType(parentScope, funcDef.returnType),
        parameterTypes: [],
        sourceNode: funcDef,
        nextOverload: undefined,
        isInstanceMember: false,
        accessRestriction: undefined,
    };
    if (insertSymbolicObject(parentScope.symbolMap, symbol) === false) return;

    hoisting.push(() => {
        symbol.parameterTypes = funcDef.paramList.map(param => analyzeType(parentScope, param.type));
    });
}

// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
function hoistVirtualProp(
    parentScope: SymbolScope, virtualProp: NodeVirtualProp, analyzing: AnalyzingQueue, hoisting: HoistingQueue, isInstanceMember: boolean
) {
    const type = analyzeType(parentScope, virtualProp.type);

    const identifier = virtualProp.identifier;
    const symbol: SymbolicVariable = {
        symbolKind: SymbolKind.Variable,
        declaredPlace: identifier,
        declaredScope: parentScope,
        type: type,
        isInstanceMember: isInstanceMember,
        accessRestriction: virtualProp.accessor,
    };
    insertSymbolicObject(parentScope.symbolMap, symbol);

    const getter = virtualProp.getter;
    if (getter !== undefined && getter.statBlock !== undefined) {
        const getterScope = createSymbolScopeAndInsert(virtualProp, parentScope, `get_${identifier.text}`);

        const statBlock = getter.statBlock;
        analyzing.push(() => {
            analyzeStatBlock(getterScope, statBlock);
        });
    }

    const setter = virtualProp.setter;
    if (setter !== undefined && setter.statBlock !== undefined) {
        const setterScope = createSymbolScopeAndInsert(virtualProp, parentScope, `set_${identifier.text}`);

        if (type !== undefined) {
            const valueVariable: SymbolicVariable = {
                symbolKind: SymbolKind.Variable,
                declaredPlace: builtinSetterValueToken,
                declaredScope: parentScope,
                type: {symbolType: type.symbolType, sourceScope: setterScope},
                isInstanceMember: false,
                accessRestriction: virtualProp.accessor,
            };
            insertSymbolicObject(setterScope.symbolMap, valueVariable);
        }

        const statBlock = setter.statBlock;
        analyzing.push(() => {
            analyzeStatBlock(setterScope, statBlock);
        });
    }
}

// MIXIN         ::= 'mixin' CLASS
function hoistMixin(parentScope: SymbolScope, mixin: NodeMixin, analyzing: AnalyzingQueue, hoisting: HoistingQueue) {
    hoistClass(parentScope, mixin.mixinClass, analyzing, hoisting);
}

// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'
function hoistIntfMethod(parentScope: SymbolScope, intfMethod: NodeIntfMethod) {
    const symbol: SymbolicFunction = {
        symbolKind: SymbolKind.Function,
        declaredPlace: intfMethod.identifier,
        declaredScope: parentScope,
        returnType: analyzeType(parentScope, intfMethod.returnType),
        parameterTypes: [],
        sourceNode: intfMethod,
        nextOverload: undefined,
        isInstanceMember: true,
        accessRestriction: undefined,
    };
    if (insertSymbolicObject(parentScope.symbolMap, symbol) === false) return;
}

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
function analyzeStatBlock(scope: SymbolScope, statBlock: NodeStatBlock) {
    // スコープ内の補完情報を追加
    hintsCompletionScope(scope.parentScope, scope, statBlock.nodeRange);

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
            declaredScope: scope,
            type: type,
            isInstanceMember: false,
            accessRestriction: undefined,
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

    let symbolAndScope = findSymbolWithParent(searchScope, typeIdentifier.text);
    if (symbolAndScope !== undefined
        && isSymbolConstructorInScope(symbolAndScope.symbol, symbolAndScope.scope)
        && symbolAndScope.scope.parentScope !== undefined
    ) {
        // 親の階層を辿っていくと、クラス型よりも先にコンストラクタがヒットする時があるので、その場合は更に上の階層から検索
        symbolAndScope = getSymbolAndScopeIfExist(
            findSymbolShallowly(symbolAndScope.scope.parentScope, typeIdentifier.text), symbolAndScope.scope.parentScope);
    }
    if (symbolAndScope === undefined) {
        diagnostic.addError(typeIdentifier.location, `'${typeIdentifier.text}' is not defined 💢`);
        return undefined;
    }

    const {symbol: foundSymbol, scope: foundScope} = symbolAndScope;
    if (foundSymbol.symbolKind === SymbolKind.Function && foundSymbol.sourceNode.nodeName === NodeName.FuncDef) {
        return completeAnalyzingType(scope, typeIdentifier, foundSymbol, foundScope, true);
    } else if (foundSymbol.symbolKind !== SymbolKind.Type) {
        diagnostic.addError(typeIdentifier.location, `'${typeIdentifier.text}' is not a type 💢`);
        return undefined;
    } else {
        const typeTemplates = analyzeTemplateTypes(scope, nodeType.typeTemplates, foundSymbol.templateTypes);
        return completeAnalyzingType(scope, typeIdentifier, foundSymbol, foundScope, undefined, typeTemplates);
    }
}

function completeAnalyzingType(
    scope: SymbolScope,
    identifier: ParsingToken,
    foundSymbol: SymbolicType | SymbolicFunction,
    foundScope: SymbolScope,
    isHandler?: boolean,
    typeTemplates?: TemplateTranslation | undefined,
): DeducedType | undefined {
    scope.referencedList.push({
        declaredSymbol: foundSymbol,
        referencedToken: identifier
    });

    return {
        symbolType: foundSymbol,
        sourceScope: foundScope,
        isHandler: isHandler,
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
    if (foundBuiltin !== undefined) return {symbolType: foundBuiltin, sourceScope: undefined};

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
            if (found?.ownerNode?.nodeName === NodeName.Func) found = undefined;
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
    for (const c of ast.caseList) {
        analyzeCase(scope, c);
    }
}

// BREAK         ::= 'break' ';'

// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
function analyzeFor(scope: SymbolScope, nodeFor: NodeFor) {
    if (nodeFor.initial.nodeName === NodeName.Var) analyzeVar(scope, nodeFor.initial, false);
    else analyzeEexprStat(scope, nodeFor.initial);

    if (nodeFor.condition !== undefined) analyzeEexprStat(scope, nodeFor.condition);

    for (const inc of nodeFor.incrementList) {
        analyzeAssign(scope, inc);
    }

    if (nodeFor.statement !== undefined) analyzeStatement(scope, nodeFor.statement);
}

// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
function analyzeWhile(scope: SymbolScope, nodeWhile: NodeWhile) {
    const assignType = analyzeAssign(scope, nodeWhile.assign);
    checkTypeMatch(assignType, {symbolType: builtinBoolType, sourceScope: undefined}, nodeWhile.assign.nodeRange);

    if (nodeWhile.statement !== undefined) analyzeStatement(scope, nodeWhile.statement);
}

// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
function analyzeDoWhile(scope: SymbolScope, doWhile: NodeDoWhile) {
    analyzeStatement(scope, doWhile.statement);

    if (doWhile.assign === undefined) return;
    const assignType = analyzeAssign(scope, doWhile.assign);
    checkTypeMatch(assignType, {symbolType: builtinBoolType, sourceScope: undefined}, doWhile.assign.nodeRange);
}

// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
function analyzeIf(scope: SymbolScope, nodeIf: NodeIf) {
    const conditionType = analyzeAssign(scope, nodeIf.condition);
    checkTypeMatch(conditionType, {symbolType: builtinBoolType, sourceScope: undefined}, nodeIf.condition.nodeRange);

    if (nodeIf.thenStat !== undefined) analyzeStatement(scope, nodeIf.thenStat);
    if (nodeIf.elseStat !== undefined) analyzeStatement(scope, nodeIf.elseStat);
}

// CONTINUE      ::= 'continue' ';'

// EXPRSTAT      ::= [ASSIGN] ';'
function analyzeEexprStat(scope: SymbolScope, exprStat: NodeExprStat) {
    if (exprStat.assign === undefined) return;
    const assign = analyzeAssign(scope, exprStat.assign);
    if (assign?.isHandler !== true && assign?.symbolType.symbolKind === SymbolKind.Function) {
        diagnostic.addError(getNodeLocation(exprStat.assign.nodeRange), `Function call without handler 💢`);
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

    const functionScope = findScopeWithParentByNodes(scope, [NodeName.Func, NodeName.VirtualProp, NodeName.Lambda]);
    if (functionScope === undefined || functionScope.ownerNode === undefined) return;

    // TODO: ラムダ式に対応

    if (functionScope.ownerNode.nodeName === NodeName.Func) {
        const functionReturn = functionScope.parentScope?.symbolMap.get(functionScope.key);
        if (functionReturn === undefined || functionReturn.symbolKind !== SymbolKind.Function) return;

        const expectedReturn = functionReturn.returnType?.symbolType;
        if (expectedReturn?.symbolKind === SymbolKind.Type && expectedReturn?.sourceType === PrimitiveType.Void) {
            if (nodeReturn.assign === undefined) return;
            diagnostic.addError(getNodeLocation(nodeReturn.nodeRange), `Function does not return a value 💢`);
        } else {
            checkTypeMatch(returnType, functionReturn.returnType, nodeReturn.nodeRange);
        }
    } else if (functionScope.ownerNode.nodeName === NodeName.VirtualProp) {
        const key = functionScope.key;
        const isGetter = key.startsWith('get_');
        if (isGetter === false) {
            if (nodeReturn.assign === undefined) return;
            diagnostic.addError(getNodeLocation(nodeReturn.nodeRange), `Property setter does not return a value 💢`);
            return;
        }

        const varName = key.substring(4, key.length);
        const functionReturn = functionScope.parentScope?.symbolMap.get(varName);
        if (functionReturn === undefined || functionReturn.symbolKind !== SymbolKind.Variable) return;

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
function analyzeExpr(scope: SymbolScope, expr: NodeExpr): DeducedType | undefined {
    // Evaluate by Shunting Yard Algorithm
    // https://qiita.com/phenan/items/df157fef2fea590e3fa9

    type Term = [DeducedType | undefined, ParsedRange];
    type Op = ParsingToken;

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
                scope, item, lhs[0], rhs[0], lhs[1], rhs[1]), {start: lhs[1].start, end: rhs[1].end}]);
        } else {
            outputTerm.push(item);
        }
    }

    return outputTerm.length > 0 ? outputTerm[0][0] : undefined;
}

function getOperatorPrecedence(operator: ParsingToken): number {
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
        exprValue = analyzeExprPostOp(scope, postOp, exprValue, exprTerm.nodeRange);
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
        return analyzeLambda(scope, exprValue);
    default:
        break;
    }
    return undefined;
}

// CONSTRUCTCALL ::= TYPE ARGLIST
function analyzeConstructorCaller(
    scope: SymbolScope,
    callerIdentifier: ParsingToken,
    callerArgList: NodeArgList,
    constructorType: DeducedType
): DeducedType | undefined {
    const constructorIdentifier = constructorType.symbolType.declaredPlace.text;
    if (constructorType.sourceScope === undefined) return undefined;

    const classScope = findScopeShallowly(constructorType.sourceScope, constructorIdentifier);
    const constructor = classScope !== undefined ? findSymbolShallowly(classScope, constructorIdentifier) : undefined;
    if (constructor === undefined || constructor.symbolKind !== SymbolKind.Function) {
        if (callerArgList.argList.length === 0) {
            // デフォルトコンストラクタ
            scope.referencedList.push({declaredSymbol: constructorType.symbolType, referencedToken: callerIdentifier});
            return constructorType;
        }

        diagnostic.addError(callerIdentifier.location, `Constructor '${constructorIdentifier}' is missing 💢`);
        return undefined;
    }

    analyzeFunctionCaller(scope, callerIdentifier, callerArgList, constructor, constructorType.templateTranslate);
    return constructorType;
}

// EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']') | ARGLIST | '++' | '--'
function analyzeExprPostOp(scope: SymbolScope, exprPostOp: NodeExprPostOp, exprValue: DeducedType, exprRange: ParsedRange) {
    if (exprPostOp.postOp === 1) {
        return analyzeExprPostOp1(scope, exprPostOp, exprValue);
    } else if (exprPostOp.postOp === 2) {
        return analyzeExprPostOp2(scope, exprPostOp, exprValue, exprRange);
    }
}

// ('.' (FUNCCALL | IDENTIFIER))
function analyzeExprPostOp1(scope: SymbolScope, exprPostOp: NodeExprPostOp1, exprValue: DeducedType) {
    if (exprValue.symbolType.symbolKind !== SymbolKind.Type) {
        diagnostic.addError(getNodeLocation(exprPostOp.nodeRange), `Invalid access to type 💢`);
        return undefined;
    }

    const complementRange = getLocationBetween(exprPostOp.nodeRange.start, getNextTokenIfExist(exprPostOp.nodeRange.start));

    // Complement class members.
    scope.completionHints.push({
        complementKind: ComplementKind.Type,
        complementLocation: complementRange,
        targetType: exprValue.symbolType
    });

    const member = exprPostOp.member;
    const isMemberMethod = isMemberMethodInPostOp(member);

    const identifier = isMemberMethod ? member.identifier : member;
    if (identifier === undefined) return undefined;

    if (isSourceNodeClassOrInterface(exprValue.symbolType.sourceType) === false) {
        diagnostic.addError(identifier.location, `'${identifier.text}' is not a member 💢`);
        return undefined;
    }

    const classScope = exprValue.symbolType.membersScope;
    if (classScope === undefined) return undefined;

    if (isMemberMethod) {
        // Analyze method call.
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
        // Analyze field access.
        return analyzeVariableAccess(scope, classScope, identifier);
    }
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
function analyzeExprPostOp2(scope: SymbolScope, exprPostOp: NodeExprPostOp2, exprValue: DeducedType, exprRange: ParsedRange) {
    const args = exprPostOp.indexerList.map(indexer => analyzeAssign(scope, indexer.assign));
    return analyzeOperatorAlias(scope, exprPostOp.nodeRange.end, exprValue, args, exprRange, exprPostOp.nodeRange, 'opIndex');
}

// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
function analyzeCast(scope: SymbolScope, cast: NodeCast): DeducedType | undefined {
    const castedType = analyzeType(scope, cast.type);
    analyzeAssign(scope, cast.assign);
    return castedType;
}

// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
function analyzeLambda(scope: SymbolScope, lambda: NodeLambda): DeducedType | undefined {
    const childScope = createSymbolScopeAndInsert(lambda, scope, createAnonymousIdentifier());

    // 引数をスコープに追加
    for (const param of lambda.paramList) {
        if (param.identifier === undefined) continue;

        const argument: SymbolicVariable = {
            symbolKind: SymbolKind.Variable,
            declaredPlace: param.identifier,
            declaredScope: scope,
            type: param.type !== undefined ? analyzeType(scope, param.type) : undefined,
            isInstanceMember: false,
            accessRestriction: undefined,
        };
        insertSymbolicObject(childScope.symbolMap, argument);
    }

    if (lambda.statBlock !== undefined) analyzeStatBlock(childScope, lambda.statBlock);

    // TODO: 左辺からラムダ式の型を推定したい

    return undefined;
}

// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
function analyzeLiteral(scope: SymbolScope, literal: NodeLiteral): DeducedType | undefined {
    const literalValue = literal.value;
    if (literalValue.kind === TokenKind.Number) {
        switch (literalValue.numeric) {
        case NumberLiterals.Integer:
            return {symbolType: builtinIntType, sourceScope: undefined};
        case NumberLiterals.Float:
            return {symbolType: builtinFloatType, sourceScope: undefined};
        case NumberLiterals.Double:
            return {symbolType: builtinDoubleType, sourceScope: undefined};
        }
    }

    if (literalValue.kind === TokenKind.String) {
        return {symbolType: builtinStringType, sourceScope: undefined};
    }

    if (literalValue.text === 'true' || literalValue.text === 'false') {
        return {symbolType: builtinBoolType, sourceScope: undefined};
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

    const calleeFunc = findSymbolWithParent(searchScope, funcCall.identifier.text);
    if (calleeFunc?.symbol === undefined) {
        diagnostic.addError(funcCall.identifier.location, `'${funcCall.identifier.text}' is not defined 💢`);
        return undefined;
    }

    const [calleeSymbol, calleeScope] = [calleeFunc.symbol, calleeFunc.scope];

    if (calleeSymbol.symbolKind === SymbolKind.Type) {
        const constructorType: DeducedType = {symbolType: calleeSymbol, sourceScope: calleeScope};
        return analyzeConstructorCaller(scope, funcCall.identifier, funcCall.argList, constructorType);
    }

    if (calleeSymbol.symbolKind === SymbolKind.Variable && calleeSymbol.type?.symbolType.symbolKind === SymbolKind.Function) {
        return analyzeFunctionCaller(scope, funcCall.identifier, funcCall.argList, calleeSymbol.type.symbolType, undefined);
    }

    if (calleeSymbol.symbolKind === SymbolKind.Variable) {
        return analyzeOpCallCaller(scope, funcCall, calleeSymbol);
    }

    if (calleeSymbol.symbolKind !== SymbolKind.Function) {
        diagnostic.addError(funcCall.identifier.location, `'${funcCall.identifier.text}' is not a function 💢`);
        return undefined;
    }

    return analyzeFunctionCaller(scope, funcCall.identifier, funcCall.argList, calleeSymbol, undefined);
}

function analyzeOpCallCaller(scope: SymbolScope, funcCall: NodeFuncCall, calleeVariable: SymbolicVariable) {
    const varType = calleeVariable.type;
    if (varType === undefined || varType.sourceScope === undefined) {
        diagnostic.addError(funcCall.identifier.location, `'${funcCall.identifier.text}' is not callable 💢`);
        return;
    }

    const classScope = findScopeShallowly(varType.sourceScope, varType.symbolType.declaredPlace.text);
    if (classScope === undefined) return undefined;

    const opCall = findSymbolShallowly(classScope, 'opCall');
    if (opCall === undefined || opCall.symbolKind !== SymbolKind.Function) {
        diagnostic.addError(funcCall.identifier.location, `'opCall' is not defined in type '${varType.symbolType.declaredPlace.text}' 💢`);
        return;
    }

    return analyzeFunctionCaller(scope, funcCall.identifier, funcCall.argList, opCall, varType.templateTranslate);
}

function analyzeFunctionCaller(
    scope: SymbolScope,
    callerIdentifier: ParsingToken,
    callerArgList: NodeArgList,
    calleeFunc: SymbolicFunction,
    templateTranslate: TemplateTranslation | undefined
) {
    const callerArgTypes = analyzeArgList(scope, callerArgList);

    if (calleeFunc.sourceNode.nodeName === NodeName.FuncDef) {
        // デリゲートの場合は、その関数ハンドラとしてそのまま返却
        const handlerType = {symbolType: calleeFunc, sourceScope: undefined};
        if (callerArgTypes.length === 1 && isTypeMatch(callerArgTypes[0], handlerType)) {
            return callerArgTypes[0];
        }
    }

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
    checkingScope: SymbolScope, accessedScope: SymbolScope, varIdentifier: ParsingToken
): DeducedType | undefined {
    const declared = findSymbolWithParent(accessedScope, varIdentifier.text);
    if (declared === undefined) {
        diagnostic.addError(varIdentifier.location, `'${varIdentifier.text}' is not defined 💢`);
        return undefined;
    }

    if (declared.symbol.symbolKind === SymbolKind.Type) {
        diagnostic.addError(varIdentifier.location, `'${varIdentifier.text}' is type 💢`);
        return undefined;
    }

    if (isAllowedToAccessMember(checkingScope, declared.symbol) === false) {
        diagnostic.addError(varIdentifier.location, `'${varIdentifier.text}' is not public member 💢`);
        return undefined;
    }

    if (declared.symbol.declaredPlace.location.path !== '') {
        // this といったキーワードは declaredPlace が空になっているので、そのような場合は参照リストに追加しない
        checkingScope.referencedList.push({
            declaredSymbol: declared.symbol,
            referencedToken: varIdentifier
        });
    }

    if (declared.symbol.symbolKind === SymbolKind.Variable) {
        return declared.symbol.type;
    } else {
        return {symbolType: declared.symbol, sourceScope: declared.scope};
    }
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

    checkTypeMatch(exprType, {symbolType: builtinBoolType, sourceScope: undefined}, condition.expr.nodeRange);

    const trueAssign = analyzeAssign(scope, condition.ternary.trueAssign);
    const falseAssign = analyzeAssign(scope, condition.ternary.falseAssign);

    if (trueAssign === undefined && falseAssign !== undefined) return falseAssign;
    if (trueAssign !== undefined && falseAssign === undefined) return trueAssign;
    if (trueAssign === undefined || falseAssign === undefined) return undefined;

    if (isTypeMatch(trueAssign, falseAssign)) return falseAssign;
    if (isTypeMatch(falseAssign, trueAssign)) return trueAssign;

    diagnostic.addError(getLocationBetween(condition.ternary.trueAssign.nodeRange.start, condition.ternary.falseAssign.nodeRange.end),
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
    lhs: DeducedType, rhs: DeducedType | (DeducedType | undefined)[],
    leftRange: ParsedRange, rightRange: ParsedRange,
    alias: string
) {
    const rhsArgs = Array.isArray(rhs) ? rhs : [rhs];

    if (lhs.symbolType.symbolKind !== SymbolKind.Type) {
        diagnostic.addError(operator.location, `Invalid operation '${alias}' between '${stringifyDeducedType(lhs)}' and '${stringifyDeducedTypes(rhsArgs)}' 💢`);
        return undefined;
    }

    if (isSourcePrimitiveType(lhs.symbolType.sourceType)) {
        diagnostic.addError(operator.location, `Operator '${alias}' of '${stringifyDeducedType(lhs)}' is not defined 💢`);
        return undefined;
    }

    if (lhs.sourceScope === undefined) return undefined;

    const classScope = lhs.symbolType.membersScope;
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
        callerArgTypes: rhsArgs,
        calleeFunc: aliasFunction,
        templateTranslators: [lhs.templateTranslate, ...rhsArgs.map(rhs => rhs?.templateTranslate)]
    });
}

// BITOP         ::= '&' | '|' | '^' | '<<' | '>>' | '>>>'
function analyzeBitOp(
    scope: SymbolScope, operator: ParsingToken,
    lhs: DeducedType, rhs: DeducedType,
    leftRange: ParsedRange, rightRange: ParsedRange
): DeducedType | undefined {
    if (lhs.symbolType.symbolKind === SymbolKind.Type && rhs.symbolType.symbolKind === SymbolKind.Type) {
        if (lhs.symbolType.sourceType === PrimitiveType.Number && rhs.symbolType.sourceType === PrimitiveType.Number) return lhs;
    }

    const alias = bitOpAliases.get(operator.text);
    assert(alias !== undefined);

    // 左辺がプリミティブ型なら、右辺の型のオペレータを仕様
    return lhs.symbolType.symbolKind === SymbolKind.Type && isSourcePrimitiveType(lhs.symbolType.sourceType)
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
    if (lhs.symbolType.symbolKind === SymbolKind.Type && rhs.symbolType.symbolKind === SymbolKind.Type) {
        if (lhs.symbolType.sourceType === PrimitiveType.Number && rhs.symbolType.sourceType === PrimitiveType.Number) return lhs;
    }

    const alias = mathOpAliases.get(operator.text);
    assert(alias !== undefined);

    // 左辺がプリミティブ型なら、右辺の型のオペレータを仕様
    return lhs.symbolType.symbolKind === SymbolKind.Type && isSourcePrimitiveType(lhs.symbolType.sourceType)
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
    if (lhs.symbolType.symbolKind === SymbolKind.Type && rhs.symbolType.symbolKind === SymbolKind.Type) {
        if (lhs.symbolType.sourceType === rhs.symbolType.sourceType) {
            return {symbolType: builtinBoolType, sourceScope: undefined};
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
    scope: SymbolScope, operator: ParsingToken,
    lhs: DeducedType, rhs: DeducedType,
    leftRange: ParsedRange, rightRange: ParsedRange
): DeducedType | undefined {
    checkTypeMatch(lhs, {symbolType: builtinBoolType, sourceScope: undefined}, leftRange);
    checkTypeMatch(rhs, {symbolType: builtinBoolType, sourceScope: undefined}, rightRange);
    return {symbolType: builtinBoolType, sourceScope: undefined};
}

// ASSIGNOP      ::= '=' | '+=' | '-=' | '*=' | '/=' | '|=' | '&=' | '^=' | '%=' | '**=' | '<<=' | '>>=' | '>>>='
function analyzeAssignOp(
    scope: SymbolScope, operator: ParsingToken,
    lhs: DeducedType | undefined, rhs: DeducedType | undefined,
    leftRange: ParsedRange, rightRange: ParsedRange
): DeducedType | undefined {
    if (lhs === undefined || rhs === undefined) return undefined;
    if (lhs.symbolType.symbolKind === SymbolKind.Type && rhs.symbolType.symbolKind === SymbolKind.Type) {
        if (lhs.symbolType.sourceType === PrimitiveType.Number && rhs.symbolType.sourceType === PrimitiveType.Number) return lhs;
    }

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

// Entry point of the analyzer | 解析器のエントリーポイント
export function analyzeFromParsed(ast: NodeScript, path: string, includedScopes: AnalyzedScope[]): AnalyzedScope {
    const globalScope: SymbolScope = createSymbolScope(undefined, undefined, '');

    for (const included of includedScopes) {
        // Copy the symbols in the included scope. | インクルードされたスコープのシンボルをコピー
        copySymbolsInScope(included.pureScope, globalScope);
    }

    const analyzing: AnalyzingQueue = [];
    const hoisting: HoistingQueue = [];

    // Hoist the declared symbols. | 宣言されたシンボルを巻き上げ
    hoistScript(globalScope, ast, analyzing, hoisting);
    while (hoisting.length > 0) {
        const next = hoisting.shift();
        if (next !== undefined) next();
    }

    // Analyze the contents of the scope to be processed. | 処理を行うスコープの中身を解析
    while (analyzing.length > 0) {
        const next = analyzing.shift();
        if (next !== undefined) next();
    }

    return new AnalyzedScope(path, globalScope);
}

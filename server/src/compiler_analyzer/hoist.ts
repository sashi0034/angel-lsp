import {
    AnalyzedScope,
    copySymbolsInScope,
    createSymbolScope,
    createSymbolScopeAndInsert,
    findScopeShallowlyOrInsert,
    SymbolScope
} from "./symbolScope";
import {
    AccessModifier,
    funcHeadDestructor,
    isFuncHeadReturnValue,
    NodeClass,
    NodeEnum,
    NodeFunc,
    NodeFuncDef,
    NodeInterface,
    NodeIntfMethod,
    NodeMixin,
    NodeName,
    NodeNamespace,
    NodeParamList,
    NodeScript,
    NodeType,
    NodeTypeDef,
    NodeVar,
    NodeVirtualProp,
    ParsedEnumMember
} from "../compiler_parser/nodes";
import {pushHintOfCompletionScopeToParent} from "./symbolComplement";
import {SymbolFunction, SymbolType, SymbolVariable} from "./symbolObject";
import {findSymbolWithParent, insertSymbolObject, tryInsertSymbolObject} from "./symbolUtils";
import {ResolvedType} from "./resolvedType";
import {getGlobalSettings} from "../code/settings";
import {builtinSetterValueToken, builtinThisToken, tryGetBuiltInType} from "./symbolBuiltin";
import {TokenIdentifier, TokenObject} from "../compiler_tokenizer/tokenObject";
import {getIdentifierInNodeType} from "../compiler_parser/nodesUtils";
import {
    analyzeFunc,
    AnalyzeQueue,
    analyzeStatBlock,
    analyzeType,
    analyzeVarInitializer,
    findConstructorForResolvedType,
    HoistQueue,
    HoistResult,
    insertVariables
} from "./analyzer";
import {analyzerDiagnostic} from "./analyzerDiagnostic";

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
function hoistScript(parentScope: SymbolScope, ast: NodeScript, analyzing: AnalyzeQueue, hoisting: HoistQueue) {
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
function hoistNamespace(parentScope: SymbolScope, nodeNamespace: NodeNamespace, queue: AnalyzeQueue) {
    if (nodeNamespace.namespaceList.length === 0) return;

    let scopeIterator = parentScope;
    for (let i = 0; i < nodeNamespace.namespaceList.length; i++) {
        const nextNamespace = nodeNamespace.namespaceList[i];
        scopeIterator = findScopeShallowlyOrInsert(undefined, scopeIterator, nextNamespace);
    }

    hoistScript(scopeIterator, nodeNamespace.script, queue, queue);

    pushHintOfCompletionScopeToParent(parentScope, scopeIterator, nodeNamespace.nodeRange);
}

// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
function hoistEnum(parentScope: SymbolScope, nodeEnum: NodeEnum) {
    const symbol: SymbolType = SymbolType.create({
        declaredPlace: nodeEnum.identifier,
        declaredScope: parentScope,
        sourceNode: nodeEnum,
        membersScope: undefined,
    });

    if (insertSymbolObject(parentScope.symbolMap, symbol) === false) return;

    const scope = findScopeShallowlyOrInsert(nodeEnum, parentScope, nodeEnum.identifier);
    symbol.mutate().membersScope = scope;

    hoistEnumMembers(scope, nodeEnum.memberList, new ResolvedType(symbol));

    if (getGlobalSettings().hoistEnumParentScope)
        hoistEnumMembers(parentScope, nodeEnum.memberList, new ResolvedType(symbol));
}

function hoistEnumMembers(parentScope: SymbolScope, memberList: ParsedEnumMember[], type: ResolvedType) {
    for (const member of memberList) {
        const symbol: SymbolVariable = SymbolVariable.create({
            declaredPlace: member.identifier,
            declaredScope: parentScope,
            type: type,
            isInstanceMember: false,
            accessRestriction: undefined,
        });
        insertSymbolObject(parentScope.symbolMap, symbol);
    }
}

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
function hoistClass(parentScope: SymbolScope, nodeClass: NodeClass, analyzing: AnalyzeQueue, hoisting: HoistQueue) {
    const symbol: SymbolType = SymbolType.create({
        declaredPlace: nodeClass.identifier,
        declaredScope: parentScope,
        sourceNode: nodeClass,
        membersScope: undefined,
    });
    if (insertSymbolObject(parentScope.symbolMap, symbol) === false) return;

    const scope: SymbolScope = findScopeShallowlyOrInsert(nodeClass, parentScope, nodeClass.identifier);
    symbol.mutate().membersScope = scope;

    const thisVariable: SymbolVariable = SymbolVariable.create({
        declaredPlace: builtinThisToken,
        declaredScope: parentScope,
        type: new ResolvedType(symbol),
        isInstanceMember: false,
        accessRestriction: AccessModifier.Private,
    });
    insertSymbolObject(scope.symbolMap, thisVariable);

    const templateTypes = hoistClassTemplateTypes(scope, nodeClass.typeTemplates);
    if (templateTypes.length > 0) symbol.mutate().templateTypes = templateTypes;

    symbol.mutate().baseList = hoistBaseList(scope, nodeClass);

    hoisting.push(() => {
        hoistClassMembers(scope, nodeClass, analyzing, hoisting);

        hoisting.push(() => {
            if (symbol.baseList === undefined) return;

            // Copy the members of the base class
            copyBaseMembers(scope, symbol.baseList);

            // Check to insert the super constructor
            const primeBase = symbol.baseList.length >= 1 ? symbol.baseList[0] : undefined;
            const superConstructor = findConstructorForResolvedType(primeBase);
            if (superConstructor instanceof SymbolFunction) {
                const superSymbol: SymbolFunction = superConstructor.clone();

                superSymbol.mutate().declaredPlace = TokenIdentifier.createVirtual(
                    'super',
                    superSymbol.declaredPlace.location
                );
                insertSymbolObject(scope.symbolMap, superSymbol);
            }
        });
    });

    pushHintOfCompletionScopeToParent(parentScope, scope, nodeClass.nodeRange);
}

function hoistClassTemplateTypes(scope: SymbolScope, types: NodeType[] | undefined) {
    const templateTypes: TokenObject[] = [];
    for (const type of types ?? []) {
        insertSymbolObject(scope.symbolMap, SymbolType.create({
            declaredPlace: getIdentifierInNodeType(type),
            declaredScope: scope,
            sourceNode: undefined,
            membersScope: undefined,
            isTypeParameter: true,
        }));

        templateTypes.push(getIdentifierInNodeType(type));
    }
    return templateTypes;
}

function hoistBaseList(scope: SymbolScope, nodeClass: NodeClass | NodeInterface): (ResolvedType | undefined)[] | undefined {
    if (nodeClass.baseList.length === 0) return undefined;

    const baseList: (ResolvedType | undefined)[] = [];
    for (const baseIdentifier of nodeClass.baseList) {
        const baseType = findSymbolWithParent(scope, baseIdentifier.text);

        if (baseType === undefined) {
            analyzerDiagnostic.add(baseIdentifier.location, `'${baseIdentifier.text}' is not defined type`);
            baseList.push(undefined);
        } else if (baseType.symbol instanceof SymbolType === false) {
            analyzerDiagnostic.add(baseIdentifier.location, `'${baseIdentifier.text}' is not class or interface`);
            baseList.push(undefined);
        } else {
            // Found the base class
            baseList.push(new ResolvedType(baseType.symbol));

            scope.referencedList.push({
                declaredSymbol: baseType.symbol,
                referencedToken: baseIdentifier
            });
        }
    }
    return baseList;
}

function copyBaseMembers(scope: SymbolScope, baseList: (ResolvedType | undefined)[]) {
    for (const baseType of baseList) {
        if (baseType === undefined) continue;
        if (baseType.symbolType instanceof SymbolFunction) continue;

        const baseScope = baseType.symbolType.membersScope;
        if (baseScope === undefined) continue;

        for (const [key, symbol] of baseScope.symbolMap) {
            if (key === 'this') continue;
            const errored = tryInsertSymbolObject(scope.symbolMap, symbol);
            if (errored !== undefined) {
                analyzerDiagnostic.add(errored.declaredPlace.location, `Duplicated symbol '${key}'`);
            }
        }
    }
}

// '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'
function hoistClassMembers(scope: SymbolScope, nodeClass: NodeClass, analyzing: AnalyzeQueue, hoisting: HoistQueue) {
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

    const symbol: SymbolType = SymbolType.create({
        declaredPlace: typeDef.identifier,
        declaredScope: parentScope,
        sourceNode: builtInType.sourceNode,
        membersScope: undefined,
    });
    insertSymbolObject(parentScope.symbolMap, symbol);
}

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
function hoistFunc(
    parentScope: SymbolScope, nodeFunc: NodeFunc, analyzing: AnalyzeQueue, hoisting: HoistQueue, isInstanceMember: boolean
) {
    if (nodeFunc.head === funcHeadDestructor) return;

    const returnType = isFuncHeadReturnValue(nodeFunc.head) ? analyzeType(
        parentScope,
        nodeFunc.head.returnType) : undefined;
    const symbol: SymbolFunction = SymbolFunction.create({
        declaredPlace: nodeFunc.identifier,
        declaredScope: parentScope,
        returnType: returnType,
        parameterTypes: [],
        sourceNode: nodeFunc,
        isInstanceMember: isInstanceMember,
        accessRestriction: nodeFunc.accessor
    });
    if (insertSymbolObject(parentScope.symbolMap, symbol) === false) return;

    // Check if the function is a virtual property setter or getter
    if (nodeFunc.identifier.text.startsWith('get_') || nodeFunc.identifier.text.startsWith('set_')) {
        if (nodeFunc.funcAttr?.isProperty === true || getGlobalSettings().explicitPropertyAccessor === false) {
            const identifier: TokenObject = TokenIdentifier.createVirtual(
                nodeFunc.identifier.text.substring(4),
                nodeFunc.identifier.location);

            const symbol: SymbolVariable = SymbolVariable.create({
                declaredPlace: identifier, // FIXME?
                declaredScope: parentScope,
                type: returnType,
                isInstanceMember: isInstanceMember,
                accessRestriction: nodeFunc.accessor,
            });
            tryInsertSymbolObject(parentScope.symbolMap, symbol);
        }
    } else if (nodeFunc.funcAttr?.isProperty === true) {
        analyzerDiagnostic.add(nodeFunc.identifier.location, 'Property accessor must start with "get_" or "set_"');
    }

    // Create a new scope for the function
    const scope: SymbolScope = createSymbolScopeAndInsert(nodeFunc, parentScope, nodeFunc.identifier.text);

    hoisting.push(() => {
        symbol.mutate().parameterTypes = hoistParamList(scope, nodeFunc.paramList);
    });

    analyzing.push(() => {
        analyzeFunc(scope, nodeFunc);
    });
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))
function hoistInterface(parentScope: SymbolScope, nodeInterface: NodeInterface, analyzing: AnalyzeQueue, hoisting: HoistQueue) {
    const symbol: SymbolType = SymbolType.create({
        declaredPlace: nodeInterface.identifier,
        declaredScope: parentScope,
        sourceNode: nodeInterface,
        membersScope: undefined,
    });
    if (insertSymbolObject(parentScope.symbolMap, symbol) === false) return;

    const scope: SymbolScope = findScopeShallowlyOrInsert(nodeInterface, parentScope, nodeInterface.identifier);
    symbol.mutate().membersScope = scope;

    const baseList = hoistBaseList(scope, nodeInterface);
    if (baseList !== undefined) symbol.mutate().baseList = baseList;

    hoisting.push(() => {
        hoistInterfaceMembers(scope, nodeInterface, analyzing, hoisting);
        if (baseList !== undefined) copyBaseMembers(scope, baseList);
    });

    pushHintOfCompletionScopeToParent(parentScope, scope, nodeInterface.nodeRange);
}

function hoistInterfaceMembers(scope: SymbolScope, nodeInterface: NodeInterface, analyzing: AnalyzeQueue, hoisting: HoistQueue) {
    for (const member of nodeInterface.memberList) {
        if (member.nodeName === NodeName.VirtualProp) {
            hoistVirtualProp(scope, member, analyzing, hoisting, true);
        } else if (member.nodeName === NodeName.IntfMethod) {
            hoistIntfMethod(scope, member);
        }
    }
}

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
function hoistVar(scope: SymbolScope, nodeVar: NodeVar, analyzing: AnalyzeQueue, isInstanceMember: boolean) {
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

// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'

// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
function hoistFuncDef(parentScope: SymbolScope, funcDef: NodeFuncDef, analyzing: AnalyzeQueue, hoisting: HoistQueue) {
    const symbol: SymbolFunction = SymbolFunction.create({
        declaredPlace: funcDef.identifier,
        declaredScope: parentScope,
        returnType: analyzeType(parentScope, funcDef.returnType),
        parameterTypes: [],
        sourceNode: funcDef,
        isInstanceMember: false,
        accessRestriction: undefined,
    });
    if (insertSymbolObject(parentScope.symbolMap, symbol) === false) return;

    hoisting.push(() => {
        symbol.mutate().parameterTypes = funcDef.paramList.map(param => analyzeType(parentScope, param.type));
    });
}

// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
function hoistVirtualProp(
    parentScope: SymbolScope, virtualProp: NodeVirtualProp, analyzing: AnalyzeQueue, hoisting: HoistQueue, isInstanceMember: boolean
) {
    const type = analyzeType(parentScope, virtualProp.type);

    const identifier = virtualProp.identifier;
    const symbol: SymbolVariable = SymbolVariable.create({
        declaredPlace: identifier,
        declaredScope: parentScope,
        type: type,
        isInstanceMember: isInstanceMember,
        accessRestriction: virtualProp.accessor,
    });
    insertSymbolObject(parentScope.symbolMap, symbol);

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
            const valueVariable: SymbolVariable = SymbolVariable.create({
                declaredPlace: builtinSetterValueToken,
                declaredScope: parentScope,
                type: new ResolvedType(type.symbolType),
                isInstanceMember: false,
                accessRestriction: virtualProp.accessor,
            });
            insertSymbolObject(setterScope.symbolMap, valueVariable);
        }

        const statBlock = setter.statBlock;
        analyzing.push(() => {
            analyzeStatBlock(setterScope, statBlock);
        });
    }
}

// MIXIN         ::= 'mixin' CLASS
function hoistMixin(parentScope: SymbolScope, mixin: NodeMixin, analyzing: AnalyzeQueue, hoisting: HoistQueue) {
    hoistClass(parentScope, mixin.mixinClass, analyzing, hoisting);
}

// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'
function hoistIntfMethod(parentScope: SymbolScope, intfMethod: NodeIntfMethod) {
    const symbol: SymbolFunction = SymbolFunction.create({
        declaredPlace: intfMethod.identifier,
        declaredScope: parentScope,
        returnType: analyzeType(parentScope, intfMethod.returnType),
        parameterTypes: [],
        sourceNode: intfMethod,
        isInstanceMember: true,
        accessRestriction: undefined,
    });
    if (insertSymbolObject(parentScope.symbolMap, symbol) === false) return;
}

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
function hoistParamList(scope: SymbolScope, paramList: NodeParamList) {
    const resolvedTypes: (ResolvedType | undefined)[] = [];
    for (const param of paramList) {
        const type = analyzeType(scope, param.type);
        if (type === undefined) resolvedTypes.push(undefined);
        else resolvedTypes.push(type);

        if (param.identifier === undefined) continue;
        insertSymbolObject(scope.symbolMap, SymbolVariable.create({
            declaredPlace: param.identifier,
            declaredScope: scope,
            type: type,
            isInstanceMember: false,
            accessRestriction: undefined,
        }));
    }
    return resolvedTypes;
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]
// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
// PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
// FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property'}
// STATEMENT     ::= (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
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
// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
// EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
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
// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
// EXPROP        ::= MATHOP | COMPOP | LOGICOP | BITOP
// BITOP         ::= '&' | '|' | '^' | '<<' | '>>' | '>>>'
// MATHOP        ::= '+' | '-' | '*' | '/' | '%' | '**'
// COMPOP        ::= '==' | '!=' | '<' | '<=' | '>' | '>=' | 'is' | '!is'
// LOGICOP       ::= '&&' | '||' | '^^' | 'and' | 'or' | 'xor'
// ASSIGNOP      ::= '=' | '+=' | '-=' | '*=' | '/=' | '|=' | '&=' | '^=' | '%=' | '**=' | '<<=' | '>>=' | '>>>='

export function hoistAfterParsed(ast: NodeScript, path: string, includedScopes: AnalyzedScope[]): HoistResult {
    const globalScope: SymbolScope = createSymbolScope(undefined, undefined, '');

    globalScope.initializeContext(path);

    // TODO: refer to symbols without copying
    for (const included of includedScopes) {
        // Copy the symbols in the included scope.
        copySymbolsInScope(included.pureScope, globalScope, {excludeSrcPath: path});
    }

    const analyzeQueue: AnalyzeQueue = [];
    const hoistQueue: HoistQueue = [];

    // Hoist the declared symbols.
    hoistScript(globalScope, ast, analyzeQueue, hoistQueue);
    while (hoistQueue.length > 0) {
        const next = hoistQueue.shift();
        if (next !== undefined) next();
    }

    return {globalScope, analyzeQueue};
}

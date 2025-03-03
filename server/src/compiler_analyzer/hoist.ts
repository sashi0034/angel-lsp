import {
    AnalyzerScope,
    SymbolScope, tryResolveActiveScope
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
import {findSymbolWithParent} from "./symbolUtils";
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
        scopeIterator = scopeIterator.insertScopeAndCheck(nextNamespace, undefined);
    }

    hoistScript(scopeIterator, nodeNamespace.script, queue, queue);

    pushHintOfCompletionScopeToParent(parentScope, scopeIterator, nodeNamespace.nodeRange);
}

// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
function hoistEnum(parentScope: SymbolScope, nodeEnum: NodeEnum) {
    const symbol: SymbolType = SymbolType.create({
        defToken: nodeEnum.identifier,
        defScope: parentScope.scopePath,
        defNode: nodeEnum,
        membersScope: undefined,
    });

    if (parentScope.insertSymbolAndCheck(symbol) === false) return;

    const scope = parentScope.insertScopeAndCheck(nodeEnum.identifier, nodeEnum);
    symbol.mutate().membersScope = scope.scopePath;

    hoistEnumMembers(scope, nodeEnum.memberList, new ResolvedType(symbol));

    if (getGlobalSettings().hoistEnumParentScope)
        hoistEnumMembers(parentScope, nodeEnum.memberList, new ResolvedType(symbol));
}

function hoistEnumMembers(parentScope: SymbolScope, memberList: ParsedEnumMember[], type: ResolvedType) {
    for (const member of memberList) {
        const symbol: SymbolVariable = SymbolVariable.create({
            defToken: member.identifier,
            defScope: parentScope.scopePath,
            type: type,
            isInstanceMember: false,
            accessRestriction: undefined,
        });
        parentScope.insertSymbolAndCheck(symbol);
    }
}

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
function hoistClass(parentScope: SymbolScope, nodeClass: NodeClass, analyzing: AnalyzeQueue, hoisting: HoistQueue) {
    const symbol: SymbolType = SymbolType.create({
        defToken: nodeClass.identifier,
        defScope: parentScope.scopePath,
        defNode: nodeClass,
        membersScope: undefined,
    });
    if (parentScope.insertSymbolAndCheck(symbol) === false) return;

    const scope: SymbolScope = parentScope.insertScopeAndCheck(nodeClass.identifier, nodeClass);
    symbol.mutate().membersScope = scope.scopePath;

    const thisVariable: SymbolVariable = SymbolVariable.create({
        defToken: builtinThisToken,
        defScope: parentScope.scopePath,
        type: new ResolvedType(symbol),
        isInstanceMember: false,
        accessRestriction: AccessModifier.Private,
    });
    scope.insertSymbolAndCheck(thisVariable);

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
            if (superConstructor?.isFunctionHolder()) {
                const superSymbol: SymbolFunction = superConstructor.first.clone(); // TODO: Clone other constructor

                superSymbol.mutate().defToken = TokenIdentifier.createVirtual(
                    'super',
                    superSymbol.defToken.location
                );
                scope.insertSymbolAndCheck(superSymbol);
            }
        });
    });

    pushHintOfCompletionScopeToParent(parentScope, scope, nodeClass.nodeRange);
}

function hoistClassTemplateTypes(scope: SymbolScope, types: NodeType[] | undefined) {
    const templateTypes: TokenObject[] = [];
    for (const type of types ?? []) {
        scope.insertSymbolAndCheck(SymbolType.create({
            defToken: getIdentifierInNodeType(type),
            defScope: scope.scopePath,
            defNode: undefined,
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
        if (baseType.symbolType.isFunction()) continue;

        const baseScope = tryResolveActiveScope(baseType.symbolType.membersScope);
        if (baseScope === undefined) continue;

        for (const [key, symbolHolder] of baseScope.symbolTable) {
            if (key === 'this') continue;
            for (const symbol of symbolHolder.toList()) {
                if (symbol.isFunction()) continue;

                const errored = scope.insertSymbol(symbol);
                if (errored !== undefined) {
                    analyzerDiagnostic.add(errored.toList()[0].defToken.location, `Duplicated symbol '${key}'`);
                }
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
        defToken: typeDef.identifier,
        defScope: parentScope.scopePath,
        defNode: builtInType.defNode,
        membersScope: undefined,
    });
    parentScope.insertSymbolAndCheck(symbol);
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
        defToken: nodeFunc.identifier,
        defScope: parentScope.scopePath,
        returnType: returnType,
        parameterTypes: [],
        defNode: nodeFunc,
        isInstanceMember: isInstanceMember,
        accessRestriction: nodeFunc.accessor
    });
    if (parentScope.insertSymbolAndCheck(symbol) === false) return;

    // Check if the function is a virtual property setter or getter
    if (nodeFunc.identifier.text.startsWith('get_') || nodeFunc.identifier.text.startsWith('set_')) {
        if (nodeFunc.funcAttr?.isProperty === true || getGlobalSettings().explicitPropertyAccessor === false) {
            const identifier: TokenObject = TokenIdentifier.createVirtual(
                nodeFunc.identifier.text.substring(4),
                nodeFunc.identifier.location);

            const symbol: SymbolVariable = SymbolVariable.create({
                defToken: identifier, // FIXME?
                defScope: parentScope.scopePath,
                type: returnType,
                isInstanceMember: isInstanceMember,
                accessRestriction: nodeFunc.accessor,
            });
            parentScope.insertSymbol(symbol);
        }
    } else if (nodeFunc.funcAttr?.isProperty === true) {
        analyzerDiagnostic.add(nodeFunc.identifier.location, 'Property accessor must start with "get_" or "set_"');
    }

    // Create a new scope for the function
    const scope: SymbolScope = parentScope.insertScope(nodeFunc.identifier.text, nodeFunc);

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
        defToken: nodeInterface.identifier,
        defScope: parentScope.scopePath,
        defNode: nodeInterface,
        membersScope: undefined,
    });
    if (parentScope.insertSymbolAndCheck(symbol) === false) return;

    const scope: SymbolScope = parentScope.insertScopeAndCheck(nodeInterface.identifier, nodeInterface);
    symbol.mutate().membersScope = scope.scopePath;

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
        defToken: funcDef.identifier,
        defScope: parentScope.scopePath,
        returnType: analyzeType(parentScope, funcDef.returnType),
        parameterTypes: [],
        defNode: funcDef,
        isInstanceMember: false,
        accessRestriction: undefined,
    });
    if (parentScope.insertSymbolAndCheck(symbol) === false) return;

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
        defToken: identifier,
        defScope: parentScope.scopePath,
        type: type,
        isInstanceMember: isInstanceMember,
        accessRestriction: virtualProp.accessor,
    });
    parentScope.insertSymbolAndCheck(symbol);

    const getter = virtualProp.getter;
    if (getter !== undefined && getter.statBlock !== undefined) {
        const getterScope = parentScope.insertScope(`get_${identifier.text}`, virtualProp);

        const statBlock = getter.statBlock;
        analyzing.push(() => {
            analyzeStatBlock(getterScope, statBlock);
        });
    }

    const setter = virtualProp.setter;
    if (setter !== undefined && setter.statBlock !== undefined) {
        const setterScope = parentScope.insertScope(`set_${identifier.text}`, virtualProp);

        if (type !== undefined) {
            const valueVariable: SymbolVariable = SymbolVariable.create({
                defToken: builtinSetterValueToken,
                defScope: parentScope.scopePath,
                type: new ResolvedType(type.symbolType),
                isInstanceMember: false,
                accessRestriction: virtualProp.accessor,
            });
            setterScope.insertSymbolAndCheck(valueVariable);
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
        defToken: intfMethod.identifier,
        defScope: parentScope.scopePath,
        returnType: analyzeType(parentScope, intfMethod.returnType),
        parameterTypes: [],
        defNode: intfMethod,
        isInstanceMember: true,
        accessRestriction: undefined,
    });
    if (parentScope.insertSymbolAndCheck(symbol) === false) return;
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
        scope.insertSymbolAndCheck(SymbolVariable.create({
            defToken: param.identifier,
            defScope: scope.scopePath,
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

export function hoistAfterParsed(ast: NodeScript, path: string, includedScopes: AnalyzerScope[]): HoistResult {
    const globalScope: SymbolScope = SymbolScope.createEmpty();

    globalScope.initializeContext(path);

    for (const included of includedScopes) {
        globalScope.includeExternalScope(included.getFileGlobalScope());
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

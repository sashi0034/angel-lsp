import {
    createAnonymousIdentifier, SymbolGlobalScope,
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
import {complementScopeRegion} from "./complementHint";
import {SymbolFunction, SymbolType, SymbolVariable} from "./symbolObject";
import {findSymbolWithParent} from "./symbolUtils";
import {ResolvedType} from "./resolvedType";
import {getGlobalSettings} from "../core/settings";
import {builtinSetterValueToken, builtinThisToken, tryGetBuiltinType} from "./builtinType";
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
import {AnalyzerScope} from "./analyzerScope";
import {TokenRange} from "../compiler_tokenizer/tokenRange";

// BNF: SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
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

// BNF: NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
function hoistNamespace(parentScope: SymbolScope, nodeNamespace: NodeNamespace, queue: AnalyzeQueue) {
    if (nodeNamespace.namespaceList.length === 0) return;

    let scopeIterator = parentScope;
    for (let i = 0; i < nodeNamespace.namespaceList.length; i++) {
        const namespaceToken = nodeNamespace.namespaceList[i];
        scopeIterator = scopeIterator.insertScopeAndCheck(namespaceToken, undefined);
        scopeIterator.pushNamespaceToken(namespaceToken);
    }

    hoistScript(
        scopeIterator, nodeNamespace.script, queue,
        queue // TODO: Is this correct? Check
    );

    complementScopeRegion(scopeIterator, nodeNamespace.nodeRange);
}

// BNF: ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER [ ':' ('int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64') ] (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
function hoistEnum(parentScope: SymbolScope, nodeEnum: NodeEnum) {
    const symbol: SymbolType = SymbolType.create({
        identifierToken: nodeEnum.identifier,
        scopePath: parentScope.scopePath,
        linkedNode: nodeEnum,
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
            identifierToken: member.identifier,
            scopePath: parentScope.scopePath,
            type: type,
            isInstanceMember: false,
            accessRestriction: undefined,
        });
        parentScope.insertSymbolAndCheck(symbol);
    }
}

// BNF: CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
function hoistClass(parentScope: SymbolScope, nodeClass: NodeClass, analyzing: AnalyzeQueue, hoisting: HoistQueue) {
    const symbol: SymbolType = SymbolType.create({
        identifierToken: nodeClass.identifier,
        scopePath: parentScope.scopePath,
        linkedNode: nodeClass,
        membersScope: undefined,
    });
    if (parentScope.insertSymbolAndCheck(symbol) === false) return;

    const scope: SymbolScope = parentScope.insertScopeAndCheck(nodeClass.identifier, nodeClass);
    symbol.mutate().membersScope = scope.scopePath;

    const thisVariable: SymbolVariable = SymbolVariable.create({
        identifierToken: builtinThisToken,
        scopePath: parentScope.scopePath,
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
                for (const superSymbol of superConstructor.toList()) {
                    superSymbol.mutate().identifierToken = TokenIdentifier.createVirtual(
                        'super',
                        new TokenRange(superSymbol.identifierToken, superSymbol.identifierToken)
                    );

                    scope.insertSymbolAndCheck(superSymbol);
                }
            }
        });
    });

    complementScopeRegion(scope, nodeClass.nodeRange);
}

function hoistClassTemplateTypes(scope: SymbolScope, types: NodeType[] | undefined) {
    const templateTypes: TokenObject[] = [];
    for (const type of types ?? []) {
        scope.insertSymbolAndCheck(SymbolType.create({
            identifierToken: getIdentifierInNodeType(type),
            scopePath: scope.scopePath,
            linkedNode: undefined,
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

            scope.pushReference({
                toSymbol: baseType.symbol,
                fromToken: baseIdentifier
            });
        }
    }
    return baseList;
}

function copyBaseMembers(scope: SymbolScope, baseList: (ResolvedType | undefined)[]) {
    // Iterate over each base class
    for (const baseType of baseList) {
        if (baseType === undefined) continue;
        if (baseType.typeOrFunc.isFunction()) continue;

        const baseScope = tryResolveActiveScope(baseType.typeOrFunc.membersScope);
        if (baseScope === undefined) continue;

        // Insert each base class member if possible
        for (const [key, symbolHolder] of baseScope.symbolTable) {
            if (key === 'this') continue;

            for (const symbol of symbolHolder.toList()) {
                if (symbol.isFunction() || symbol.isVariable()) {
                    if (symbol.accessRestriction === AccessModifier.Private) continue;
                }

                const alreadyExists = scope.insertSymbol(symbol);
                if (alreadyExists !== undefined) {
                    analyzerDiagnostic.add(
                        alreadyExists.toList()[0].identifierToken.location,
                        `Duplicated symbol '${key}'`
                    );
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

// BNF: TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'
function hoistTypeDef(parentScope: SymbolScope, typeDef: NodeTypeDef) {
    const builtInType = tryGetBuiltinType(typeDef.type);
    if (builtInType === undefined) return;

    const symbol: SymbolType = SymbolType.create({
        identifierToken: typeDef.identifier,
        scopePath: parentScope.scopePath,
        linkedNode: builtInType.linkedNode,
        membersScope: undefined,
    });
    parentScope.insertSymbolAndCheck(symbol);
}

// BNF: FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
function hoistFunc(
    parentScope: SymbolScope, nodeFunc: NodeFunc, analyzing: AnalyzeQueue, hoisting: HoistQueue, isInstanceMember: boolean
) {
    if (nodeFunc.head === funcHeadDestructor) return;

    // Function holder scope (with no node)
    // |-- Anonymous scope of one of the overloads (with NodeFunc)
    //     |-- ...

    // Create a new scope for the function
    const funcionHolderScope: SymbolScope =
        // This doesn't have a linked node because the function may be overloaded.
        parentScope.insertScope(nodeFunc.identifier.text, undefined);
    const functionScope = funcionHolderScope.insertScope(createAnonymousIdentifier(), nodeFunc);

    const symbol: SymbolFunction = SymbolFunction.create({
        identifierToken: nodeFunc.identifier,
        scopePath: parentScope.scopePath,
        returnType: undefined, // set below
        parameterTypes: [],
        linkedNode: nodeFunc,
        isInstanceMember: isInstanceMember,
        accessRestriction: nodeFunc.accessor
    });

    const templateTypes = hoistClassTemplateTypes(functionScope, nodeFunc.typeTemplates);
    if (templateTypes.length > 0) symbol.mutate().templateTypes = templateTypes;

    const returnType = isFuncHeadReturnValue(nodeFunc.head) ? analyzeType(
        functionScope,
        nodeFunc.head.returnType) : undefined;
    symbol.mutate().returnType = returnType;
    if (parentScope.insertSymbolAndCheck(symbol) === false) return;

    // Check if the function is a virtual property setter or getter
    if (nodeFunc.identifier.text.startsWith('get_') || nodeFunc.identifier.text.startsWith('set_')) {
        if (nodeFunc.funcAttr?.isProperty === true || getGlobalSettings().explicitPropertyAccessor === false) {
            const identifier: TokenObject = TokenIdentifier.createVirtual(
                nodeFunc.identifier.text.substring(4),
                new TokenRange(nodeFunc.identifier, nodeFunc.identifier)
            );

            const symbol: SymbolVariable = SymbolVariable.create({
                identifierToken: identifier, // FIXME?
                scopePath: parentScope.scopePath,
                type: returnType,
                isInstanceMember: isInstanceMember,
                accessRestriction: nodeFunc.accessor,
            });
            parentScope.insertSymbol(symbol);
        }
    } else if (nodeFunc.funcAttr?.isProperty === true) {
        analyzerDiagnostic.add(nodeFunc.identifier.location, 'Property accessor must start with "get_" or "set_"');
    }

    hoisting.push(() => {
        symbol.mutate().parameterTypes = hoistParamList(functionScope, nodeFunc.paramList);
    });

    analyzing.push(() => {
        analyzeFunc(functionScope, nodeFunc);
    });
}

// BNF: INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))
function hoistInterface(parentScope: SymbolScope, nodeInterface: NodeInterface, analyzing: AnalyzeQueue, hoisting: HoistQueue) {
    const symbol: SymbolType = SymbolType.create({
        identifierToken: nodeInterface.identifier,
        scopePath: parentScope.scopePath,
        linkedNode: nodeInterface,
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

    complementScopeRegion(scope, nodeInterface.nodeRange);
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

// BNF: VAR           ::= ['private' | 'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
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

// BNF: IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'

// BNF: FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
function hoistFuncDef(parentScope: SymbolScope, funcDef: NodeFuncDef, analyzing: AnalyzeQueue, hoisting: HoistQueue) {
    const symbol: SymbolFunction = SymbolFunction.create({
        identifierToken: funcDef.identifier,
        scopePath: parentScope.scopePath,
        returnType: undefined,
        parameterTypes: [],
        linkedNode: funcDef,
        isInstanceMember: false,
        accessRestriction: undefined,
    });
    if (parentScope.insertSymbolAndCheck(symbol) === false) return;

    hoisting.push(() => {
        symbol.mutate().returnType = analyzeType(parentScope, funcDef.returnType);
    });

    hoisting.push(() => {
        symbol.mutate().parameterTypes = funcDef.paramList.map(param => analyzeType(parentScope, param.type));
    });
}

// BNF: VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
function hoistVirtualProp(
    parentScope: SymbolScope, virtualProp: NodeVirtualProp, analyzing: AnalyzeQueue, hoisting: HoistQueue, isInstanceMember: boolean
) {
    const type = analyzeType(parentScope, virtualProp.type);

    const identifier = virtualProp.identifier;
    const symbol: SymbolVariable = SymbolVariable.create({
        identifierToken: identifier,
        scopePath: parentScope.scopePath,
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
                identifierToken: builtinSetterValueToken,
                scopePath: parentScope.scopePath,
                type: new ResolvedType(type.typeOrFunc),
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

// BNF: MIXIN         ::= 'mixin' CLASS
function hoistMixin(parentScope: SymbolScope, mixin: NodeMixin, analyzing: AnalyzeQueue, hoisting: HoistQueue) {
    hoistClass(parentScope, mixin.mixinClass, analyzing, hoisting);
}

// BNF: INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'
function hoistIntfMethod(parentScope: SymbolScope, intfMethod: NodeIntfMethod) {
    const symbol: SymbolFunction = SymbolFunction.create({
        identifierToken: intfMethod.identifier,
        scopePath: parentScope.scopePath,
        returnType: analyzeType(parentScope, intfMethod.returnType),
        parameterTypes: [],
        linkedNode: intfMethod,
        isInstanceMember: true,
        accessRestriction: undefined,
    });
    if (parentScope.insertSymbolAndCheck(symbol) === false) return;
}

// BNF: STATBLOCK     ::= '{' {VAR | STATEMENT} '}'

// BNF: PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' [EXPR | 'void']] {',' TYPE TYPEMOD [IDENTIFIER] ['...' | ('=' [EXPR | 'void']])})] ')'
function hoistParamList(scope: SymbolScope, paramList: NodeParamList) {
    const resolvedTypes: (ResolvedType | undefined)[] = [];
    for (const param of paramList) {
        const type = analyzeType(scope, param.type);
        if (type === undefined) resolvedTypes.push(undefined);
        else resolvedTypes.push(type);

        if (param.identifier === undefined) continue;
        scope.insertSymbolAndCheck(SymbolVariable.create({
            identifierToken: param.identifier,
            scopePath: scope.scopePath,
            type: type,
            isInstanceMember: false,
            accessRestriction: undefined,
        }));
    }
    return resolvedTypes;
}

// BNF: TYPEMOD       ::= ['&' ['in' | 'out' | 'inout'] ['+'] ['if_handle_then_const']]
// BNF: TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
// BNF: INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
// BNF: SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
// BNF: DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
// BNF: PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
// BNF: FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property' | 'delete' | 'nodiscard'}
// BNF: STATEMENT     ::= (IF | FOR | FOREACH | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
// BNF: SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
// BNF: BREAK         ::= 'break' ';'
// BNF: FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
// BNF: WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
// BNF: DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
// BNF: IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
// BNF: CONTINUE      ::= 'continue' ';'
// BNF: EXPRSTAT      ::= [ASSIGN] ';'
// BNF: TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK
// BNF: RETURN        ::= 'return' [ASSIGN] ';'
// BNF: CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
// BNF: EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
// BNF: EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
// BNF: EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
// BNF: CONSTRUCTCALL ::= TYPE ARGLIST
// BNF: EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'
// BNF: EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']') | ARGLIST | '++' | '--'
// BNF: CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
// BNF: LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
// BNF: LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
// BNF: FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
// BNF: VARACCESS     ::= SCOPE IDENTIFIER
// BNF: ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
// BNF: ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
// BNF: CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
// BNF: EXPROP        ::= MATHOP | COMPOP | LOGICOP | BITOP
// BNF: BITOP         ::= '&' | '|' | '^' | '<<' | '>>' | '>>>'
// BNF: MATHOP        ::= '+' | '-' | '*' | '/' | '%' | '**'
// BNF: COMPOP        ::= '==' | '!=' | '<' | '<=' | '>' | '>=' | 'is' | '!is'
// BNF: LOGICOP       ::= '&&' | '||' | '^^' | 'and' | 'or' | 'xor'
// BNF: ASSIGNOP      ::= '=' | '+=' | '-=' | '*=' | '/=' | '|=' | '&=' | '^=' | '%=' | '**=' | '<<=' | '>>=' | '>>>='

export function hoistAfterParsed(ast: NodeScript, path: string, includedScopes: AnalyzerScope[]): HoistResult {
    const globalScope: SymbolGlobalScope = new SymbolGlobalScope();

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

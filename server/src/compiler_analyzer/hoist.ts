import {
    createAnonymousIdentifier,
    getActiveGlobalScope,
    SymbolGlobalScope,
    SymbolScope,
    tryResolveActiveScope
} from './symbolScope';
import {
    Node_Class,
    Node_Enum,
    Node_Func,
    Node_FuncDef,
    Node_Interface,
    Node_InterfaceMethod,
    Node_Mixin,
    NodeName,
    Node_Namespace,
    Node_Parameter,
    Node_ParamList,
    Node_Script,
    Node_Type,
    Node_TypeDef,
    Node_Var,
    Node_VirtualProp,
    IdentifierAndOptionalExpr
} from '../compiler_parser/nodeObject';
import {AccessRestriction, getAccessRestriction, hasFunctionAttribute} from './nodeHelper';
import {FunctionSymbol, TemplateParameter, TypeSymbol, VariableSymbol} from './symbolObject';
import {findSymbolWithParent} from './symbolUtils';
import {ResolvedType} from './resolvedType';
import {getGlobalSettings} from '../core/settings';
import {builtinSetterValueToken, builtinThisToken, tryGetBuiltinType} from './builtinType';
import {IdentifierToken, TokenObject} from '../compiler_tokenizer/tokenObject';
import {buildTemplateSignature, getIdentifierInTypeNode} from '../compiler_parser/nodeUtils';
import {
    analyzeFunc,
    AnalyzeQueue,
    analyzeStatBlock,
    analyzeType,
    analyzeUsingNamespace,
    analyzeVarInitializer,
    findOptimalScope,
    HoistQueue,
    HoistResult,
    insertVariables,
    pushScopeRegionMarker,
    resolveAutoType
} from './analyzer';
import {analyzerDiagnostic} from './analyzerDiagnostic';
import {TokenRange} from '../compiler_tokenizer/tokenRange';
import {findConstructorOfType} from './constrcutorCall';
import assert = require('node:assert');
import {checkDuplicateFunctionOverload} from './functionOverload';

// **BNF** SCRIPT ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTUALPROP | VAR | FUNC | NAMESPACE | USING | ';'}
function hoistScript(parentScope: SymbolScope, ast: Node_Script, analyzeQueue: AnalyzeQueue, hoistQueue: HoistQueue) {
    for (const statement of ast) {
        const nodeName = statement.nodeName;
        if (nodeName === NodeName.Enum) {
            hoistEnum(parentScope, statement);
        } else if (nodeName === NodeName.TypeDef) {
            hoistTypeDef(parentScope, statement);
        } else if (nodeName === NodeName.Class) {
            hoistClass(parentScope, statement, false, analyzeQueue, hoistQueue);
        } else if (nodeName === NodeName.Mixin) {
            hoistMixin(parentScope, statement, analyzeQueue, hoistQueue);
        } else if (nodeName === NodeName.Interface) {
            hoistInterface(parentScope, statement, analyzeQueue, hoistQueue);
        } else if (nodeName === NodeName.FuncDef) {
            hoistFuncDef(parentScope, statement, analyzeQueue, hoistQueue);
        } else if (nodeName === NodeName.VirtualProp) {
            hoistVirtualProp(parentScope, statement, analyzeQueue, hoistQueue, false);
        } else if (nodeName === NodeName.Var) {
            hoistVar(parentScope, statement, analyzeQueue, hoistQueue, false);
        } else if (nodeName === NodeName.Func) {
            hoistFunc(parentScope, statement, analyzeQueue, hoistQueue, false);
        } else if (nodeName === NodeName.Namespace) {
            hoistNamespace(parentScope, statement, analyzeQueue, hoistQueue);
        } else if (nodeName === NodeName.Using) {
            analyzeUsingNamespace(parentScope, statement);
        }
    }
}

// **BNF** NAMESPACE ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
function hoistNamespace(
    parentScope: SymbolScope,
    namespaceNode: Node_Namespace,
    analyzeQueue: AnalyzeQueue,
    hoistQueue: HoistQueue
) {
    if (namespaceNode.namespaceList.length === 0) {
        return;
    }

    let scopeIterator = parentScope;
    for (let i = 0; i < namespaceNode.namespaceList.length; i++) {
        const namespaceToken = namespaceNode.namespaceList[i];
        scopeIterator = scopeIterator.insertScopeAndCheck(namespaceToken, undefined);
        scopeIterator.pushNamespaceNode(namespaceNode, namespaceToken);
    }

    hoistScript(scopeIterator, namespaceNode.script, analyzeQueue, hoistQueue);

    pushScopeRegionMarker(scopeIterator, namespaceNode.nodeRange);
}

// **BNF** USING ::= 'using' 'namespace' IDENTIFIER ('::' IDENTIFIER)* ';'

// **BNF** ENUM ::= {'shared' | 'external'} 'enum' IDENTIFIER [ ':' ('int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64') ] (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
function hoistEnum(parentScope: SymbolScope, enumNode: Node_Enum) {
    const symbol: TypeSymbol = TypeSymbol.create({
        identifierToken: enumNode.identifier,
        scopePath: parentScope.scopePath,
        linkedNode: enumNode,
        membersScopePath: undefined
    });

    if (parentScope.insertSymbolAndCheck(symbol) === false) {
        return;
    }

    const scope = parentScope.insertScopeAndCheck(enumNode.identifier, enumNode);
    symbol.assignMembersScopePath(scope.scopePath);

    hoistEnumMembers(scope, enumNode.memberList, new ResolvedType(symbol));
}

function hoistEnumMembers(parentScope: SymbolScope, memberList: IdentifierAndOptionalExpr[], type: ResolvedType) {
    for (const member of memberList) {
        parentScope.insertSymbolAndCheck(
            VariableSymbol.create({
                identifierToken: member.identifier,
                scopePath: parentScope.scopePath,
                type: type,
                isInstanceMember: false,
                accessRestriction: undefined
            })
        );
    }
}

// **BNF** CLASS ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTUALPROP | FUNC | VAR | FUNCDEF} '}'))
function hoistClass(
    parentScope: SymbolScope,
    classNode: Node_Class,
    isMixin: boolean,
    analyzeQueue: AnalyzeQueue,
    hoistQueue: HoistQueue
) {
    const isSpecialization = isTemplateSpecialization(parentScope, classNode);

    const baseIdentifier = classNode.identifier.text;
    const specializationSig =
        isSpecialization && classNode.typeParameters ? buildTemplateSignature(classNode.typeParameters) : undefined;
    const symbolKey = specializationSig ? baseIdentifier + specializationSig : baseIdentifier;

    // Preserve the original location so the symbol can be copied into other scopes.
    const identifierToken = specializationSig
        ? new IdentifierToken(symbolKey, classNode.identifier.location)
        : classNode.identifier;

    const symbol: TypeSymbol = TypeSymbol.create({
        identifierToken: identifierToken,
        scopePath: parentScope.scopePath,
        linkedNode: classNode,
        membersScopePath: undefined,
        isMixin: isMixin
    });
    if (parentScope.insertSymbolAndCheck(symbol) === false) {
        return;
    }

    const scope: SymbolScope = parentScope.insertScopeAndCheck(identifierToken, classNode);
    symbol.assignMembersScopePath(scope.scopePath);

    const thisVariable: VariableSymbol = VariableSymbol.create({
        identifierToken: builtinThisToken,
        scopePath: parentScope.scopePath,
        type: new ResolvedType(symbol),
        isInstanceMember: false,
        accessRestriction: AccessRestriction.Private
    });
    scope.insertSymbolAndCheck(thisVariable);

    if (!isSpecialization) {
        const templateParameters = hoistTemplateParameters(scope, classNode.typeParameters);
        if (templateParameters.length > 0) {
            symbol.assignTemplateParameters(templateParameters);
        }
    }

    symbol.assignBaseList(hoistBaseList(scope, classNode));

    hoistQueue.push(() => {
        hoistClassMembers(scope, classNode, analyzeQueue, hoistQueue);

        hoistQueue.push(() => {
            if (symbol.baseList === undefined) {
                return;
            }

            // Copy members from the base class.
            copyBaseMembers(scope, symbol.baseList);

            // Insert the `super` constructor.
            const primeBase = symbol.baseList.length >= 1 ? symbol.baseList[0] : undefined;
            const baseConstructorHolder = findConstructorOfType(primeBase);
            if (baseConstructorHolder?.isFunctionHolder()) {
                for (const baseConstructor of baseConstructorHolder.toList()) {
                    const superConstructor = baseConstructor.clone({
                        identifierToken: IdentifierToken.createVirtual(
                            'super',
                            new TokenRange(baseConstructor.identifierToken, baseConstructor.identifierToken)
                        ),
                        accessRestriction: AccessRestriction.Private
                    });

                    scope.insertSymbol(superConstructor);
                }
            }
        });
    });

    pushScopeRegionMarker(scope, classNode.nodeRange);
}

// e.g.,
// class Box<T> { ... } <-- isTemplateSpecialization() returns false
// class Box<int> { ... } <-- isTemplateSpecialization() returns true
function isTemplateSpecialization(parentScope: SymbolScope, type: Node_Class): boolean {
    if (!type.typeParameters || type.typeParameters.length === 0) {
        return false;
    }

    return findSymbolWithParent(parentScope, type.identifier.text) !== undefined;
}

function hoistTemplateParameters(scope: SymbolScope, types: Node_Type[] | undefined) {
    const templateParameters: TemplateParameter[] = [];
    for (const type of types ?? []) {
        const identifierToken = getIdentifierInTypeNode(type);
        const symbol = TypeSymbol.create({
            identifierToken: identifierToken,
            scopePath: scope.scopePath,
            linkedNode: undefined,
            membersScopePath: undefined,
            isTemplateParameterType: true
        });

        scope.insertSymbolAndCheck(symbol);
        templateParameters.push({
            qualifiedIdentifier: symbol.qualifiedIdentifier,
            identifierToken: identifierToken
        });
    }

    return templateParameters;
}

function hoistBaseList(
    scope: SymbolScope,
    classNode: Node_Class | Node_Interface
): (ResolvedType | undefined)[] | undefined {
    if (classNode.baseList.length === 0) {
        return undefined;
    }

    const baseList: (ResolvedType | undefined)[] = [];
    for (const basePart of classNode.baseList) {
        const baseIdentifier = basePart.identifier;

        const baseScope = findOptimalScope(scope, basePart.scope, baseIdentifier) ?? scope;

        if (baseIdentifier === undefined) {
            baseList.push(undefined);
            continue;
        }

        const baseType = baseScope.lookupSymbolWithParent(baseIdentifier.text);

        if (baseType === undefined) {
            analyzerDiagnostic.error(baseIdentifier.location, `Type '${baseIdentifier.text}' is not defined.`);
            baseList.push(undefined);
        } else if (baseType.isType() === false) {
            analyzerDiagnostic.error(baseIdentifier.location, `'${baseIdentifier.text}' is not a class or interface.`);
            baseList.push(undefined);
        } else {
            // Found the base class
            baseList.push(new ResolvedType(baseType));

            getActiveGlobalScope().pushReference({
                toSymbol: baseType,
                fromToken: baseIdentifier
            });
        }
    }

    return baseList;
}

function copyBaseMembers(scope: SymbolScope, baseList: (ResolvedType | undefined)[], outputError = true) {
    // Iterate over each base class
    for (const baseType of baseList) {
        if (baseType === undefined) {
            continue;
        }

        if (baseType.typeOrFunc.isFunction()) {
            continue;
        }

        const baseScope = tryResolveActiveScope(baseType.typeOrFunc.membersScopePath);
        if (baseScope === undefined) {
            continue;
        }

        const isMixin = baseType.typeOrFunc.isMixin;

        // Insert each base class member if possible
        for (const [key, symbolHolder] of baseScope.symbolTable) {
            if (key === 'this') {
                continue;
            }

            for (const symbol of symbolHolder.toList()) {
                if (symbol.isFunction() || symbol.isVariable()) {
                    if (!isMixin && symbol.accessRestriction === AccessRestriction.Private) {
                        continue;
                    }
                }

                const alreadyExists = scope.insertSymbol(symbol);
                if (alreadyExists === undefined) {
                    continue;
                }

                const isVirtualProperty = symbol.isVariable() && symbol.isVirtualProperty;
                if (outputError && isVirtualProperty === false) {
                    analyzerDiagnostic.error(
                        alreadyExists.toList()[0].identifierToken.location,
                        `Duplicate symbol '${key}'.`
                    );
                }
            }
        }
    }
}

// '{' {VIRTUALPROP | FUNC | VAR | FUNCDEF} '}'
function hoistClassMembers(
    scope: SymbolScope,
    classNode: Node_Class,
    analyzeQueue: AnalyzeQueue,
    hoistQueue: HoistQueue
) {
    for (const member of classNode.memberList) {
        if (member.nodeName === NodeName.VirtualProp) {
            hoistVirtualProp(scope, member, analyzeQueue, hoistQueue, true);
        } else if (member.nodeName === NodeName.Func) {
            hoistFunc(scope, member, analyzeQueue, hoistQueue, true);
        } else if (member.nodeName === NodeName.Var) {
            hoistVar(scope, member, analyzeQueue, hoistQueue, true);
        } else if (member.nodeName === NodeName.FuncDef) {
            hoistFuncDef(scope, member, analyzeQueue, hoistQueue);
        }
    }
}

// **BNF** TYPEDEF ::= 'typedef' PRIMITIVETYPE IDENTIFIER ';'
function hoistTypeDef(parentScope: SymbolScope, typeDef: Node_TypeDef) {
    const builtinType = tryGetBuiltinType(typeDef.type);
    if (builtinType === undefined) {
        return;
    }

    const symbol: TypeSymbol = TypeSymbol.create({
        identifierToken: typeDef.identifier,
        scopePath: parentScope.scopePath,
        linkedNode: undefined, // builtinType.linkedNode,
        membersScopePath: undefined,
        aliasTargetType: builtinType
    });
    parentScope.insertSymbolAndCheck(symbol);
}

// **BNF** FUNC ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST [LISTPATTERN] ['const'] FUNCATTR (';' | STATBLOCK)
function hoistFunc(
    parentScope: SymbolScope,
    funcNode: Node_Func,
    analyzeQueue: AnalyzeQueue,
    hoistQueue: HoistQueue,
    isInstanceMember: boolean
) {
    if (funcNode.head.tag === 'destructor') {
        return;
    }

    // Function holder scope (with no node)
    // |-- Anonymouse scope of one of the overloads (with Node_Func)
    //     |-- ...

    // Create a new scope for the function
    const funcionHolderScope: SymbolScope =
        // This doesn't have a linked node because the function may be overloaded.
        parentScope.insertScope(funcNode.identifier.text, undefined);
    const functionScope = funcionHolderScope.insertScope(createAnonymousIdentifier(), funcNode);

    const symbol: FunctionSymbol = FunctionSymbol.create({
        identifierToken: funcNode.identifier,
        scopePath: parentScope.scopePath,
        returnType: undefined, // set below
        parameterTypes: [],
        linkedNode: funcNode,
        functionScopePath: functionScope.scopePath,
        isInstanceMember: isInstanceMember,
        accessRestriction: getAccessRestriction(funcNode.accessor)
    });

    const templateParameters = hoistTemplateParameters(functionScope, funcNode.typeParameters);
    if (templateParameters.length > 0) {
        symbol.assignTemplateParameters(templateParameters);
    }

    if (parentScope.insertSymbolAndCheck(symbol) === false) {
        return;
    }

    hoistQueue.push(() => {
        const returnType =
            funcNode.head.tag === 'function' ? analyzeType(functionScope, funcNode.head.returnType) : undefined;
        symbol.assignReturnType(returnType);

        // Check if the function is a virtual property setter or getter
        tryInsertVirtualSetterOrGetter(parentScope, funcNode, returnType, isInstanceMember);

        symbol.assignParameterTypes(hoistParamList(funcionHolderScope, functionScope, funcNode.paramList));

        checkDuplicateFunctionOverload(parentScope, symbol);
    });

    analyzeQueue.push(() => {
        analyzeFunc(functionScope, funcNode);
    });
}

// Check if the function is a virtual property setter or getter
function tryInsertVirtualSetterOrGetter(
    scope: SymbolScope,
    node: Node_Func | Node_InterfaceMethod,
    returnType: ResolvedType | undefined,
    isInstanceMember: boolean
) {
    const isGetter = node.identifier.text.startsWith('get_');
    const isSetter = !isGetter && node.identifier.text.startsWith('set_');

    if (isGetter || isSetter) {
        if (hasFunctionAttribute(node, 'property') || !getGlobalSettings().explicitPropertyAccessor) {
            // FIXME?
            const identifier: TokenObject = IdentifierToken.createVirtual(
                node.identifier.text.substring(4),
                new TokenRange(node.identifier, node.identifier)
            );

            // Indexed property accessors: https://www.angelcode.com/angelscript/sdk/docs/manual/doc_script_class_prop.html
            let isIndexedPropertyAccessor;
            if (isGetter) {
                // e.g., 'string get_texts(int idx) property'
                isIndexedPropertyAccessor = node.paramList.length == 1; // TODO: Check the type of the parameter
            } else {
                // e.g., 'void set_texts(int idx, const string &in value) property'
                isIndexedPropertyAccessor = node.paramList.length == 2;
            }

            const symbol: VariableSymbol = VariableSymbol.create({
                identifierToken: identifier,
                scopePath: scope.scopePath,
                type: returnType,
                isInstanceMember: isInstanceMember,
                accessRestriction:
                    node.nodeName === NodeName.InterfaceMethod ? undefined : getAccessRestriction(node.accessor),
                isVirtualProperty: true,
                isIndexedPropertyAccessor: isIndexedPropertyAccessor
            });

            scope.insertSymbol(symbol);
        }
    } else if (hasFunctionAttribute(node, 'property')) {
        analyzerDiagnostic.error(node.identifier.location, 'Property accessor must start with "get_" or "set_"');
    }
}

// **BNF** LISTPATTERN ::= '{' LISTENTRY {',' LISTENTRY} '}'
// TODO: IMPLEMENT IT!

// **BNF** LISTENTRY ::= (('repeat' | 'repeat_same') (('{' LISTENTRY '}') | TYPE)) | (TYPE {',' TYPE})
// TODO: IMPLEMENT IT!

// **BNF** INTERFACE ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTUALPROP | INTERFACEMETHOD} '}'))
function hoistInterface(
    parentScope: SymbolScope,
    interfaceNode: Node_Interface,
    analyzeQueue: AnalyzeQueue,
    hoistQueue: HoistQueue
) {
    const symbol: TypeSymbol = TypeSymbol.create({
        identifierToken: interfaceNode.identifier,
        scopePath: parentScope.scopePath,
        linkedNode: interfaceNode,
        membersScopePath: undefined
    });
    if (parentScope.insertSymbolAndCheck(symbol) === false) {
        return;
    }

    const scope: SymbolScope = parentScope.insertScopeAndCheck(interfaceNode.identifier, interfaceNode);
    symbol.assignMembersScopePath(scope.scopePath);

    const baseList = hoistBaseList(scope, interfaceNode);
    if (baseList !== undefined) {
        symbol.assignBaseList(baseList);
    }

    hoistQueue.push(() => {
        hoistInterfaceMembers(scope, interfaceNode, analyzeQueue, hoistQueue);
        if (baseList !== undefined) {
            copyBaseMembers(scope, baseList);
        }
    });

    pushScopeRegionMarker(scope, interfaceNode.nodeRange);
}

function hoistInterfaceMembers(
    scope: SymbolScope,
    interfaceNode: Node_Interface,
    analyzeQueue: AnalyzeQueue,
    hoistQueue: HoistQueue
) {
    for (const member of interfaceNode.memberList) {
        if (member.nodeName === NodeName.VirtualProp) {
            hoistVirtualProp(scope, member, analyzeQueue, hoistQueue, true);
        } else if (member.nodeName === NodeName.InterfaceMethod) {
            hoistInterfaceMethod(scope, member, hoistQueue);
        }
    }
}

// **BNF** VAR ::= ['private' | 'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
function hoistVar(
    scope: SymbolScope,
    varNode: Node_Var,
    analyzeQueue: AnalyzeQueue,
    hoistQueue: HoistQueue,
    isInstanceMember: boolean
) {
    const variables = insertVariables(scope, undefined, varNode, isInstanceMember);
    hoistQueue.push(() => {
        let varType = analyzeType(scope, varNode.type);
        if (!varType?.isAutoType()) {
            for (const variable of variables) {
                variable.assignType(varType);
            }
        }

        const analyzeInitializers = () => {
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
                    varType = resolveAutoType(varType, initType, declaredVar.identifier);

                    for (const variable of variables) {
                        if (variable.type === undefined) {
                            variable.assignType(varType);
                        }
                    }
                }
            }
        };

        if (varType?.isAutoType()) {
            hoistQueue.push(analyzeInitializers);
        } else {
            analyzeQueue.push(analyzeInitializers);
        }
    });
}

// **BNF** IMPORT ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'

// **BNF** FUNCDEF ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
function hoistFuncDef(
    parentScope: SymbolScope,
    funcDef: Node_FuncDef,
    analyzeQueue: AnalyzeQueue,
    hoistQueue: HoistQueue
) {
    const symbol: FunctionSymbol = FunctionSymbol.create({
        identifierToken: funcDef.identifier,
        scopePath: parentScope.scopePath,
        returnType: undefined,
        parameterTypes: [],
        linkedNode: funcDef,
        functionScopePath: undefined,
        isInstanceMember: false,
        accessRestriction: undefined
    });
    if (parentScope.insertSymbolAndCheck(symbol) === false) {
        return;
    }

    hoistQueue.push(() => {
        symbol.assignReturnType(analyzeType(parentScope, funcDef.returnType));
    });

    hoistQueue.push(() => {
        symbol.assignParameterTypes(funcDef.paramList.map(param => analyzeType(parentScope, param.type)));

        checkDuplicateFunctionOverload(parentScope, symbol);
    });
}

// **BNF** VIRTUALPROP ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
function hoistVirtualProp(
    parentScope: SymbolScope,
    virtualProp: Node_VirtualProp,
    analyzeQueue: AnalyzeQueue,
    hoistQueue: HoistQueue,
    isInstanceMember: boolean
) {
    const type = analyzeType(parentScope, virtualProp.type);

    const identifier = virtualProp.identifier;
    const symbol: VariableSymbol = VariableSymbol.create({
        identifierToken: identifier,
        scopePath: parentScope.scopePath,
        type: type,
        isInstanceMember: isInstanceMember,
        accessRestriction: getAccessRestriction(virtualProp.accessor)
    });
    parentScope.insertSymbolAndCheck(symbol);

    const getter = virtualProp.getter;
    if (getter !== undefined && getter.statBlock !== undefined) {
        const getterScope = parentScope.insertScope(`get_${identifier.text}`, virtualProp);

        const statBlock = getter.statBlock;
        analyzeQueue.push(() => {
            analyzeStatBlock(getterScope, statBlock);
        });
    }

    const setter = virtualProp.setter;
    if (setter !== undefined && setter.statBlock !== undefined) {
        const setterScope = parentScope.insertScope(`set_${identifier.text}`, virtualProp);

        if (type !== undefined) {
            const valueVariable: VariableSymbol = VariableSymbol.create({
                identifierToken: builtinSetterValueToken,
                scopePath: parentScope.scopePath,
                type: new ResolvedType(type.typeOrFunc),
                isInstanceMember: false,
                accessRestriction: getAccessRestriction(virtualProp.accessor)
            });
            setterScope.insertSymbolAndCheck(valueVariable);
        }

        const statBlock = setter.statBlock;
        analyzeQueue.push(() => {
            analyzeStatBlock(setterScope, statBlock);
        });
    }
}

// **BNF** MIXIN ::= 'mixin' CLASS
function hoistMixin(parentScope: SymbolScope, mixin: Node_Mixin, analyzeQueue: AnalyzeQueue, hoistQueue: HoistQueue) {
    hoistClass(parentScope, mixin.mixinClass, true, analyzeQueue, hoistQueue);
}

// **BNF** INTERFACEMETHOD ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] FUNCATTR ';'
function hoistInterfaceMethod(parentScope: SymbolScope, intfMethod: Node_InterfaceMethod, hoistQueue: HoistQueue) {
    const symbol: FunctionSymbol = FunctionSymbol.create({
        identifierToken: intfMethod.identifier,
        scopePath: parentScope.scopePath,
        returnType: undefined,
        parameterTypes: [],
        linkedNode: intfMethod,
        functionScopePath: undefined, // TODO: Create a dummy function scope for the interface method because named arguments give reference
        isInstanceMember: true,
        accessRestriction: undefined
    });
    if (parentScope.insertSymbolAndCheck(symbol) === false) {
        return;
    }

    hoistQueue.push(() => {
        const returnType = analyzeType(parentScope, intfMethod.returnType);
        symbol.assignReturnType(returnType);

        // Check if the function is a virtual property setter or getter
        tryInsertVirtualSetterOrGetter(parentScope, intfMethod, symbol.returnType, true);

        symbol.assignParameterTypes(hoistParamList(parentScope, undefined, intfMethod.paramList));

        checkDuplicateFunctionOverload(parentScope, symbol);
    });
}

// **BNF** STATBLOCK ::= '{' {VAR | STATEMENT | USING} '}'

// **BNF** PARAMLIST ::= '(' ['void' | (PARAMETER {',' PARAMETER})] ')'
function hoistParamList(
    functionHolderScope: SymbolScope,
    functionScope: SymbolScope | undefined,
    paramList: Node_ParamList
) {
    assert(functionScope === undefined || functionScope.parentScope === functionHolderScope);

    const resolvedTypes: (ResolvedType | undefined)[] = [];
    for (const param of paramList) {
        resolvedTypes.push(hoistParameter(functionScope ?? functionHolderScope, param));
    }

    for (let i = 0; i < paramList.length; i++) {
        const param = paramList[i];
        if (param.identifier === undefined) {
            continue;
        }

        functionScope?.insertSymbolAndCheck(
            VariableSymbol.create({
                identifierToken: param.identifier,
                scopePath: functionScope.scopePath,
                type: resolvedTypes[i],
                isInstanceMember: false,
                accessRestriction: undefined
            })
        );
    }

    return resolvedTypes;
}

// **BNF** PARAMETER ::= TYPE TYPEMODIFIER [IDENTIFIER] ['...' | ('=' (EXPR | 'void'))]
function hoistParameter(scope: SymbolScope, parameter: Node_Parameter): ResolvedType | undefined {
    return analyzeType(scope, parameter.type);
}

// **BNF** TYPEMODIFIER ::= ['&' ['in' | 'out' | 'inout'] ['+'] ['if_handle_then_const']]
// **BNF** TYPE ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
// **BNF** INITLIST ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
// **BNF** SCOPE ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
// **BNF** DATATYPE ::= (IDENTIFIER | PRIMITIVETYPE | '?' | 'auto')
// **BNF** PRIMITIVETYPE ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
// **BNF** FUNCATTR ::= {'override' | 'final' | 'explicit' | 'property' | 'delete' | 'nodiscard'}
// **BNF** STATEMENT ::= (IF | FOR | FOREACH | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
// **BNF** SWITCH ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
// **BNF** BREAK ::= 'break' ';'
// **BNF** FOR ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
// **BNF** FOREACH ::= 'foreach' '(' TYPE IDENTIFIER {',' TYPE INDENTIFIER} ':' ASSIGN ')' STATEMENT
// **BNF** WHILE ::= 'while' '(' ASSIGN ')' STATEMENT
// **BNF** DOWHILE ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
// **BNF** IF ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
// **BNF** CONTINUE ::= 'continue' ';'
// **BNF** EXPRSTAT ::= [ASSIGN] ';'
// **BNF** TRY ::= 'try' STATBLOCK 'catch' STATBLOCK
// **BNF** RETURN ::= 'return' [ASSIGN] ';'
// **BNF** CASE ::= (('case' EXPR) | 'default') ':' {STATEMENT}
// **BNF** EXPR ::= EXPRTERM {EXPROP EXPRTERM}
// **BNF** EXPRTERM ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
// **BNF** EXPRVALUE ::= 'void' | CONSTRUCTORCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
// **BNF** CONSTRUCTORCALL ::= TYPE ARGLIST
// **BNF** EXPRPREOP ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'
// **BNF** EXPRPOSTOP ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ']') | ARGLIST | '++' | '--'
// **BNF** CAST ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
// **BNF** LAMBDA ::= 'function' '(' [LAMBDAPARAM {',' LAMBDAPARAM}] ')' STATBLOCK
// **BNF** LAMBDAPARAM ::= [TYPE TYPEMODIFIER] [IDENTIFIER]
// **BNF** LITERAL ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
// **BNF** FUNCCALL ::= SCOPE IDENTIFIER ARGLIST
// **BNF** VARACCESS ::= SCOPE IDENTIFIER
// **BNF** ARGLIST ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
// **BNF** ASSIGN ::= CONDITION [ ASSIGNOP ASSIGN ]
// **BNF** CONDITION ::= EXPR ['?' ASSIGN ':' ASSIGN]
// **BNF** EXPROP ::= MATHOP | COMPOP | LOGICOP | BITOP
// **BNF** BITOP ::= '&' | '|' | '^' | '<<' | '>>' | '>>>'
// **BNF** MATHOP ::= '+' | '-' | '*' | '/' | '%' | '**'
// **BNF** COMPOP ::= '==' | '!=' | '<' | '<=' | '>' | '>=' | 'is' | '!is'
// **BNF** LOGICOP ::= '&&' | '||' | '^^' | 'and' | 'or' | 'xor'
// **BNF** ASSIGNOP ::= '=' | '+=' | '-=' | '*=' | '/=' | '|=' | '&=' | '^=' | '%=' | '**=' | '<<=' | '>>=' | '>>>='

function collectBaseClassesAndDeivedClasses(
    scope: SymbolScope,
    baseClassSet: Set<string>,
    derivedClassList: TypeSymbol[]
) {
    for (const symbol of scope.symbolTable.values()) {
        if (symbol.isType()) {
            if (symbol.baseList.length >= 1) {
                derivedClassList.push(symbol);
            } else {
                baseClassSet.add(symbol.qualifiedIdentifier);
            }
        }
    }

    for (const childScope of scope.childScopeTable.values()) {
        if (childScope.isAnonymousScope() || childScope.isFunctionScope()) {
            continue;
        }

        collectBaseClassesAndDeivedClasses(childScope, baseClassSet, derivedClassList);
    }
}

function applyInheritanceBeforeHoist(globalScope: SymbolGlobalScope) {
    const resolvedClassSet: Set<string> = new Set();

    let unresolvedDerivedClassList: TypeSymbol[] = [];

    collectBaseClassesAndDeivedClasses(globalScope, resolvedClassSet, unresolvedDerivedClassList);

    // FIXME: Optimize?
    let nextList: TypeSymbol[] = [];
    for (;;) {
        for (const derivedClass of unresolvedDerivedClassList) {
            let resolveBaseClasses = true;
            for (const baseType of derivedClass.baseList) {
                if (baseType === undefined || baseType.typeOrFunc.isFunction()) {
                    continue;
                }

                if (resolvedClassSet.has(baseType.typeOrFunc.qualifiedIdentifier) === false) {
                    resolveBaseClasses = false;
                    break;
                }
            }

            if (resolveBaseClasses) {
                let scope = globalScope.resolveScope(derivedClass.scopePath)?.lookupScope(derivedClass.identifierText);
                if (scope === undefined) {
                    scope = globalScope
                        .resolveScope(derivedClass.scopePath)
                        ?.insertScope(derivedClass.identifierText, derivedClass.linkedNode);
                }

                if (scope !== undefined) {
                    copyBaseMembers(scope, derivedClass.baseList, false);

                    resolvedClassSet.add(derivedClass.qualifiedIdentifier);
                    continue;
                }
            }

            nextList.push(derivedClass);
        }

        if (nextList.length === 0 || nextList.length === unresolvedDerivedClassList.length) {
            // No more classes to resolve or no progress made
            break;
        } else {
            unresolvedDerivedClassList = nextList;
            nextList = [];
        }
    }
}

export function hoistAfterParse(ast: Node_Script, globalScope: SymbolGlobalScope): HoistResult {
    const analyzeQueue: AnalyzeQueue = [];
    const hoistQueue: HoistQueue = [];

    // At this stage, inheritance from classes included from other files has not yet been applied.
    // Therefore, the first step is to process that.
    applyInheritanceBeforeHoist(globalScope);

    // Hoist the declared symbols.
    hoistScript(globalScope, ast, analyzeQueue, hoistQueue);
    while (hoistQueue.length > 0) {
        const next = hoistQueue.shift();
        if (next !== undefined) {
            next();
        }
    }

    return {globalScope, analyzeQueue};
}

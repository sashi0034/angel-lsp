import {
    Node_ArgList,
    Node_Assign,
    Node_Break,
    Node_Case,
    Node_Cast,
    Node_Class,
    Node_Condition,
    Node_ConstructorCall,
    Node_Continue,
    Node_DataType,
    Node_DoWhile,
    Node_Enum,
    Node_Expr,
    Node_ExprPostOp,
    Node_ExprStat,
    Node_ExprTerm,
    Node_ExprValue,
    Node_For,
    Node_Func,
    Node_FuncCall,
    Node_FuncDef,
    Node_If,
    Node_Import,
    Node_InitList,
    Node_Interface,
    Node_InterfaceMethod,
    Node_Lambda,
    Node_LambdaParam,
    Node_Mixin,
    NodeName,
    Node_Namespace,
    Node_Parameter,
    Node_ParamList,
    Node_Return,
    Node_Scope,
    Node_Script,
    Node_StatBlock,
    Node_Statement,
    Node_Switch,
    Node_Try,
    Node_Type,
    Node_TypeDef,
    Node_Using,
    Node_Var,
    Node_VarAccess,
    Node_VirtualProp,
    Node_While,
    ReferenceModifier,
    voidParameter
} from '../compiler_parser/nodes';
import {FormatterState, isEditedWrapAt} from './formatterState';
import {TextEdit} from 'vscode-languageserver-types/lib/esm/main';
import {formatMoveToNonComment, formatMoveUntil, formatMoveUntilNodeStart, formatTargetBy} from './formatterDetail';
import {TokenObject} from '../compiler_tokenizer/tokenObject';

// **BNF** SCRIPT ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTUALPROP | VAR | FUNC | NAMESPACE | USING | ';'}
function formatScript(format: FormatterState, scriptNode: Node_Script) {
    for (const node of scriptNode) {
        const name = node.nodeName;

        if (name === NodeName.Import) {
            formatImport(format, node);
        } else if (name === NodeName.Enum) {
            formatEnum(format, node);
        } else if (name === NodeName.TypeDef) {
            formatTypeDef(format, node);
        } else if (name === NodeName.Class) {
            formatClass(format, node);
        } else if (name === NodeName.Mixin) {
            formatMixin(format, node);
        } else if (name === NodeName.Interface) {
            formatInterface(format, node);
        } else if (name === NodeName.FuncDef) {
            formatFuncDef(format, node);
        } else if (name === NodeName.VirtualProp) {
            formatVirtualProp(format, node);
        } else if (name === NodeName.Var) {
            formatVar(format, node);
        } else if (name === NodeName.Func) {
            formatFunc(format, node);
        } else if (name === NodeName.Namespace) {
            formatNamespace(format, node);
        } else if (name === NodeName.Using) {
            formatUsing(format, node);
        }
    }
}

// **BNF** NAMESPACE ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
function formatNamespace(format: FormatterState, namespaceNode: Node_Namespace) {
    formatMoveUntilNodeStart(format, namespaceNode);
    format.pushWrap();

    formatTargetBy(format, 'namespace', {});

    format.pushIndent();
    for (let i = 0; i < namespaceNode.namespaceList.length; i++) {
        if (i > 0) {
            formatTargetBy(format, '::', {condenseSides: true});
        }

        const namespaceIdentifier = namespaceNode.namespaceList[i];
        formatTargetBy(format, namespaceIdentifier.text, {});
    }

    format.popIndent();

    formatBraceBlock(format, () => {
        formatScript(format, namespaceNode.script);
    });
}

// **BNF** USING ::= 'using' 'namespace' IDENTIFIER ('::' IDENTIFIER)* ';'
function formatUsing(format: FormatterState, usingNode: Node_Using) {
    formatMoveUntilNodeStart(format, usingNode);
    format.pushWrap();

    formatTargetBy(format, 'using', {});

    formatTargetBy(format, 'namespace', {});

    for (let i = 0; i < usingNode.namespaceList.length; i++) {
        if (i > 0) {
            formatTargetBy(format, '::', {condenseSides: true});
        }

        const namespaceIdentifier = usingNode.namespaceList[i];
        formatTargetBy(format, namespaceIdentifier.text, {});
    }

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

function formatBraceBlock(format: FormatterState, action: () => void, isIndent: boolean = true) {
    if (formatTargetBy(format, '{', {connectTail: true}) === false) {
        return;
    }

    const startLine = format.getCursor().line;

    if (isIndent) {
        format.pushIndent();
    }

    action();

    if (isIndent) {
        format.popIndent();
    }

    const endWrap = startLine !== format.getCursor().line || isEditedWrapAt(format.getResult(), startLine);
    formatTargetBy(format, '}', {forceWrap: endWrap});
}

// **BNF** ENUM ::= {'shared' | 'external'} 'enum' IDENTIFIER [ ':' ('int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64') ] (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
function formatEnum(format: FormatterState, enumNode: Node_Enum) {
    formatMoveUntilNodeStart(format, enumNode);
    format.pushWrap();

    formatEntityModifier(format);

    formatTargetBy(format, 'enum', {});

    formatTargetBy(format, enumNode.identifier.text, {});

    formatBraceBlock(format, () => {
        for (let i = 0; i < enumNode.memberList.length; i++) {
            if (i > 0) {
                formatTargetBy(format, ',', {condenseLeft: true});
            }

            formatTargetBy(format, enumNode.memberList[i].identifier.text, {});

            const expr = enumNode.memberList[i].expr;
            if (expr !== undefined) {
                formatTargetBy(format, '=', {});
                formatExpr(format, expr);
            }
        }
    });
}

// **BNF** CLASS ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTUALPROP | FUNC | VAR | FUNCDEF} '}'))
function formatClass(format: FormatterState, classNode: Node_Class) {
    formatMoveUntilNodeStart(format, classNode);
    format.pushWrap();

    formatEntityModifier(format);

    formatTargetBy(format, 'class', {});

    formatTargetBy(format, classNode.identifier.text, {});

    if (formatMoveToNonComment(format)?.text === ';') {
        formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
    } else {
        formatBraceBlock(format, () => {
            for (const node of classNode.memberList) {
                if (node.nodeName === NodeName.VirtualProp) {
                    formatVirtualProp(format, node);
                } else if (node.nodeName === NodeName.FuncDef) {
                    formatFuncDef(format, node);
                } else if (node.nodeName === NodeName.Var) {
                    formatVar(format, node);
                } else if (node.nodeName === NodeName.Func) {
                    formatFunc(format, node);
                }
            }
        });
    }
}

// **BNF** TYPEDEF ::= 'typedef' PRIMITIVETYPE IDENTIFIER ';'
function formatTypeDef(format: FormatterState, typeDef: Node_TypeDef) {
    formatMoveUntilNodeStart(format, typeDef);
    format.pushWrap();

    formatTargetBy(format, 'typedef', {});

    formatTargetBy(format, typeDef.type.text, {});

    formatTargetBy(format, typeDef.identifier.text, {});

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// **BNF** FUNC ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST [LISTPATTERN] ['const'] FUNCATTR (';' | STATBLOCK)
function formatFunc(format: FormatterState, funcNode: Node_Func) {
    formatMoveUntilNodeStart(format, funcNode);
    format.pushWrap(); // TODO: Move to the caller?

    formatEntityModifier(format);
    formatAccessModifier(format);

    if (funcNode.head.tag === 'function') {
        formatType(format, funcNode.head.returnType);
        if (funcNode.head.isRef) {
            formatTargetBy(format, '&', {condenseLeft: true});
        }
    } else if (funcNode.head.tag === 'destructor') {
        formatTargetBy(format, '~', {condenseRight: true});
    }

    formatTargetBy(format, funcNode.identifier.text, {});

    formatTypeTemplates(format, funcNode.typeTemplates);

    formatParamList(format, funcNode.paramList);

    if (funcNode.isConst) {
        formatTargetBy(format, 'const', {});
    }

    formatFuncAttr(format);

    if (formatMoveToNonComment(format)?.text === ';') {
        formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
    } else {
        formatStatBlock(format, funcNode.statBlock);
    }
}

// {'shared' | 'abstract' | 'final' | 'external'}
function formatEntityModifier(format: FormatterState) {
    for (;;) {
        const next = formatMoveToNonComment(format);
        if (next === undefined) {
            return;
        }

        if (next.text === 'shared' || next.text === 'abstract' || next.text === 'final' || next.text === 'external') {
            formatTargetBy(format, next.text, {});
        } else {
            return;
        }
    }
}

// ['private' | 'protected']
function formatAccessModifier(format: FormatterState) {
    const next = formatMoveToNonComment(format);
    if (next === undefined) {
        return;
    }

    if (next.text === 'private' || next.text === 'protected') {
        formatTargetBy(format, next.text, {});
    }
}

// **BNF** LISTPATTERN ::= '{' LISTENTRY {',' LISTENTRY} '}'
// TODO: IMPLEMENT IT!

// **BNF** LISTENTRY ::= (('repeat' | 'repeat_same') (('{' LISTENTRY '}') | TYPE)) | (TYPE {',' TYPE})
// TODO: IMPLEMENT IT!

// **BNF** INTERFACE ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTUALPROP | INTERFACEMETHOD} '}'))
function formatInterface(format: FormatterState, interfaceNode: Node_Interface) {
    formatMoveUntilNodeStart(format, interfaceNode);
    format.pushWrap();

    formatEntityModifier(format);

    formatTargetBy(format, 'interface', {});

    formatTargetBy(format, interfaceNode.identifier.text, {});

    if (formatMoveToNonComment(format)?.text === ';') {
        formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
    } else {
        formatBraceBlock(format, () => {
            for (const node of interfaceNode.memberList) {
                if (node.nodeName === NodeName.VirtualProp) {
                    formatVirtualProp(format, node);
                } else if (node.nodeName === NodeName.InterfaceMethod) {
                    formatInterfaceMethod(format, node);
                }
            }
        });
    }
}

// **BNF** VAR ::= ['private' | 'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
function formatVar(format: FormatterState, varNode: Node_Var) {
    formatMoveUntilNodeStart(format, varNode);

    formatAccessModifier(format);

    formatType(format, varNode.type);

    for (let i = 0; i < varNode.variables.length; i++) {
        if (i > 0) {
            formatTargetBy(format, ',', {condenseLeft: true});
        }

        formatTargetBy(format, varNode.variables[i].identifier.text, {});

        const initializer = varNode.variables[i].initializer;
        if (initializer === undefined) {
            continue;
        }

        if (initializer.nodeName === NodeName.InitList) {
            formatTargetBy(format, '=', {});
            formatInitList(format, initializer);
        } else if (initializer.nodeName === NodeName.Assign) {
            format.pushIndent();

            formatTargetBy(format, '=', {});
            formatAssign(format, initializer);

            format.popIndent();
        } else {
            formatArgList(format, initializer);
        }
    }

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// **BNF** IMPORT ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
function formatImport(format: FormatterState, importNode: Node_Import) {
    formatMoveUntilNodeStart(format, importNode);
    format.pushWrap();

    formatTargetBy(format, 'import', {});

    formatType(format, importNode.type);

    if (importNode.isRef) {
        formatTargetBy(format, '&', {condenseLeft: true});
    }

    formatTargetBy(format, importNode.identifier.text, {});

    formatParamList(format, importNode.paramList);

    formatFuncAttr(format);

    formatTargetBy(format, 'from', {});

    formatTargetBy(format, importNode.path.text, {});

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// **BNF** FUNCDEF ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
function formatFuncDef(format: FormatterState, funcDef: Node_FuncDef) {
    formatMoveUntilNodeStart(format, funcDef);
    format.pushWrap();

    formatEntityModifier(format);

    formatTargetBy(format, 'funcdef', {});

    formatType(format, funcDef.returnType);

    if (funcDef.isRef) {
        formatTargetBy(format, '&', {condenseLeft: true});
    }

    formatTargetBy(format, funcDef.identifier.text, {});

    formatParamList(format, funcDef.paramList);

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// **BNF** VIRTUALPROP ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
function formatVirtualProp(format: FormatterState, virtualProp: Node_VirtualProp) {
    formatMoveUntilNodeStart(format, virtualProp);
    format.pushWrap();

    formatAccessModifier(format);

    formatType(format, virtualProp.type);

    if (virtualProp.isRef) {
        formatTargetBy(format, '&', {condenseLeft: true});
    }

    formatTargetBy(format, virtualProp.identifier.text, {});

    formatBraceBlock(format, () => {
        for (;;) {
            const getter = virtualProp.getter;
            const setter = virtualProp.setter;
            const next = formatMoveToNonComment(format);
            if (next?.text === 'get' && getter !== undefined) {
                formatTargetBy(format, 'get', {});
                formatGetterSetterStatement(format, getter.isConst, getter.statBlock);
            } else if (next?.text === 'set' && setter !== undefined) {
                formatTargetBy(format, 'set', {});
                formatGetterSetterStatement(format, setter.isConst, setter.statBlock);
            } else {
                break;
            }
        }
    });
}

// ['const'] FUNCATTR (STATBLOCK | ';')
function formatGetterSetterStatement(format: FormatterState, isConst: boolean, statBlock: Node_StatBlock | undefined) {
    if (isConst) {
        formatTargetBy(format, 'const', {});
    }

    formatFuncAttr(format);

    if (statBlock === undefined) {
        formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
    } else {
        formatStatBlock(format, statBlock);
    }
}

// **BNF** MIXIN ::= 'mixin' CLASS
function formatMixin(format: FormatterState, mixin: Node_Mixin) {
    formatMoveUntilNodeStart(format, mixin);
    format.pushWrap();

    formatTargetBy(format, 'mixin', {});

    formatClass(format, mixin.mixinClass);
}

// **BNF** INTERFACEMETHOD ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] FUNCATTR ';'
function formatInterfaceMethod(format: FormatterState, intfMethod: Node_InterfaceMethod) {
    formatMoveUntilNodeStart(format, intfMethod);
    format.pushWrap();

    formatType(format, intfMethod.returnType);

    if (intfMethod.isRef) {
        formatTargetBy(format, '&', {condenseLeft: true});
    }

    formatTargetBy(format, intfMethod.identifier.text, {});

    formatParamList(format, intfMethod.paramList);

    if (intfMethod.isConst) {
        formatTargetBy(format, 'const', {});
    }

    if (intfMethod.funcAttr) {
        formatFuncAttr(format);
    }

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// **BNF** STATBLOCK ::= '{' {VAR | STATEMENT | USING} '}'
function formatStatBlock(format: FormatterState, statBlock: Node_StatBlock) {
    formatMoveUntilNodeStart(format, statBlock);

    const isOneLine = statBlock.nodeRange.isOneLine();

    formatBraceBlock(format, () => {
        for (const statement of statBlock.statementList) {
            if (isOneLine === false) {
                format.pushWrap();
            }

            if (statement.nodeName === NodeName.Var) {
                formatVar(format, statement);
            } else if (statement.nodeName === NodeName.Using) {
                formatUsing(format, statement);
            } else {
                formatStatement(format, statement);
            }
        }
    });
}

// **BNF** PARAMLIST ::= '(' ['void' | (PARAMETER {',' PARAMETER})] ')'
function formatParamList(format: FormatterState, paramList: Node_ParamList) {
    formatParenthesesBlock(format, () => {
        if (paramList.length === 0 && formatMoveToNonComment(format)?.text === 'void') {
            formatTargetBy(format, 'void', {});
        }

        for (let i = 0; i < paramList.length; i++) {
            if (i > 0) {
                formatTargetBy(format, ',', {condenseLeft: true});
            }

            formatParameter(format, paramList[i]);
        }
    });
}

function formatParenthesesBlock(format: FormatterState, action: () => void, condenseLeft: boolean = true) {
    if (formatTargetBy(format, '(', {condenseLeft: condenseLeft, condenseRight: true}) === false) {
        return;
    }

    format.pushIndent();
    action();
    format.popIndent();

    formatTargetBy(format, ')', {condenseLeft: true});
}

// **BNF** PARAMETER ::= TYPE TYPEMODIFIER [IDENTIFIER] ['...' | ('=' (EXPR | 'void'))]
function formatParameter(format: FormatterState, parameter: Node_Parameter) {
    formatType(format, parameter.type);
    formatTypeModifier(format);

    if (parameter.identifier !== undefined) {
        formatTargetBy(format, parameter.identifier.text, {});
    }

    if (parameter.isVariadic) {
        formatTargetBy(format, '...', {});
    }

    const defaultExpr = parameter.defaultExpr;
    if (defaultExpr !== undefined) {
        formatTargetBy(format, '=', {});
        if (defaultExpr === voidParameter) {
            formatTargetBy(format, 'void', {});
        } else {
            formatExpr(format, defaultExpr);
        }
    }
}

// **BNF** TYPEMODIFIER ::= ['&' ['in' | 'out' | 'inout'] ['+'] ['if_handle_then_const']]
function formatTypeModifier(format: FormatterState) {
    const next = formatMoveToNonComment(format);
    if (next === undefined) {
        return;
    }

    if (next.text === '&') {
        formatTargetBy(format, '&', {condenseLeft: true});

        const next2 = formatMoveToNonComment(format);
        if (next2 === undefined) {
            return;
        }

        if (next2.text === 'in' || next2.text === 'out' || next2.text === 'inout') {
            formatTargetBy(format, next.text, {});
        }
    }
}

// **BNF** TYPE ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
function formatType(format: FormatterState, typeNode: Node_Type) {
    formatMoveUntilNodeStart(format, typeNode);

    if (typeNode.isConst) {
        formatTargetBy(format, 'const', {});
    }

    if (typeNode.scope !== undefined) {
        formatScope(format, typeNode.scope);
    }

    formatDataType(format, typeNode.dataType);

    formatTypeTemplates(format, typeNode.typeTemplates);

    if (typeNode.isArray) {
        formatTargetBy(format, '[', {condenseSides: true});
        formatTargetBy(format, ']', {condenseLeft: true});
    }

    if (typeNode.refModifier !== undefined) {
        formatTargetBy(format, '@', {condenseLeft: true});
        if (typeNode.refModifier === ReferenceModifier.RefConst) {
            formatTargetBy(format, 'const', {});
        }
    }
}

// ['<' TYPE {',' TYPE} '>']
function formatTypeTemplates(format: FormatterState, templates: Node_Type[]) {
    if (templates.length === 0) {
        return;
    }

    formatChevronsBlock(format, () => {
        for (let i = 0; i < templates.length; i++) {
            if (i > 0) {
                formatTargetBy(format, ',', {condenseLeft: true});
            }

            formatType(format, templates[i]);
        }
    });
}

function formatChevronsBlock(format: FormatterState, action: () => void) {
    if (formatTargetBy(format, '<', {condenseSides: true}) === false) {
        return;
    }

    format.pushIndent();

    action();

    format.popIndent();
    formatTargetBy(format, '>', {condenseLeft: true});
}

// **BNF** INITLIST ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
function formatInitList(format: FormatterState, initList: Node_InitList) {
    formatMoveUntilNodeStart(format, initList);

    formatBraceBlock(format, () => {
        for (let i = 0; i < initList.initList.length; i++) {
            if (i > 0) {
                formatTargetBy(format, ',', {condenseLeft: true});
            }

            const item = initList.initList[i];
            if (item.nodeName === NodeName.InitList) {
                formatInitList(format, item);
            } else {
                formatAssign(format, item);
            }
        }
    });
}

// **BNF** SCOPE ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
function formatScope(format: FormatterState, scope: Node_Scope) {
    formatMoveUntilNodeStart(format, scope);

    if (scope.isGlobal) {
        formatTargetBy(format, '::', {condenseSides: true});
    }

    for (let i = 0; i < scope.scopeList.length; i++) {
        const scopeIdentifier = scope.scopeList[i];
        formatTargetBy(format, scopeIdentifier.text, {});
        formatTargetBy(format, '::', {condenseSides: true});
    }
}

// **BNF** DATATYPE ::= (IDENTIFIER | PRIMITIVETYPE | '?' | 'auto')
function formatDataType(format: FormatterState, dataType: Node_DataType) {
    formatMoveUntilNodeStart(format, dataType);

    formatTargetBy(format, dataType.identifier.text, {});
}

// **BNF** PRIMITIVETYPE ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'

// **BNF** FUNCATTR ::= {'override' | 'final' | 'explicit' | 'property' | 'delete' | 'nodiscard'}
function formatFuncAttr(format: FormatterState) {
    for (;;) {
        const next = formatMoveToNonComment(format);
        if (next === undefined) {
            return;
        }

        if (next.text === 'override' || next.text === 'final' || next.text === 'explicit' || next.text === 'property') {
            formatTargetBy(format, next.text, {});
        } else {
            return;
        }
    }
}

// **BNF** STATEMENT ::= (IF | FOR | FOREACH | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
function formatStatement(format: FormatterState, statement: Node_Statement, canIndent: boolean = false) {
    const isIndented = canIndent && statement.nodeName !== NodeName.StatBlock;
    if (isIndented) {
        format.pushIndent();
    }

    switch (statement.nodeName) {
        case NodeName.If:
            formatIf(format, statement);
            break;
        case NodeName.For:
            formatFor(format, statement);
            break;
        case NodeName.While:
            formatWhile(format, statement);
            break;
        case NodeName.Return:
            formatReturn(format, statement);
            break;
        case NodeName.StatBlock:
            formatStatBlock(format, statement);
            break;
        case NodeName.Break:
            formatBreak(format, statement);
            break;
        case NodeName.Continue:
            formatContinue(format, statement);
            break;
        case NodeName.DoWhile:
            formatDoWhile(format, statement);
            break;
        case NodeName.Switch:
            formatSwitch(format, statement);
            break;
        case NodeName.ExprStat:
            formatExprStat(format, statement);
            break;
        case NodeName.Try:
            formatTry(format, statement);
            break;
    }

    if (isIndented) {
        format.popIndent();
    }
}

// **BNF** SWITCH ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
function formatSwitch(format: FormatterState, switchNode: Node_Switch) {
    formatMoveUntilNodeStart(format, switchNode);

    formatTargetBy(format, 'switch', {});

    formatParenthesesBlock(format, () => {
        formatAssign(format, switchNode.assign);
    });

    formatBraceBlock(
        format,
        () => {
            for (const caseNode of switchNode.caseList) {
                formatCase(format, caseNode);
            }
        },
        false
    );
}

// **BNF** BREAK ::= 'break' ';'
function formatBreak(format: FormatterState, breakNode: Node_Break) {
    formatMoveUntilNodeStart(format, breakNode);

    formatTargetBy(format, 'break', {});

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// **BNF** FOR ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
function formatFor(format: FormatterState, forNode: Node_For) {
    formatMoveUntilNodeStart(format, forNode);

    formatTargetBy(format, 'for', {});

    formatParenthesesBlock(
        format,
        () => {
            if (forNode.initial.nodeName === NodeName.Var) {
                formatVar(format, forNode.initial);
            } else {
                formatExprStat(format, forNode.initial);
            }

            if (forNode.condition !== undefined) {
                formatExprStat(format, forNode.condition);
            }

            for (const increment of forNode.incrementList) {
                formatAssign(format, increment);
            }
        },
        false
    );

    if (forNode.statement !== undefined) {
        formatStatement(format, forNode.statement, true);
    }
}
// **BNF** FOREACH ::= 'foreach' '(' TYPE IDENTIFIER {',' TYPE INDENTIFIER} ':' ASSIGN ')' STATEMENT
// TODO: IMPLEMENT IT!

// **BNF** WHILE ::= 'while' '(' ASSIGN ')' STATEMENT
function formatWhile(format: FormatterState, whileNode: Node_While) {
    formatMoveUntilNodeStart(format, whileNode);

    formatTargetBy(format, 'while', {});

    formatParenthesesBlock(
        format,
        () => {
            formatAssign(format, whileNode.assign);
        },
        false
    );

    if (whileNode.statement !== undefined) {
        formatStatement(format, whileNode.statement, true);
    }
}

// **BNF** DOWHILE ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
function formatDoWhile(format: FormatterState, doWhile: Node_DoWhile) {
    formatMoveUntilNodeStart(format, doWhile);

    formatTargetBy(format, 'do', {});

    if (doWhile.statement !== undefined) {
        formatStatement(format, doWhile.statement, true);
    }

    formatTargetBy(format, 'while', {connectTail: true});

    formatParenthesesBlock(
        format,
        () => {
            if (doWhile.assign !== undefined) {
                formatAssign(format, doWhile.assign);
            }
        },
        false
    );

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// **BNF** IF ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
function formatIf(format: FormatterState, ifNode: Node_If) {
    formatMoveUntilNodeStart(format, ifNode);

    formatTargetBy(format, 'if', {});

    formatParenthesesBlock(
        format,
        () => {
            formatAssign(format, ifNode.condition);
        },
        false
    );

    if (ifNode.thenStat !== undefined) {
        formatStatement(format, ifNode.thenStat, true);
    }

    if (ifNode.elseStat !== undefined) {
        formatTargetBy(format, 'else', {connectTail: true});
        formatStatement(format, ifNode.elseStat, true);
    }
}

// **BNF** CONTINUE ::= 'continue' ';'
function formatContinue(format: FormatterState, continueNode: Node_Continue) {
    formatMoveUntilNodeStart(format, continueNode);
    formatTargetBy(format, 'continue', {});
    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// **BNF** EXPRSTAT ::= [ASSIGN] ';'
function formatExprStat(format: FormatterState, exprStat: Node_ExprStat) {
    formatMoveUntilNodeStart(format, exprStat);

    if (exprStat.assign !== undefined) {
        formatAssign(format, exprStat.assign);
    }

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// **BNF** TRY ::= 'try' STATBLOCK 'catch' STATBLOCK
function formatTry(format: FormatterState, tryNode: Node_Try) {
    formatMoveUntilNodeStart(format, tryNode);

    formatTargetBy(format, 'try', {});

    formatStatBlock(format, tryNode.tryBlock);

    formatTargetBy(format, 'catch', {connectTail: true});

    if (tryNode.catchBlock !== undefined) {
        formatStatBlock(format, tryNode.catchBlock);
    }
}

// **BNF** RETURN ::= 'return' [ASSIGN] ';'
function formatReturn(format: FormatterState, returnNode: Node_Return) {
    formatMoveUntilNodeStart(format, returnNode);

    formatTargetBy(format, 'return', {});

    format.pushIndent();

    if (returnNode.assign !== undefined) {
        formatAssign(format, returnNode.assign);
    }

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});

    format.popIndent();
}

// **BNF** CASE ::= (('case' EXPR) | 'default') ':' {STATEMENT}
function formatCase(format: FormatterState, caseNode: Node_Case) {
    formatMoveUntilNodeStart(format, caseNode);

    if (caseNode.expr !== undefined) {
        formatTargetBy(format, 'case', {});
        formatExpr(format, caseNode.expr);
    } else {
        formatTargetBy(format, 'default', {});
    }

    formatTargetBy(format, ':', {condenseLeft: true, connectTail: true});

    format.pushIndent();
    for (const statement of caseNode.statementList) {
        formatStatement(format, statement, false);
    }

    format.popIndent();
}

// **BNF** EXPR ::= EXPRTERM {EXPROP EXPRTERM}
function formatExpr(format: FormatterState, exprNode: Node_Expr) {
    formatMoveUntilNodeStart(format, exprNode);

    formatExprTerm(format, exprNode.head);

    if (exprNode.tail !== undefined) {
        format.pushIndent();

        formatTargetBy(format, exprNode.tail.operator.text, {});

        formatExpr(format, exprNode.tail.expr);

        format.popIndent();
    }
}

// **BNF** EXPRTERM ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function formatExprTerm(format: FormatterState, exprTerm: Node_ExprTerm) {
    formatMoveUntilNodeStart(format, exprTerm);

    if (exprTerm.exprTerm === 1) {
        if (exprTerm.type !== undefined) {
            formatType(format, exprTerm.type);
        }

        formatTargetBy(format, '=', {});

        formatInitList(format, exprTerm.initList);
    } else if (exprTerm.exprTerm === 2) {
        for (let i = 0; i < exprTerm.preOps.length; i++) {
            formatTargetBy(format, exprTerm.preOps[i].text, {condenseRight: true});
        }

        formatExprValue(format, exprTerm.value);

        for (let i = 0; i < exprTerm.postOps.length; i++) {
            formatExprPostOp(format, exprTerm.postOps[i]);
        }
    }
}

// **BNF** EXPRVALUE ::= 'void' | CONSTRUCTORCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
function formatExprValue(format: FormatterState, exprValue: Node_ExprValue) {
    // formatMoveUntilNodeStart(formatter, exprValue);

    if (exprValue.nodeName === NodeName.ConstructorCall) {
        formatConstructorCall(format, exprValue);
    } else if (exprValue.nodeName === NodeName.FuncCall) {
        formatFuncCall(format, exprValue);
    } else if (exprValue.nodeName === NodeName.VarAccess) {
        formatVarAccess(format, exprValue);
    } else if (exprValue.nodeName === NodeName.Cast) {
        formatCast(format, exprValue);
    } else if (exprValue.nodeName === NodeName.Literal) {
        formatTargetBy(format, exprValue.value.text, {});
    } else if (exprValue.nodeName === NodeName.Assign) {
        formatParenthesesBlock(
            format,
            () => {
                formatAssign(format, exprValue);
            },
            false
        );
    } else if (exprValue.nodeName === NodeName.Lambda) {
        formatLambda(format, exprValue);
    }
}

// **BNF** CONSTRUCTORCALL ::= TYPE ARGLIST
function formatConstructorCall(format: FormatterState, ConstructorCall: Node_ConstructorCall) {
    formatMoveUntilNodeStart(format, ConstructorCall);

    formatType(format, ConstructorCall.type);

    formatArgList(format, ConstructorCall.argList);
}

// **BNF** EXPRPREOP ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// **BNF** EXPRPOSTOP ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ']') | ARGLIST | '++' | '--'
function formatExprPostOp(format: FormatterState, postOp: Node_ExprPostOp) {
    formatMoveUntilNodeStart(format, postOp);

    format.pushIndent();

    if (postOp.postOpPattern === 1) {
        formatTargetBy(format, '.', {condenseSides: true});

        if (postOp.member !== undefined) {
            if (postOp.member.access === 'method') {
                formatFuncCall(format, postOp.member.node);
            } else {
                formatTargetBy(format, postOp.member.token.text, {});
            }
        }
    } else if (postOp.postOpPattern === 2) {
        formatBracketsBlock(format, () => {
            for (let i = 0; i < postOp.indexingList.length; i++) {
                if (i > 0) {
                    formatTargetBy(format, ',', {condenseLeft: true});
                }

                const index = postOp.indexingList[i];
                if (index.identifier !== undefined) {
                    formatTargetBy(format, index.identifier.text, {});
                    formatTargetBy(format, ':', {condenseLeft: true, connectTail: true});
                }

                formatAssign(format, index.assign);
            }
        });
    } else if (postOp.postOpPattern === 3) {
        formatArgList(format, postOp.args);
    } else if (postOp.postOpPattern === 4) {
        formatTargetBy(format, postOp.operator, {condenseLeft: true});
    }

    format.popIndent();
}

function formatBracketsBlock(format: FormatterState, action: () => void) {
    if (formatTargetBy(format, '[', {condenseSides: true}) === false) {
        return;
    }

    format.pushIndent();
    action();
    format.popIndent();

    formatTargetBy(format, ']', {condenseLeft: true});
}

// **BNF** CAST ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
function formatCast(format: FormatterState, castNode: Node_Cast) {
    formatMoveUntilNodeStart(format, castNode);

    formatTargetBy(format, 'cast', {});

    formatChevronsBlock(format, () => {
        formatType(format, castNode.type);
    });

    formatParenthesesBlock(format, () => {
        formatAssign(format, castNode.assign);
    });
}

// **BNF** LAMBDA ::= 'function' '(' [LAMBDAPARAM {',' LAMBDAPARAM}] ')' STATBLOCK
function formatLambda(format: FormatterState, lambdaNode: Node_Lambda) {
    formatMoveUntilNodeStart(format, lambdaNode);

    formatTargetBy(format, 'function', {});

    formatParenthesesBlock(format, () => {
        for (let i = 0; i < lambdaNode.paramList.length; i++) {
            if (i > 0) {
                formatTargetBy(format, ',', {condenseLeft: true});
            }

            formatLambdaParam(format, lambdaNode.paramList[i]);
        }
    });

    if (lambdaNode.statBlock !== undefined) {
        formatStatBlock(format, lambdaNode.statBlock);
    }
}

// **BNF** LAMBDAPARAM ::= [TYPE TYPEMODIFIER] [IDENTIFIER]
function formatLambdaParam(format: FormatterState, param: Node_LambdaParam) {
    if (param.type !== undefined) {
        formatType(format, param.type);
    }

    formatTypeModifier(format);

    if (param.identifier !== undefined) {
        formatTargetBy(format, param.identifier.text, {});
    }
}

// **BNF** LITERAL ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'

// **BNF** FUNCCALL ::= SCOPE IDENTIFIER ARGLIST
function formatFuncCall(format: FormatterState, funcCall: Node_FuncCall) {
    formatMoveUntilNodeStart(format, funcCall);

    if (funcCall.scope !== undefined) {
        formatScope(format, funcCall.scope);
    }

    formatTargetBy(format, funcCall.identifier.text, {});

    if (funcCall.typeTemplates !== undefined) {
        formatTypeTemplates(format, funcCall.typeTemplates);
    }

    formatArgList(format, funcCall.argList);
}

// **BNF** VARACCESS ::= SCOPE IDENTIFIER
function formatVarAccess(format: FormatterState, varAccess: Node_VarAccess) {
    formatMoveUntilNodeStart(format, varAccess);

    if (varAccess.scope !== undefined) {
        formatScope(format, varAccess.scope);
    }

    if (varAccess.identifier !== undefined) {
        formatTargetBy(format, varAccess.identifier.text, {});
    }
}

// **BNF** ARGLIST ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
function formatArgList(format: FormatterState, argListNode: Node_ArgList) {
    formatMoveUntilNodeStart(format, argListNode);

    formatParenthesesBlock(format, () => {
        for (let i = 0; i < argListNode.argList.length; i++) {
            if (i > 0) {
                formatTargetBy(format, ',', {condenseLeft: true});
            }

            const arg = argListNode.argList[i];
            if (arg.identifier !== undefined) {
                formatTargetBy(format, arg.identifier.text, {});
                formatTargetBy(format, ':', {condenseLeft: true, connectTail: true});
            }

            formatAssign(format, arg.assign);
        }
    });
}

// **BNF** ASSIGN ::= CONDITION [ ASSIGNOP ASSIGN ]
function formatAssign(format: FormatterState, assignNode: Node_Assign) {
    formatMoveUntilNodeStart(format, assignNode);

    formatCondition(format, assignNode.condition);

    if (assignNode.tail !== undefined) {
        formatTargetBy(format, assignNode.tail.operator.text, {});

        formatAssign(format, assignNode.tail.assign);
    }
}

// **BNF** CONDITION ::= EXPR ['?' ASSIGN ':' ASSIGN]
function formatCondition(format: FormatterState, condition: Node_Condition) {
    formatMoveUntilNodeStart(format, condition);

    formatExpr(format, condition.expr);

    if (condition.ternary !== undefined) {
        format.pushIndent();

        formatTargetBy(format, '?', {});
        formatAssign(format, condition.ternary.trueAssign);

        formatTargetBy(format, ':', {});
        formatAssign(format, condition.ternary.falseAssign);

        format.popIndent();
    }
}

// **BNF** EXPROP ::= MATHOP | COMPOP | LOGICOP | BITOP
// **BNF** BITOP ::= '&' | '|' | '^' | '<<' | '>>' | '>>>'
// **BNF** MATHOP ::= '+' | '-' | '*' | '/' | '%' | '**'
// **BNF** COMPOP ::= '==' | '!=' | '<' | '<=' | '>' | '>=' | 'is' | '!is'
// **BNF** LOGICOP ::= '&&' | '||' | '^^' | 'and' | 'or' | 'xor'
// **BNF** ASSIGNOP ::= '=' | '+=' | '-=' | '*=' | '/=' | '|=' | '&=' | '^=' | '%=' | '**=' | '<<=' | '>>=' | '>>>='
// **BNF** IDENTIFIER ::= single token:  starts with letter or _, can include any letter and digit, same as in C++
// **BNF** NUMBER ::= single token:  includes integers and real numbers, same as C++
// **BNF** STRING ::= single token:  single quoted ', double quoted ", or heredoc multi-line string """
// **BNF** BITS ::= single token:  binary 0b or 0B, octal 0o or 0O, decimal 0d or 0D, hexadecimal 0x or 0X
// **BNF** COMMENT ::= single token:  starts with // and ends with new line or starts with /* and ends with */
// **BNF** WHITESPACE ::= single token:  spaces, tab, carriage return, line feed, and UTF8 byte-order-mark

export function formatFile(content: string, tokens: TokenObject[], ast: Node_Script): TextEdit[] {
    const format = new FormatterState(content, tokens, ast);
    formatScript(format, ast);

    formatMoveUntil(format, {line: format.textLines.length, character: 0});

    return format.getResult();
}

import {
    funcHeadDestructor,
    isFuncHeadReturnValue,
    NodeArgList,
    NodeAssign, NodeBreak, NodeCase,
    NodeCast, NodeClass,
    NodeCondition,
    NodeConstructCall,
    NodeContinue,
    NodeDataType, NodeDoWhile, NodeEnum,
    NodeExpr,
    NodeExprPostOp,
    NodeExprStat,
    NodeExprTerm,
    NodeExprValue,
    NodeFor,
    NodeFunc, NodeFuncCall, NodeFuncDef,
    NodeIf, NodeImport,
    NodeInitList, NodeInterface, NodeIntfMethod,
    NodeLambda, NodeMixin,
    NodeName,
    NodeNamespace,
    NodeParamList, NodeReturn,
    NodeScope,
    NodeScript,
    NodeStatBlock,
    NodeStatement, NodeSwitch, NodeTry,
    NodeType, NodeTypeDef, NodeUsing,
    NodeVar,
    NodeVarAccess, NodeVirtualProp,
    NodeWhile,
    ReferenceModifier
} from "../compiler_parser/nodes";
import {FormatterState, isEditedWrapAt} from "./formatterState";
import {TextEdit} from "vscode-languageserver-types/lib/esm/main";
import {formatMoveToNonComment, formatMoveUntil, formatMoveUntilNodeStart, formatTargetBy} from "./formatterDetail";
import {TokenObject} from "../compiler_tokenizer/tokenObject";

// BNF: SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | USING | ';'}
function formatScript(format: FormatterState, nodeScript: NodeScript) {
    for (const node of nodeScript) {
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

// BNF: USING         ::= 'using' 'namespace' IDENTIFIER ('::' IDENTIFIER)* ';'
function formatUsing(format: FormatterState, nodeUsing: NodeUsing) {
    formatMoveUntilNodeStart(format, nodeUsing);
    format.pushWrap();

    formatTargetBy(format, 'using', {});

    formatTargetBy(format, 'namespace', {});

    for (let i = 0; i < nodeUsing.namespaceList.length; i++) {
        if (i > 0) formatTargetBy(format, '::', {condenseSides: true});

        const namespaceIdentifier = nodeUsing.namespaceList[i];
        formatTargetBy(format, namespaceIdentifier.text, {});
    }

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// BNF: NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
function formatNamespace(format: FormatterState, nodeNamespace: NodeNamespace) {
    formatMoveUntilNodeStart(format, nodeNamespace);
    format.pushWrap();

    formatTargetBy(format, 'namespace', {});

    format.pushIndent();
    for (let i = 0; i < nodeNamespace.namespaceList.length; i++) {
        if (i > 0) formatTargetBy(format, '::', {condenseSides: true});

        const namespaceIdentifier = nodeNamespace.namespaceList[i];
        formatTargetBy(format, namespaceIdentifier.text, {});
    }
    format.popIndent();

    formatBraceBlock(format, () => {
        formatScript(format, nodeNamespace.script);
    });
}

function formatBraceBlock(format: FormatterState, action: () => void, isIndent: boolean = true) {
    if (formatTargetBy(format, '{', {connectTail: true}) === false) return;

    const startLine = format.getCursor().line;

    if (isIndent) format.pushIndent();

    action();

    if (isIndent) format.popIndent();

    const endWrap = startLine !== format.getCursor().line || isEditedWrapAt(format.getResult(), startLine);
    formatTargetBy(format, '}', {forceWrap: endWrap});
}

// BNF: ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER [ ':' ('int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64') ] (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
function formatEnum(format: FormatterState, nodeEnum: NodeEnum) {
    formatMoveUntilNodeStart(format, nodeEnum);
    format.pushWrap();

    formatEntityModifier(format);

    formatTargetBy(format, 'enum', {});

    formatTargetBy(format, nodeEnum.identifier.text, {});

    formatBraceBlock(format, () => {
        for (let i = 0; i < nodeEnum.memberList.length; i++) {
            if (i > 0) formatTargetBy(format, ',', {condenseLeft: true});

            formatTargetBy(format, nodeEnum.memberList[i].identifier.text, {});

            const expr = nodeEnum.memberList[i].expr;
            if (expr !== undefined) {
                formatTargetBy(format, '=', {});
                formatExpr(format, expr);
            }
        }
    });
}

// BNF: CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
function formatClass(format: FormatterState, nodeClass: NodeClass) {
    formatMoveUntilNodeStart(format, nodeClass);
    format.pushWrap();

    formatEntityModifier(format);

    formatTargetBy(format, 'class', {});

    formatTargetBy(format, nodeClass.identifier.text, {});

    if (formatMoveToNonComment(format)?.text === ';') {
        formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
    } else {
        formatBraceBlock(format, () => {
            for (const node of nodeClass.memberList) {
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

// BNF: TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'
function formatTypeDef(format: FormatterState, typeDef: NodeTypeDef) {
    formatMoveUntilNodeStart(format, typeDef);
    format.pushWrap();

    formatTargetBy(format, 'typedef', {});

    formatTargetBy(format, typeDef.type.text, {});

    formatTargetBy(format, typeDef.identifier.text, {});

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// BNF: FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST [LISTPATTERN] ['const'] FUNCATTR (';' | STATBLOCK)
function formatFunc(format: FormatterState, nodeFunc: NodeFunc) {
    formatMoveUntilNodeStart(format, nodeFunc);
    format.pushWrap(); // TODO: Move to the caller?

    formatEntityModifier(format);
    formatAccessModifier(format);

    if (isFuncHeadReturnValue(nodeFunc.head)) {
        formatType(format, nodeFunc.head.returnType);
        if (nodeFunc.head.isRef) formatTargetBy(format, '&', {condenseLeft: true});
    } else if (nodeFunc.head === funcHeadDestructor) {
        formatTargetBy(format, '~', {condenseRight: true});
    }

    formatTargetBy(format, nodeFunc.identifier.text, {});

    formatParamList(format, nodeFunc.paramList);

    if (nodeFunc.isConst) formatTargetBy(format, 'const', {});

    formatFuncAttr(format);

    if (formatMoveToNonComment(format)?.text === ';') {
        formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
    } else {
        formatStatBlock(format, nodeFunc.statBlock);
    }
}

// {'shared' | 'abstract' | 'final' | 'external'}
function formatEntityModifier(format: FormatterState) {
    for (; ;) {
        const next = formatMoveToNonComment(format);
        if (next === undefined) return;
        if (next.text === 'shared' || next.text === 'abstract' || next.text === 'final' || next.text === 'external') {
            formatTargetBy(format, next.text, {});
        } else return;
    }
}

// ['private' | 'protected']
function formatAccessModifier(format: FormatterState) {
    const next = formatMoveToNonComment(format);
    if (next === undefined) return;
    if (next.text === 'private' || next.text === 'protected') {
        formatTargetBy(format, next.text, {});
    }
}

// BNF: INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))
function formatInterface(format: FormatterState, nodeInterface: NodeInterface) {
    formatMoveUntilNodeStart(format, nodeInterface);
    format.pushWrap();

    formatEntityModifier(format);

    formatTargetBy(format, 'interface', {});

    formatTargetBy(format, nodeInterface.identifier.text, {});

    if (formatMoveToNonComment(format)?.text === ';') {
        formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
    } else {
        formatBraceBlock(format, () => {
            for (const node of nodeInterface.memberList) {
                if (node.nodeName === NodeName.VirtualProp) {
                    formatVirtualProp(format, node);
                } else if (node.nodeName === NodeName.IntfMethod) {
                    formatIntfMethod(format, node);
                }
            }
        });
    }
}

// BNF: VAR           ::= ['private' | 'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
function formatVar(format: FormatterState, nodeVar: NodeVar) {
    formatMoveUntilNodeStart(format, nodeVar);

    formatAccessModifier(format);

    formatType(format, nodeVar.type);

    for (let i = 0; i < nodeVar.variables.length; i++) {
        if (i > 0) formatTargetBy(format, ',', {condenseLeft: true});

        formatTargetBy(format, nodeVar.variables[i].identifier.text, {});

        const initializer = nodeVar.variables[i].initializer;
        if (initializer === undefined) continue;
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

// BNF: IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
function formatImport(format: FormatterState, nodeImport: NodeImport) {
    formatMoveUntilNodeStart(format, nodeImport);
    format.pushWrap();

    formatTargetBy(format, 'import', {});

    formatType(format, nodeImport.type);

    if (nodeImport.isRef) formatTargetBy(format, '&', {condenseLeft: true});

    formatTargetBy(format, nodeImport.identifier.text, {});

    formatParamList(format, nodeImport.paramList);

    formatFuncAttr(format);

    formatTargetBy(format, 'from', {});

    formatTargetBy(format, nodeImport.path.text, {});

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// BNF: FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
function formatFuncDef(format: FormatterState, funcDef: NodeFuncDef) {
    formatMoveUntilNodeStart(format, funcDef);
    format.pushWrap();

    formatEntityModifier(format);

    formatTargetBy(format, 'funcdef', {});

    formatType(format, funcDef.returnType);

    if (funcDef.isRef) formatTargetBy(format, '&', {condenseLeft: true});

    formatTargetBy(format, funcDef.identifier.text, {});

    formatParamList(format, funcDef.paramList);

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// BNF: VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
function formatVirtualProp(format: FormatterState, virtualProp: NodeVirtualProp) {
    formatMoveUntilNodeStart(format, virtualProp);
    format.pushWrap();

    formatAccessModifier(format);

    formatType(format, virtualProp.type);

    if (virtualProp.isRef) formatTargetBy(format, '&', {condenseLeft: true});

    formatTargetBy(format, virtualProp.identifier.text, {});

    formatBraceBlock(format, () => {
        for (; ;) {
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
function formatGetterSetterStatement(format: FormatterState, isConst: boolean, statBlock: NodeStatBlock | undefined) {
    if (isConst) formatTargetBy(format, 'const', {});

    formatFuncAttr(format);

    if (statBlock === undefined) {
        formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
    } else {
        formatStatBlock(format, statBlock);
    }
}

// BNF: MIXIN         ::= 'mixin' CLASS
function formatMixin(format: FormatterState, mixin: NodeMixin) {
    formatMoveUntilNodeStart(format, mixin);
    format.pushWrap();

    formatTargetBy(format, 'mixin', {});

    formatClass(format, mixin.mixinClass);
}

// BNF: INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] FUNCATTR ';'
function formatIntfMethod(format: FormatterState, intfMethod: NodeIntfMethod) {
    formatMoveUntilNodeStart(format, intfMethod);
    format.pushWrap();

    formatType(format, intfMethod.returnType);

    if (intfMethod.isRef) formatTargetBy(format, '&', {condenseLeft: true});

    formatTargetBy(format, intfMethod.identifier.text, {});

    formatParamList(format, intfMethod.paramList);

    if (intfMethod.isConst) formatTargetBy(format, 'const', {});

    if (intfMethod.funcAttr) formatFuncAttr(format);

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// BNF: STATBLOCK     ::= '{' {VAR | STATEMENT | USING} '}'
function formatStatBlock(format: FormatterState, statBlock: NodeStatBlock) {
    formatMoveUntilNodeStart(format, statBlock);

    const isOneLine = statBlock.nodeRange.isOneLine();

    formatBraceBlock(format, () => {
        for (const statement of statBlock.statementList) {
            if (isOneLine === false) format.pushWrap();

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

// BNF: PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' [EXPR | 'void']] {',' TYPE TYPEMOD [IDENTIFIER] ['...' | ('=' [EXPR | 'void'])]})] ')'
function formatParamList(format: FormatterState, paramList: NodeParamList) {
    formatParenthesesBlock(format, () => {
        if (paramList.length === 0 && formatMoveToNonComment(format)?.text === 'void') {
            formatTargetBy(format, 'void', {});
        }

        for (let i = 0; i < paramList.length; i++) {
            if (i > 0) formatTargetBy(format, ',', {condenseLeft: true});
            formatType(format, paramList[i].type);
            formatTypeMod(format);

            const identifier = paramList[i].identifier;
            if (identifier !== undefined) {
                formatTargetBy(format, identifier.text, {});
            }

            const defaultExpr = paramList[i].defaultExpr;
            // TODO format void?
            if (defaultExpr !== undefined && defaultExpr.nodeName !== NodeName.ExprVoid) {
                formatTargetBy(format, '=', {});
                formatExpr(format, defaultExpr);
            }
        }
    });
}

function formatParenthesesBlock(format: FormatterState, action: () => void, condenseLeft: boolean = true) {
    if (formatTargetBy(format, '(', {condenseLeft: condenseLeft, condenseRight: true}) === false) return;

    format.pushIndent();
    action();
    format.popIndent();

    formatTargetBy(format, ')', {condenseLeft: true});
}

// BNF: TYPEMOD       ::= ['&' ['in' | 'out' | 'inout'] ['+'] ['if_handle_then_const']]
function formatTypeMod(format: FormatterState) {
    const next = formatMoveToNonComment(format);
    if (next === undefined) return;
    if (next.text === '&') {
        formatTargetBy(format, '&', {condenseLeft: true});

        const next2 = formatMoveToNonComment(format);
        if (next2 === undefined) return;
        if (next2.text === 'in' || next2.text === 'out' || next2.text === 'inout') {
            formatTargetBy(format, next.text, {});
        }
    }
}

// BNF: TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
function formatType(format: FormatterState, nodeType: NodeType) {
    formatMoveUntilNodeStart(format, nodeType);

    if (nodeType.isConst) formatTargetBy(format, 'const', {});

    if (nodeType.scope !== undefined) formatScope(format, nodeType.scope);

    formatDataType(format, nodeType.dataType);

    formatTypeTemplates(format, nodeType.typeTemplates);

    if (nodeType.isArray) {
        formatTargetBy(format, '[', {condenseSides: true});
        formatTargetBy(format, ']', {condenseLeft: true});
    }

    if (nodeType.refModifier !== undefined) {
        formatTargetBy(format, '@', {condenseLeft: true});
        if (nodeType.refModifier === ReferenceModifier.AtConst) {
            formatTargetBy(format, 'const', {});
        }
    }
}

// ['<' TYPE {',' TYPE} '>']
function formatTypeTemplates(format: FormatterState, templates: NodeType[]) {
    if (templates.length === 0) return;

    formatChevronsBlock(format, () => {
        for (let i = 0; i < templates.length; i++) {
            if (i > 0) formatTargetBy(format, ',', {condenseLeft: true});
            formatType(format, templates[i]);
        }
    });
}

function formatChevronsBlock(format: FormatterState, action: () => void) {
    if (formatTargetBy(format, '<', {condenseSides: true}) === false) return;
    format.pushIndent();

    action();

    format.popIndent();
    formatTargetBy(format, '>', {condenseLeft: true});
}

// BNF: INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
function formatInitList(format: FormatterState, initList: NodeInitList) {
    formatMoveUntilNodeStart(format, initList);

    formatBraceBlock(format, () => {
        for (let i = 0; i < initList.initList.length; i++) {
            if (i > 0) formatTargetBy(format, ',', {condenseLeft: true});

            const item = initList.initList[i];
            if (item.nodeName === NodeName.InitList) {
                formatInitList(format, item);
            } else {
                formatAssign(format, item);
            }
        }
    });
}

// BNF: SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
function formatScope(format: FormatterState, scope: NodeScope) {
    formatMoveUntilNodeStart(format, scope);

    if (scope.isGlobal) formatTargetBy(format, '::', {condenseSides: true});

    for (let i = 0; i < scope.scopeList.length; i++) {
        const scopeIdentifier = scope.scopeList[i];
        formatTargetBy(format, scopeIdentifier.text, {});
        formatTargetBy(format, '::', {condenseSides: true});
    }
}

// BNF: DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
function formatDataType(format: FormatterState, dataType: NodeDataType) {
    formatMoveUntilNodeStart(format, dataType);

    formatTargetBy(format, dataType.identifier.text, {});
}

// BNF: PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'

// BNF: FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property' | 'delete' | 'nodiscard'}
function formatFuncAttr(format: FormatterState) {
    for (; ;) {
        const next = formatMoveToNonComment(format);
        if (next === undefined) return;
        if (next.text === 'override' || next.text === 'final' || next.text === 'explicit' || next.text === 'property') {
            formatTargetBy(format, next.text, {});
        } else return;
    }
}

// BNF: STATEMENT     ::= (IF | FOR | FOREACH | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
function formatStatement(format: FormatterState, statement: NodeStatement, canIndent: boolean = false) {
    const isIndented = canIndent && statement.nodeName !== NodeName.StatBlock;
    if (isIndented) format.pushIndent();

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

    if (isIndented) format.popIndent();
}

// BNF: SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
function formatSwitch(format: FormatterState, nodeSwitch: NodeSwitch) {
    formatMoveUntilNodeStart(format, nodeSwitch);

    formatTargetBy(format, 'switch', {});

    formatParenthesesBlock(format, () => {
        formatAssign(format, nodeSwitch.assign);
    });

    formatBraceBlock(format, () => {
        for (const nodeCase of nodeSwitch.caseList) {
            formatCase(format, nodeCase);
        }
    }, false);
}

// BNF: BREAK         ::= 'break' ';'
function formatBreak(format: FormatterState, nodeBreak: NodeBreak) {
    formatMoveUntilNodeStart(format, nodeBreak);

    formatTargetBy(format, 'break', {});

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// BNF: FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
function formatFor(format: FormatterState, nodeFor: NodeFor) {
    formatMoveUntilNodeStart(format, nodeFor);

    formatTargetBy(format, 'for', {});

    formatParenthesesBlock(format, () => {
        if (nodeFor.initial.nodeName === NodeName.Var) {
            formatVar(format, nodeFor.initial);
        } else {
            formatExprStat(format, nodeFor.initial);
        }

        if (nodeFor.condition !== undefined) formatExprStat(format, nodeFor.condition);

        for (const increment of nodeFor.incrementList) {
            formatAssign(format, increment);
        }
    }, false);

    if (nodeFor.statement !== undefined) formatStatement(format, nodeFor.statement, true);
}

// BNF: WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
function formatWhile(format: FormatterState, nodeWhile: NodeWhile) {
    formatMoveUntilNodeStart(format, nodeWhile);

    formatTargetBy(format, 'while', {});

    formatParenthesesBlock(format, () => {
        formatAssign(format, nodeWhile.assign);
    }, false);

    if (nodeWhile.statement !== undefined) formatStatement(format, nodeWhile.statement, true);
}

// BNF: DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
function formatDoWhile(format: FormatterState, doWhile: NodeDoWhile) {
    formatMoveUntilNodeStart(format, doWhile);

    formatTargetBy(format, 'do', {});

    if (doWhile.statement !== undefined) formatStatement(format, doWhile.statement, true);

    formatTargetBy(format, 'while', {connectTail: true});

    formatParenthesesBlock(format, () => {
        if (doWhile.assign !== undefined) formatAssign(format, doWhile.assign);
    }, false);

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// BNF: IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
function formatIf(format: FormatterState, nodeIf: NodeIf) {
    formatMoveUntilNodeStart(format, nodeIf);

    formatTargetBy(format, 'if', {});

    formatParenthesesBlock(format, () => {
        formatAssign(format, nodeIf.condition);
    }, false);

    if (nodeIf.thenStat !== undefined) {
        formatStatement(format, nodeIf.thenStat, true);
    }

    if (nodeIf.elseStat !== undefined) {
        formatTargetBy(format, 'else', {connectTail: true});
        formatStatement(format, nodeIf.elseStat, true);
    }
}

// BNF: CONTINUE      ::= 'continue' ';'
function formatContinue(format: FormatterState, nodeContinue: NodeContinue) {
    formatMoveUntilNodeStart(format, nodeContinue);
    formatTargetBy(format, 'continue', {});
    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// BNF: EXPRSTAT      ::= [ASSIGN] ';'
function formatExprStat(format: FormatterState, exprStat: NodeExprStat) {
    formatMoveUntilNodeStart(format, exprStat);

    if (exprStat.assign !== undefined) formatAssign(format, exprStat.assign);

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// BNF: TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK
function formatTry(format: FormatterState, nodeTry: NodeTry) {
    formatMoveUntilNodeStart(format, nodeTry);

    formatTargetBy(format, 'try', {});

    formatStatBlock(format, nodeTry.tryBlock);

    formatTargetBy(format, 'catch', {connectTail: true});

    if (nodeTry.catchBlock !== undefined) formatStatBlock(format, nodeTry.catchBlock);
}

// BNF: RETURN        ::= 'return' [ASSIGN] ';'
function formatReturn(format: FormatterState, nodeReturn: NodeReturn) {
    formatMoveUntilNodeStart(format, nodeReturn);

    formatTargetBy(format, 'return', {});

    format.pushIndent();

    if (nodeReturn.assign !== undefined) {
        formatAssign(format, nodeReturn.assign);
    }

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});

    format.popIndent();
}

// BNF: CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
function formatCase(format: FormatterState, nodeCase: NodeCase) {
    formatMoveUntilNodeStart(format, nodeCase);

    if (nodeCase.expr !== undefined) {
        formatTargetBy(format, 'case', {});
        formatExpr(format, nodeCase.expr);
    } else {
        formatTargetBy(format, 'default', {});
    }

    formatTargetBy(format, ':', {condenseLeft: true, connectTail: true});

    format.pushIndent();
    for (const statement of nodeCase.statementList) {
        formatStatement(format, statement, false);
    }
    format.popIndent();
}

// BNF: EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
function formatExpr(format: FormatterState, nodeExpr: NodeExpr) {
    formatMoveUntilNodeStart(format, nodeExpr);

    formatExprTerm(format, nodeExpr.head);

    if (nodeExpr.tail !== undefined) {
        format.pushIndent();

        formatTargetBy(format, nodeExpr.tail.operator.text, {});

        formatExpr(format, nodeExpr.tail.expression);

        format.popIndent();
    }
}

// BNF: EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function formatExprTerm(format: FormatterState, exprTerm: NodeExprTerm) {
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

// BNF: EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
function formatExprValue(format: FormatterState, exprValue: NodeExprValue) {
    // formatMoveUntilNodeStart(formatter, exprValue);

    if (exprValue.nodeName === NodeName.ConstructCall) {
        formatConstructCall(format, exprValue);
    } else if (exprValue.nodeName === NodeName.FuncCall) {
        formatFuncCall(format, exprValue);
    } else if (exprValue.nodeName === NodeName.VarAccess) {
        formatVarAccess(format, exprValue);
    } else if (exprValue.nodeName === NodeName.Cast) {
        formatCast(format, exprValue);
    } else if (exprValue.nodeName === NodeName.Literal) {
        formatTargetBy(format, exprValue.value.text, {});
    } else if (exprValue.nodeName === NodeName.Assign) {
        formatParenthesesBlock(format, () => {
            formatAssign(format, exprValue);
        }, false);
    } else if (exprValue.nodeName === NodeName.Lambda) {
        formatLambda(format, exprValue);
    }
}

// BNF: CONSTRUCTCALL ::= TYPE ARGLIST
function formatConstructCall(format: FormatterState, constructCall: NodeConstructCall) {
    formatMoveUntilNodeStart(format, constructCall);

    formatType(format, constructCall.type);

    formatArgList(format, constructCall.argList);
}

// BNF: EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// BNF: EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ']') | ARGLIST | '++' | '--'
function formatExprPostOp(format: FormatterState, postOp: NodeExprPostOp) {
    formatMoveUntilNodeStart(format, postOp);

    format.pushIndent();

    if (postOp.postOp === 1) {
        formatTargetBy(format, '.', {condenseSides: true});

        if (postOp.member !== undefined) {
            if ('nodeName' in postOp.member) {
                formatFuncCall(format, postOp.member);
            } else {
                formatTargetBy(format, postOp.member.text, {});
            }
        }
    } else if (postOp.postOp === 2) {
        formatBracketsBlock(format, () => {
            for (let i = 0; i < postOp.indexingList.length; i++) {
                if (i > 0) formatTargetBy(format, ',', {condenseLeft: true});

                const index = postOp.indexingList[i];
                if (index.identifier !== undefined) {
                    formatTargetBy(format, index.identifier.text, {});
                    formatTargetBy(format, ':', {condenseLeft: true, connectTail: true});
                }

                formatAssign(format, index.assign);
            }
        });
    } else if (postOp.postOp === 3) {
        formatArgList(format, postOp.args);
    } else if (postOp.postOp === 4) {
        formatTargetBy(format, postOp.operator, {condenseLeft: true});
    }

    format.popIndent();
}

function formatBracketsBlock(format: FormatterState, action: () => void) {
    if (formatTargetBy(format, '[', {condenseSides: true}) === false) return;

    format.pushIndent();
    action();
    format.popIndent();

    formatTargetBy(format, ']', {condenseLeft: true});
}

// BNF: CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
function formatCast(format: FormatterState, nodeCast: NodeCast) {
    formatMoveUntilNodeStart(format, nodeCast);

    formatTargetBy(format, 'cast', {});

    formatChevronsBlock(format, () => {
        formatType(format, nodeCast.type);
    });

    formatParenthesesBlock(format, () => {
        formatAssign(format, nodeCast.assign);
    });
}

// BNF: LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
function formatLambda(format: FormatterState, nodeLambda: NodeLambda) {
    formatMoveUntilNodeStart(format, nodeLambda);

    formatTargetBy(format, 'function', {});

    formatParenthesesBlock(format, () => {
        for (let i = 0; i < nodeLambda.paramList.length; i++) {
            if (i > 0) formatTargetBy(format, ',', {condenseLeft: true});

            const param = nodeLambda.paramList[i];
            if (param.type !== undefined) formatType(format, param.type);
            formatTypeMod(format);

            if (param.identifier !== undefined) {
                formatTargetBy(format, param.identifier.text, {});
            }
        }
    });

    if (nodeLambda.statBlock !== undefined) formatStatBlock(format, nodeLambda.statBlock);
}

// BNF: LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'

// BNF: FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
function formatFuncCall(format: FormatterState, funcCall: NodeFuncCall) {
    formatMoveUntilNodeStart(format, funcCall);

    if (funcCall.scope !== undefined) {
        formatScope(format, funcCall.scope);
    }

    formatTargetBy(format, funcCall.identifier.text, {});

    formatArgList(format, funcCall.argList);
}

// BNF: VARACCESS     ::= SCOPE IDENTIFIER
function formatVarAccess(format: FormatterState, varAccess: NodeVarAccess) {
    formatMoveUntilNodeStart(format, varAccess);

    if (varAccess.scope !== undefined) {
        formatScope(format, varAccess.scope);
    }

    if (varAccess.identifier !== undefined) {
        formatTargetBy(format, varAccess.identifier.text, {});
    }
}

// BNF: ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
function formatArgList(format: FormatterState, nodeArgList: NodeArgList) {
    formatMoveUntilNodeStart(format, nodeArgList);

    formatParenthesesBlock(format, () => {
        for (let i = 0; i < nodeArgList.argList.length; i++) {
            if (i > 0) formatTargetBy(format, ',', {condenseLeft: true});

            const arg = nodeArgList.argList[i];
            if (arg.identifier !== undefined) {
                formatTargetBy(format, arg.identifier.text, {});
                formatTargetBy(format, ':', {condenseLeft: true, connectTail: true});
            }

            formatAssign(format, arg.assign);
        }
    });
}

// BNF: ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
function formatAssign(format: FormatterState, nodeAssign: NodeAssign) {
    formatMoveUntilNodeStart(format, nodeAssign);

    formatCondition(format, nodeAssign.condition);

    if (nodeAssign.tail !== undefined) {
        formatTargetBy(format, nodeAssign.tail.operator.text, {});

        formatAssign(format, nodeAssign.tail.assign);
    }
}

// BNF: CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
function formatCondition(format: FormatterState, condition: NodeCondition) {
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

// BNF: EXPROP        ::= MATHOP | COMPOP | LOGICOP | BITOP
// BNF: BITOP         ::= '&' | '|' | '^' | '<<' | '>>' | '>>>'
// BNF: MATHOP        ::= '+' | '-' | '*' | '/' | '%' | '**'
// BNF: COMPOP        ::= '==' | '!=' | '<' | '<=' | '>' | '>=' | 'is' | '!is'
// BNF: LOGICOP       ::= '&&' | '||' | '^^' | 'and' | 'or' | 'xor'
// BNF: ASSIGNOP      ::= '=' | '+=' | '-=' | '*=' | '/=' | '|=' | '&=' | '^=' | '%=' | '**=' | '<<=' | '>>=' | '>>>='
// BNF: IDENTIFIER    ::= single token:  starts with letter or _, can include any letter and digit, same as in C++
// BNF: NUMBER        ::= single token:  includes integers and real numbers, same as C++
// BNF: STRING        ::= single token:  single quoted ', double quoted ", or heredoc multi-line string """
// BNF: BITS          ::= single token:  binary 0b or 0B, octal 0o or 0O, decimal 0d or 0D, hexadecimal 0x or 0X
// BNF: COMMENT       ::= single token:  starts with // and ends with new line or starts with /* and ends with */
// BNF: WHITESPACE    ::= single token:  spaces, tab, carriage return, line feed, and UTF8 byte-order-mark

export function formatFile(content: string, tokens: TokenObject[], ast: NodeScript): TextEdit[] {
    const format = new FormatterState(content, tokens, ast);
    formatScript(format, ast);

    formatMoveUntil(format, {line: format.textLines.length, character: 0});

    return format.getResult();
}

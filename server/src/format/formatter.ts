import {
    funcHeadDestructor,
    isFunctionHeadReturnValue,
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
    NodeType, NodeTypeDef,
    NodeVar,
    NodeVarAccess, NodeVirtualProp,
    NodeWhile,
    ReferenceModifier
} from "../compile/nodes";
import {FormatState, isEditedWrapAt} from "./formatState";
import {TextEdit} from "vscode-languageserver-types/lib/esm/main";
import {formatMoveToNonComment, formatMoveUntil, formatMoveUntilNodeStart, formatTargetBy} from "./formatDetail";
import {TokenizedToken} from "../compile/tokens";
import {isRangeInOneLine} from "../compile/nodesUtils";

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
function formatScript(format: FormatState, nodeScript: NodeScript) {
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
        }
    }
}

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
function formatNamespace(format: FormatState, nodeNamespace: NodeNamespace) {
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

function formatBraceBlock(format: FormatState, action: () => void, isIndent: boolean = true) {
    if (formatTargetBy(format, '{', {connectTail: true}) === false) return;

    const startLine = format.getCursor().line;

    if (isIndent) format.pushIndent();

    action();

    if (isIndent) format.popIndent();

    const endWrap = startLine !== format.getCursor().line || isEditedWrapAt(format.getResult(), startLine);
    formatTargetBy(format, '}', {forceWrap: endWrap});
}

// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
function formatEnum(format: FormatState, nodeEnum: NodeEnum) {
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

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
function formatClass(format: FormatState, nodeClass: NodeClass) {
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

// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'
function formatTypeDef(format: FormatState, typeDef: NodeTypeDef) {
    formatMoveUntilNodeStart(format, typeDef);
    format.pushWrap();

    formatTargetBy(format, 'typedef', {});

    formatTargetBy(format, typeDef.type.text, {});

    formatTargetBy(format, typeDef.identifier.text, {});

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
function formatFunc(format: FormatState, nodeFunc: NodeFunc) {
    formatMoveUntilNodeStart(format, nodeFunc);
    format.pushWrap();

    formatEntityModifier(format);
    formatAccessModifier(format);

    if (isFunctionHeadReturnValue(nodeFunc.head)) {
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
function formatEntityModifier(format: FormatState) {
    for (; ;) {
        const next = formatMoveToNonComment(format);
        if (next === undefined) return;
        if (next.text === 'shared' || next.text === 'abstract' || next.text === 'final' || next.text === 'external') {
            formatTargetBy(format, next.text, {});
        } else return;
    }
}

// ['private' | 'protected']
function formatAccessModifier(format: FormatState) {
    const next = formatMoveToNonComment(format);
    if (next === undefined) return;
    if (next.text === 'private' || next.text === 'protected') {
        formatTargetBy(format, next.text, {});
    }
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))
function formatInterface(format: FormatState, nodeInterface: NodeInterface) {
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

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
function formatVar(format: FormatState, nodeVar: NodeVar) {
    formatMoveUntilNodeStart(format, nodeVar);
    format.pushWrap();

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

// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
function formatImport(format: FormatState, nodeImport: NodeImport) {
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

// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
function formatFuncDef(format: FormatState, funcDef: NodeFuncDef) {
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

// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
function formatVirtualProp(format: FormatState, virtualProp: NodeVirtualProp) {
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
function formatGetterSetterStatement(format: FormatState, isConst: boolean, statBlock: NodeStatBlock | undefined) {
    if (isConst) formatTargetBy(format, 'const', {});

    formatFuncAttr(format);

    if (statBlock === undefined) {
        formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
    } else {
        formatStatBlock(format, statBlock);
    }
}

// MIXIN         ::= 'mixin' CLASS
function formatMixin(format: FormatState, mixin: NodeMixin) {
    formatMoveUntilNodeStart(format, mixin);
    format.pushWrap();

    formatTargetBy(format, 'mixin', {});

    formatClass(format, mixin.mixinClass);
}

// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'
function formatIntfMethod(format: FormatState, intfMethod: NodeIntfMethod) {
    formatMoveUntilNodeStart(format, intfMethod);
    format.pushWrap();

    formatType(format, intfMethod.returnType);

    if (intfMethod.isRef) formatTargetBy(format, '&', {condenseLeft: true});

    formatTargetBy(format, intfMethod.identifier.text, {});

    formatParamList(format, intfMethod.paramList);

    if (intfMethod.isConst) formatTargetBy(format, 'const', {});

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
function formatStatBlock(format: FormatState, statBlock: NodeStatBlock) {
    formatMoveUntilNodeStart(format, statBlock);

    const isOneLine = isRangeInOneLine(statBlock.nodeRange);

    formatBraceBlock(format, () => {
        for (const statement of statBlock.statementList) {
            if (isOneLine === false) format.pushWrap();

            if (statement.nodeName === NodeName.Var) {
                formatVar(format, statement);
            } else {
                formatStatement(format, statement);
            }
        }
    });
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
function formatParamList(format: FormatState, paramList: NodeParamList) {
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
            if (defaultExpr !== undefined) {
                formatTargetBy(format, '=', {});
                formatExpr(format, defaultExpr);
            }
        }
    });
}

function formatParenthesesBlock(format: FormatState, action: () => void, condenseLeft: boolean = true) {
    if (formatTargetBy(format, '(', {condenseLeft: condenseLeft, condenseRight: true}) === false) return;

    format.pushIndent();
    action();
    format.popIndent();

    formatTargetBy(format, ')', {condenseLeft: true});
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]
function formatTypeMod(format: FormatState) {
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

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
function formatType(format: FormatState, nodeType: NodeType) {
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
function formatTypeTemplates(format: FormatState, templates: NodeType[]) {
    if (templates.length === 0) return;

    formatChevronsBlock(format, () => {
        for (let i = 0; i < templates.length; i++) {
            if (i > 0) formatTargetBy(format, ',', {condenseLeft: true});
            formatType(format, templates[i]);
        }
    });
}

function formatChevronsBlock(format: FormatState, action: () => void) {
    if (formatTargetBy(format, '<', {condenseSides: true}) === false) return;
    format.pushIndent();

    action();

    format.popIndent();
    formatTargetBy(format, '>', {condenseLeft: true});
}

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
function formatInitList(format: FormatState, initList: NodeInitList) {
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

// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
function formatScope(format: FormatState, scope: NodeScope) {
    formatMoveUntilNodeStart(format, scope);

    if (scope.isGlobal) formatTargetBy(format, '::', {condenseSides: true});

    for (let i = 0; i < scope.scopeList.length; i++) {
        const scopeIdentifier = scope.scopeList[i];
        formatTargetBy(format, scopeIdentifier.text, {});
        formatTargetBy(format, '::', {condenseSides: true});
    }
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
function formatDataType(format: FormatState, dataType: NodeDataType) {
    formatMoveUntilNodeStart(format, dataType);

    formatTargetBy(format, dataType.identifier.text, {});
}

// PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'

// FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property'}
function formatFuncAttr(format: FormatState) {
    for (; ;) {
        const next = formatMoveToNonComment(format);
        if (next === undefined) return;
        if (next.text === 'override' || next.text === 'final' || next.text === 'explicit' || next.text === 'property') {
            formatTargetBy(format, next.text, {});
        } else return;
    }
}

// STATEMENT     ::= (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
function formatStatement(format: FormatState, statement: NodeStatement, canIndent: boolean = false) {
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

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
function formatSwitch(format: FormatState, nodeSwitch: NodeSwitch) {
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

// BREAK         ::= 'break' ';'
function formatBreak(format: FormatState, nodeBreak: NodeBreak) {
    formatMoveUntilNodeStart(format, nodeBreak);

    formatTargetBy(format, 'break', {});

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
function formatFor(format: FormatState, nodeFor: NodeFor) {
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

// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
function formatWhile(format: FormatState, nodeWhile: NodeWhile) {
    formatMoveUntilNodeStart(format, nodeWhile);

    formatTargetBy(format, 'while', {});

    formatParenthesesBlock(format, () => {
        formatAssign(format, nodeWhile.assign);
    }, false);

    if (nodeWhile.statement !== undefined) formatStatement(format, nodeWhile.statement, true);
}

// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
function formatDoWhile(format: FormatState, doWhile: NodeDoWhile) {
    formatMoveUntilNodeStart(format, doWhile);

    formatTargetBy(format, 'do', {});

    if (doWhile.statement !== undefined) formatStatement(format, doWhile.statement, true);

    formatTargetBy(format, 'while', {connectTail: true});

    formatParenthesesBlock(format, () => {
        if (doWhile.assign !== undefined) formatAssign(format, doWhile.assign);
    }, false);

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
function formatIf(format: FormatState, nodeIf: NodeIf) {
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

// CONTINUE      ::= 'continue' ';'
function formatContinue(format: FormatState, nodeContinue: NodeContinue) {
    formatMoveUntilNodeStart(format, nodeContinue);
    formatTargetBy(format, 'continue', {});
    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// EXPRSTAT      ::= [ASSIGN] ';'
function formatExprStat(format: FormatState, exprStat: NodeExprStat) {
    formatMoveUntilNodeStart(format, exprStat);

    if (exprStat.assign !== undefined) formatAssign(format, exprStat.assign);

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK
function formatTry(format: FormatState, nodeTry: NodeTry) {
    formatMoveUntilNodeStart(format, nodeTry);

    formatTargetBy(format, 'try', {});

    formatStatBlock(format, nodeTry.tryBlock);

    formatTargetBy(format, 'catch', {connectTail: true});

    if (nodeTry.catchBlock !== undefined) formatStatBlock(format, nodeTry.catchBlock);
}

// RETURN        ::= 'return' [ASSIGN] ';'
function formatReturn(format: FormatState, nodeReturn: NodeReturn) {
    formatMoveUntilNodeStart(format, nodeReturn);

    formatTargetBy(format, 'return', {});

    format.pushIndent();

    if (nodeReturn.assign !== undefined) {
        formatAssign(format, nodeReturn.assign);
    }

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});

    format.popIndent();
}

// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
function formatCase(format: FormatState, nodeCase: NodeCase) {
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

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
function formatExpr(format: FormatState, nodeExpr: NodeExpr) {
    formatMoveUntilNodeStart(format, nodeExpr);

    formatExprTerm(format, nodeExpr.head);

    if (nodeExpr.tail !== undefined) {
        format.pushIndent();

        formatTargetBy(format, nodeExpr.tail.operator.text, {});

        formatExpr(format, nodeExpr.tail.expression);

        format.popIndent();
    }
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function formatExprTerm(format: FormatState, exprTerm: NodeExprTerm) {
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

// EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
function formatExprValue(format: FormatState, exprValue: NodeExprValue) {
    // formatMoveUntilNodeStart(format, exprValue);

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

// CONSTRUCTCALL ::= TYPE ARGLIST
function formatConstructCall(format: FormatState, constructCall: NodeConstructCall) {
    formatMoveUntilNodeStart(format, constructCall);

    formatType(format, constructCall.type);

    formatArgList(format, constructCall.argList);
}

// EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']') | ARGLIST | '++' | '--'
function formatExprPostOp(format: FormatState, postOp: NodeExprPostOp) {
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
            for (let i = 0; i < postOp.indexerList.length; i++) {
                if (i > 0) formatTargetBy(format, ',', {condenseLeft: true});

                const index = postOp.indexerList[i];
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

function formatBracketsBlock(format: FormatState, action: () => void) {
    if (formatTargetBy(format, '[', {condenseSides: true}) === false) return;

    format.pushIndent();
    action();
    format.popIndent();

    formatTargetBy(format, ']', {condenseLeft: true});
}

// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
function formatCast(format: FormatState, nodeCast: NodeCast) {
    formatMoveUntilNodeStart(format, nodeCast);

    formatTargetBy(format, 'cast', {});

    formatChevronsBlock(format, () => {
        formatType(format, nodeCast.type);
    });

    formatParenthesesBlock(format, () => {
        formatAssign(format, nodeCast.assign);
    });
}

// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
function formatLambda(format: FormatState, nodeLambda: NodeLambda) {
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

// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
function formatFuncCall(format: FormatState, funcCall: NodeFuncCall) {
    formatMoveUntilNodeStart(format, funcCall);

    if (funcCall.scope !== undefined) {
        formatScope(format, funcCall.scope);
    }

    formatTargetBy(format, funcCall.identifier.text, {});

    formatArgList(format, funcCall.argList);
}

// VARACCESS     ::= SCOPE IDENTIFIER
function formatVarAccess(format: FormatState, varAccess: NodeVarAccess) {
    formatMoveUntilNodeStart(format, varAccess);

    if (varAccess.scope !== undefined) {
        formatScope(format, varAccess.scope);
    }

    if (varAccess.identifier !== undefined) {
        formatTargetBy(format, varAccess.identifier.text, {});
    }
}

// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
function formatArgList(format: FormatState, nodeArgList: NodeArgList) {
    formatMoveUntilNodeStart(format, nodeArgList);

    formatParenthesesBlock(format, () => {
        for (let i = 0; i < nodeArgList.argList.length; i++) {
            if (i > 0) formatTargetBy(format, ',', {condenseLeft: true});

            const arg = nodeArgList.argList[i];
            if (arg.identifier !== undefined) {
                formatTargetBy(format, arg.identifier.text, {});
                formatTargetBy(format, ':', {connectTail: true});
            }

            formatAssign(format, arg.assign);
        }
    });
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
function formatAssign(format: FormatState, nodeAssign: NodeAssign) {
    formatMoveUntilNodeStart(format, nodeAssign);

    formatCondition(format, nodeAssign.condition);

    if (nodeAssign.tail !== undefined) {
        formatTargetBy(format, nodeAssign.tail.operator.text, {});

        formatAssign(format, nodeAssign.tail.assign);
    }
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
function formatCondition(format: FormatState, condition: NodeCondition) {
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

// EXPROP        ::= MATHOP | COMPOP | LOGICOP | BITOP
// BITOP         ::= '&' | '|' | '^' | '<<' | '>>' | '>>>'
// MATHOP        ::= '+' | '-' | '*' | '/' | '%' | '**'
// COMPOP        ::= '==' | '!=' | '<' | '<=' | '>' | '>=' | 'is' | '!is'
// LOGICOP       ::= '&&' | '||' | '^^' | 'and' | 'or' | 'xor'
// ASSIGNOP      ::= '=' | '+=' | '-=' | '*=' | '/=' | '|=' | '&=' | '^=' | '%=' | '**=' | '<<=' | '>>=' | '>>>='
// IDENTIFIER    ::= single token:  starts with letter or _, can include any letter and digit, same as in C++
// NUMBER        ::= single token:  includes integers and real numbers, same as C++
// STRING        ::= single token:  single quoted ', double quoted ", or heredoc multi-line string """
// BITS          ::= single token:  binary 0b or 0B, octal 0o or 0O, decimal 0d or 0D, hexadecimal 0x or 0X
// COMMENT       ::= single token:  starts with // and ends with new line or starts with /* and ends with */
// WHITESPACE    ::= single token:  spaces, tab, carriage return, line feed, and UTF8 byte-order-mark

export function formatDocument(content: string, tokens: TokenizedToken[], ast: NodeScript): TextEdit[] {
    const format = new FormatState(content, tokens, ast);
    formatScript(format, ast);

    formatMoveUntil(format, {line: format.textLines.length, character: 0});

    return format.getResult();
}

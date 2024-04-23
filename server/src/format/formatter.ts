import {
    funcHeadDestructor,
    isFunctionHeadReturns, isRangeInOneLine, NodeArgList, NodeAssign, NodeCondition, NodeConstructCall,
    NodeDataType,
    NodeExpr, NodeExprPostOp, NodeExprTerm, NodeExprValue,
    NodeFunc, NodeIf, NodeInitList,
    NodeName,
    NodeNamespace,
    NodeParamList,
    NodeScope,
    NodeScript,
    NodeStatBlock, NodeStatement,
    NodeType,
    NodeVar, NodeVarAccess,
    ReferenceModifier
} from "../compile/nodes";
import {FormatState} from "./formatState";
import {TextEdit} from "vscode-languageserver-types/lib/esm/main";
import {formatMoveToNonComment, formatMoveUntil, formatMoveUntilNodeStart, formatTargetBy} from "./formatDetail";
import {TokenizingToken} from "../compile/tokens";

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
function formatScript(format: FormatState, nodeScript: NodeScript) {
    for (const node of nodeScript) {
        const name = node.nodeName;
        if (name === NodeName.Func) {
            formatFunc(format, node);
        } else if (name === NodeName.Namespace) {
            formatNamespace(format, node);
        }
    }
}

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
function formatNamespace(format: FormatState, nodeNamespace: NodeNamespace) {
    formatMoveUntilNodeStart(format, nodeNamespace);
    formatTargetBy(format, 'namespace', {forceWrap: true});

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

function formatBraceBlock(format: FormatState, action: () => void) {
    formatTargetBy(format, '{', {connectTail: true});
    const startLine = format.getCursor().line;

    format.pushIndent();
    action();
    format.popIndent();

    formatTargetBy(format, '}', {forceWrap: startLine !== format.getCursor().line});
}

// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
function formatFunc(format: FormatState, nodeFunc: NodeFunc) {
    formatMoveUntilNodeStart(format, nodeFunc);
    format.pushWrap();

    formatEntityModifier(format);
    formatAccessModifier(format);

    if (isFunctionHeadReturns(nodeFunc.head)) {
        formatType(format, nodeFunc.head.returnType);
        if (nodeFunc.head.isRef) formatTargetBy(format, '&', {});
    } else if (nodeFunc.head === funcHeadDestructor) {
        formatTargetBy(format, '~', {condenseRight: true});
    }

    formatTargetBy(format, nodeFunc.identifier.text, {});

    formatParamList(format, nodeFunc.paramList);

    if (nodeFunc.isConst) formatTargetBy(format, 'const', {});

    if (nodeFunc.statBlock === undefined) formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
    else formatStatBlock(format, nodeFunc.statBlock);
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
            formatTargetBy(format, '=', {});
            formatAssign(format, initializer);
        } else {
            formatArgList(format, initializer);
        }
    }

    formatTargetBy(format, ';', {condenseLeft: true, connectTail: true});
}

// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
// MIXIN         ::= 'mixin' CLASS
// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
function formatStatBlock(format: FormatState, statBlock: NodeStatBlock) {
    formatMoveUntilNodeStart(format, statBlock);

    formatBraceBlock(format, () => {
        for (const statement of statBlock.statementList) {
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

function formatParenthesesBlock(format: FormatState, action: () => void, condense: boolean = true) {
    formatTargetBy(format, '(', {condenseSides: condense, connectTail: true});
    // const startLine = format.getCursor().line;

    format.pushIndent();
    action();
    format.popIndent();

    formatTargetBy(format, ')', {condenseLeft: condense});
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
    formatMoveUntilNodeStart(format, templates[0]);

    formatTargetBy(format, '<', {condenseSides: true});

    for (let i = 0; i < templates.length; i++) {
        if (i > 0) formatTargetBy(format, ',', {condenseLeft: true});
        formatType(format, templates[i]);
    }

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
        formatTargetBy(format, '::', {});
    }
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
function formatDataType(format: FormatState, dataType: NodeDataType) {
    formatMoveUntilNodeStart(format, dataType);

    formatTargetBy(format, dataType.identifier.text, {});
}

// PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
// FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property'}

// STATEMENT     ::= (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
function formatStatement(format: FormatState, statement: NodeStatement, forceIndent: boolean = false) {
    const isIndent = forceIndent && statement.nodeName !== NodeName.StatBlock;
    if (isIndent) format.pushIndent();

    switch (statement.nodeName) {
    case NodeName.If:
        formatIf(format, statement);
        break;
        // TODO
    }

    if (isIndent) format.popIndent();
}

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
// BREAK         ::= 'break' ';'
// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'

// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
function formatIf(format: FormatState, nodeIf: NodeIf) {
    formatMoveUntilNodeStart(format, nodeIf);

    formatTargetBy(format, 'if', {forceWrap: true});

    formatParenthesesBlock(format, () => {
        formatAssign(format, nodeIf.condition);
    }, false);

    if (nodeIf.thenStat !== undefined) {
        if (isRangeInOneLine(nodeIf.thenStat.nodeRange) === false) format.pushWrap();
        formatStatement(format, nodeIf.thenStat);
    }

    if (nodeIf.elseStat !== undefined) {
        formatTargetBy(format, 'else', {forceWrap: true});

        if (isRangeInOneLine(nodeIf.elseStat.nodeRange) === false) format.pushWrap();
        formatStatement(format, nodeIf.elseStat);
    }
}

// CONTINUE      ::= 'continue' ';'
// EXPRSTAT      ::= [ASSIGN] ';'
// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK
// RETURN        ::= 'return' [ASSIGN] ';'
// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
function formatExpr(format: FormatState, nodeExpr: NodeExpr) {
    formatMoveUntilNodeStart(format, nodeExpr);

    formatExprTerm(format, nodeExpr.head);

    if (nodeExpr.tail !== undefined) {
        formatTargetBy(format, nodeExpr.tail.operator.text, {});

        formatExpr(format, nodeExpr.tail.expression);
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
    formatMoveUntilNodeStart(format, exprValue);

    if (exprValue.nodeName === NodeName.ConstructCall) {
        formatConstructCall(format, exprValue);
    } else if (exprValue.nodeName === NodeName.VarAccess) {
        formatVarAccess(format, exprValue);
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

    // TODO
}

// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST

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

    // TODO
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

export function formatDocument(content: string, tokens: TokenizingToken[], ast: NodeScript): TextEdit[] {
    const state = new FormatState(content, tokens, ast);
    formatScript(state, ast);
    return state.getResult();
}

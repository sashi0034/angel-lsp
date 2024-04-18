import {
    funcHeadConstructor,
    funcHeadDestructor,
    isFunctionHeadReturns, NodeDataType, NodeExpr,
    NodeFunc,
    NodeName,
    NodeNamespace, NodeParamList, NodeScope,
    NodeScript, NodeType, ReferenceModifier
} from "../compile/nodes";
import {FormatState} from "./formatState";
import {TextEdit} from "vscode-languageserver-types/lib/esm/main";
import {
    formatMoveUntilNodeStart,
    formatTargetLinePeriod,
    formatTargetLineStatement,
    formatMoveToNonComment
} from "./formatDetail";
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
    formatTargetLineStatement(format, 'namespace', {forceWrap: true});

    format.pushIndent();
    for (let i = 0; i < nodeNamespace.namespaceList.length; i++) {
        if (i > 0) formatTargetLineStatement(format, '::', {condenseSides: true});

        const namespaceIdentifier = nodeNamespace.namespaceList[i];
        formatTargetLineStatement(format, namespaceIdentifier.text, {});
    }
    format.popIndent();

    formatCodeBlock(format, () => {
        formatScript(format, nodeNamespace.script);
    });
}

function formatCodeBlock(format: FormatState, action: () => void) {
    formatTargetLinePeriod(format, '{', {});
    const startLine = format.getCursor().line;

    format.pushIndent();
    action();
    format.popIndent();

    formatTargetLineStatement(format, '}', {forceWrap: startLine !== format.getCursor().line});
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
        if (nodeFunc.head.isRef) formatTargetLineStatement(format, '&', {});
    } else if (nodeFunc.head === funcHeadDestructor) {
        formatTargetLineStatement(format, '~', {condenseRight: true});
    }

    formatTargetLineStatement(format, nodeFunc.identifier.text, {});

    formatParamList(format, nodeFunc.paramList);

    // TODO
}

// {'shared' | 'abstract' | 'final' | 'external'}
function formatEntityModifier(format: FormatState) {
    for (; ;) {
        const next = formatMoveToNonComment(format);
        if (next === undefined) return;
        if (next.text === 'shared' || next.text === 'abstract' || next.text === 'final' || next.text === 'external') {
            formatTargetLineStatement(format, next.text, {});
        } else return;
    }
}

// ['private' | 'protected']
function formatAccessModifier(format: FormatState) {
    const next = formatMoveToNonComment(format);
    if (next === undefined) return;
    if (next.text === 'private' || next.text === 'protected') {
        formatTargetLineStatement(format, next.text, {});
    }
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))
// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
// MIXIN         ::= 'mixin' CLASS
// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'
// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
function formatParamList(format: FormatState, paramList: NodeParamList) {
    formatTargetLineStatement(format, '(', {condenseSides: true});

    if (paramList.length === 0 && formatMoveToNonComment(format)?.text === 'void') {
        formatTargetLineStatement(format, 'void', {});
    }

    for (let i = 0; i < paramList.length; i++) {
        if (i > 0) formatTargetLineStatement(format, ',', {condenseLeft: true});
        formatType(format, paramList[i].type);
        formatTypeMod(format);

        const identifier = paramList[i].identifier;
        if (identifier !== undefined) {
            formatTargetLineStatement(format, identifier.text, {});
        }

        const defaultExpr = paramList[i].defaultExpr;
        if (defaultExpr !== undefined) {
            formatTargetLineStatement(format, '=', {});
            formatExpr(format, defaultExpr);
        }
    }

    formatTargetLineStatement(format, ')', {condenseSides: true});

}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]
function formatTypeMod(format: FormatState) {
    const next = formatMoveToNonComment(format);
    if (next === undefined) return;
    if (next.text === '&') {
        formatTargetLineStatement(format, '&', {condenseLeft: true});

        const next2 = formatMoveToNonComment(format);
        if (next2 === undefined) return;
        if (next2.text === 'in' || next2.text === 'out' || next2.text === 'inout') {
            formatTargetLineStatement(format, next.text, {});
        }
    }
}

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
function formatType(format: FormatState, nodeType: NodeType) {
    formatMoveUntilNodeStart(format, nodeType);

    if (nodeType.isConst) formatTargetLineStatement(format, 'const', {});

    if (nodeType.scope !== undefined) formatScope(format, nodeType.scope);

    formatDataType(format, nodeType.dataType);

    formatTypeTemplates(format, nodeType.typeTemplates);

    if (nodeType.isArray) {
        formatTargetLineStatement(format, '[', {condenseLeft: true});
        formatTargetLineStatement(format, ']', {condenseLeft: true});
    }

    if (nodeType.refModifier !== undefined) {
        formatTargetLineStatement(format, '@', {condenseLeft: true});
        if (nodeType.refModifier === ReferenceModifier.AtConst) {
            formatTargetLineStatement(format, 'const', {});
        }
    }
}

// ['<' TYPE {',' TYPE} '>']
function formatTypeTemplates(format: FormatState, templates: NodeType[]) {
    if (templates.length === 0) return;
    formatMoveUntilNodeStart(format, templates[0]);

    formatTargetLineStatement(format, '<', {condenseSides: true});

    for (let i = 0; i < templates.length; i++) {
        if (i > 0) formatTargetLineStatement(format, ',', {condenseLeft: true});
        formatType(format, templates[i]);
    }

    formatTargetLineStatement(format, '>', {condenseLeft: true});
}

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'

// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
function formatScope(format: FormatState, scope: NodeScope) {
    formatMoveUntilNodeStart(format, scope);

    if (scope.isGlobal) formatTargetLineStatement(format, '::', {condenseSides: true});

    for (let i = 0; i < scope.scopeList.length; i++) {
        const scopeIdentifier = scope.scopeList[i];
        formatTargetLineStatement(format, scopeIdentifier.text, {});
        formatTargetLineStatement(format, '::', {});
    }
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
function formatDataType(format: FormatState, dataType: NodeDataType) {
    formatMoveUntilNodeStart(format, dataType);

    formatTargetLineStatement(format, dataType.identifier.text, {});
}

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
function formatExpr(format: FormatState, nodeExpr: NodeExpr) {
    formatMoveUntilNodeStart(format, nodeExpr);

    // TODO
}

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

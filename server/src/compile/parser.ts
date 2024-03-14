// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_script_bnf.html

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
import {TokenObject} from "./token";
import {
    NodeARGLIST,
    NodeASSIGN, NodeCASE,
    NodeCONDITION,
    NodeDATATYPE, NodeDOWHILE,
    NodeEXPR, NodeEXPRSTAT,
    NodeEXPRTERM2, NodeEXPRVALUE, NodeFOR,
    NodeFunc, NodeFUNCCALL,
    NodeIF,
    NodePARAMLIST,
    NodeRETURN, NodeSCOPE,
    NodeScript,
    NodeSTATBLOCK,
    NodeSTATEMENT, NodeSWITCH,
    NodeTYPE,
    NodeVAR, NodeVARACCESS, NodeWHILE
} from "./nodes";
import {diagnostic} from "../code/diagnostic";
import {HighlightModifier, HighlightToken} from "../code/highlight";
import {func} from "vscode-languageserver/lib/common/utils/is";

type TriedParse<T> = 'mismatch' | 'pending' | T;

// 診断メッセージは pending 発生時に発行する

class ReadingState {
    public constructor(
        private tokens: TokenObject[],
        private pos: number = 0
    ) {
    }

    public getPos = () => this.pos;
    public setPos = (pos: number) => this.pos = pos;

    public isEnd(): boolean {
        return this.pos >= this.tokens.length;
    }

    public next(step: number = 0): TokenObject {
        if (this.pos + step >= this.tokens.length) return this.tokens[this.tokens.length - 1];
        return this.tokens[this.pos + step];
    }

    public step() {
        this.pos++;
    }

    public confirm(analyzeToken: HighlightToken, analyzedModifier: HighlightModifier | null = null) {
        const next = this.next();
        next.highlight.token = analyzeToken;
        if (analyzedModifier !== null) next.highlight.modifier = analyzedModifier;
        this.step();
    }

    public expect(word: string, analyzeToken: HighlightToken, analyzedModifier: HighlightModifier | null = null) {
        if (this.isEnd()) {
            diagnostic.addError(this.next().location, "Unexpected end of file");
            return false;
        }
        if (this.next().kind !== "reserved") {
            diagnostic.addError(this.next().location, "Expected reserved word");
            return false;
        }
        if (this.next().text !== word) {
            diagnostic.addError(this.next().location, `Expected reserved word ${word}`);
            return false;
        }
        this.confirm(analyzeToken, analyzedModifier);
        return true;
    }
}

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
function parseSCRIPT(reading: ReadingState) {
    const funcs: NodeFunc[] = [];
    while (reading.isEnd() === false) {
        const func = parseFUNC(reading);
        if (func !== null) {
            funcs.push(func);
            continue;
        }
        reading.step();
    }
    return new NodeScript(funcs);
}

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
function parseFUNC(reading: ReadingState) {
    const ret = parseTYPE(reading);
    if (ret === null) return null;
    const identifier = reading.next();
    reading.step();
    const paramlist = parsePARAMLIST(reading);
    const statblock = parseSTATBLOCK(reading) ?? [];
    return new NodeFunc([], null, ret, null, identifier, paramlist, false, null, statblock);
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST]} ';'
function parseVAR(reading: ReadingState): NodeVAR | null {
    const rollbackPos = reading.getPos();
    const type = parseTYPE(reading);
    if (type === null) {
        // diagnostic.addError(reading.next().location, "Expected type");
        return null;
    }
    const identifier = reading.next();
    if (identifier.kind !== 'identifier') {
        reading.setPos(rollbackPos);
        return null;
    }
    reading.confirm(HighlightToken.Variable);
    reading.expect('=', HighlightToken.Operator);
    const expr = parseEXPR(reading);
    if (expr === null) {
        diagnostic.addError(reading.next().location, "Expected expression");
        return null;
    }
    reading.expect(';', HighlightToken.Operator);
    return new NodeVAR(type, identifier, expr);
}

// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
// MIXIN         ::= 'mixin' CLASS
// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
function parseSTATBLOCK(reading: ReadingState): NodeSTATBLOCK | null {
    if (reading.next().text !== '{') return null;
    reading.step();
    const statements: NodeSTATBLOCK = [];
    while (reading.isEnd() === false) {
        if (reading.next().text === '}') break;
        const var_ = parseVAR(reading);
        if (var_ !== null) {
            statements.push(var_);
            continue;
        }
        const statement = parseSTATEMENT(reading);
        if (statement === 'pending') {
            continue;
        }
        if (statement !== 'mismatch') {
            statements.push(statement);
            continue;
        }
        reading.step();
    }
    reading.expect('}', HighlightToken.Keyword);
    return statements;
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
function parsePARAMLIST(reading: ReadingState) {
    reading.expect('(', HighlightToken.Operator);
    const params: NodePARAMLIST = [];
    for (; ;) {
        if (reading.isEnd() || reading.next().text === ')') break;
        if (params.length > 0) {
            if (reading.expect(',', HighlightToken.Operator) === false) break;
        }
        const type = parseTYPE(reading);
        if (type === null) break;
        if (reading.next().kind === 'identifier') {
            params.push([type, reading.next()]);
            reading.step();
        } else {
            params.push([type, null]);
        }
    }

    reading.expect(')', HighlightToken.Operator);
    return params;
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
function parseTYPE(reading: ReadingState) {
    const rollbackPos = reading.getPos();
    let isConst = false;
    if (reading.next().text === 'const') {
        reading.confirm(HighlightToken.Keyword);
        isConst = true;
    }

    const scope = parseSCOPE(reading);

    const datatype = parseDATATYPE(reading);
    if (datatype === null) {
        reading.setPos(rollbackPos);
        return null;
    }
    return new NodeTYPE(isConst, scope, datatype, [], false, false);
}

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'

// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
function parseSCOPE(reading: ReadingState): NodeSCOPE | null {
    let isGlobal = false;
    if (reading.next().text === '::') {
        reading.confirm(HighlightToken.Operator);
        isGlobal = true;
    }
    const namespaces: TokenObject[] = [];
    for (; ;) {
        const identifier = reading.next(0);
        if (identifier.kind !== 'identifier') {
            break;
        }
        if (reading.next(1).text === '::') {
            reading.confirm(HighlightToken.Namespace);
            reading.confirm(HighlightToken.Operator);
            namespaces.push(identifier);
            continue;
        } else if (reading.next(1).text === '<') {
            reading.confirm(HighlightToken.Class);
            reading.confirm(HighlightToken.Operator);
            const generics: NodeTYPE[] = [];
            for (; ;) {
                if (reading.next().text === '>') {
                    reading.confirm(HighlightToken.Operator);
                    break;
                }
                if (generics.length > 0) {
                    reading.expect(',', HighlightToken.Operator);
                }
                const type = parseTYPE(reading);
                if (type === null) break;
                generics.push(type);
            }
            reading.expect('::', HighlightToken.Operator);
            if (generics.length === 0) {
                diagnostic.addError(reading.next().location, "Expected type");
            }
            return new NodeSCOPE(isGlobal, namespaces, [identifier, generics]);
        }
        break;
    }
    if (isGlobal === false && namespaces.length === 0) {
        return null;
    }
    return new NodeSCOPE(isGlobal, namespaces, null);
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
function parseDATATYPE(reading: ReadingState) {
    // FIXME
    const next = reading.next();
    if (reading.next().kind === 'identifier') {
        reading.confirm(HighlightToken.Type);
        return new NodeDATATYPE(next);
    }

    const primtype = parsePRIMTYPE(reading);
    if (primtype !== null) return new NodeDATATYPE(primtype);

    return null;
}

// PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
function parsePRIMTYPE(reading: ReadingState) {
    const next = reading.next();
    if (primeTypeSet.has(next.text) === false) return null;
    reading.confirm(HighlightToken.Builtin);
    return next;
}

const primeTypeSet = new Set<string>(['void', 'int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'float', 'double', 'bool']);

// FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property'}

// STATEMENT     ::= (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
function parseSTATEMENT(reading: ReadingState): TriedParse<NodeSTATEMENT> {
    const if_ = parseIF(reading);
    if (if_ === 'pending') return 'pending';
    if (if_ instanceof NodeIF) return if_;

    const for_ = parseFOR(reading);
    if (for_ === 'pending') return 'pending';
    if (for_ instanceof NodeFOR) return for_;

    const while_ = parseWHILE(reading);
    if (while_ === 'pending') return 'pending';
    if (while_ instanceof NodeWHILE) return while_;

    const return_ = parseRETURN(reading);
    if (return_ === 'pending') return 'pending';
    if (return_ instanceof NodeRETURN) return return_;

    const statblock = parseSTATBLOCK(reading);
    if (statblock !== null) return statblock;

    const break_ = parseBREAK(reading);
    if (break_ === 'break') return 'break';

    const continue_ = parseCONTINUE(reading);
    if (continue_ === 'continue') return 'continue';

    const dowhile = parseDOWHILE(reading);
    if (dowhile === 'pending') return 'pending';
    if (dowhile instanceof NodeDOWHILE) return dowhile;

    const switch_ = parseSWITCH(reading);
    if (switch_ === 'pending') return 'pending';
    if (switch_ instanceof NodeSWITCH) return switch_;

    const exprstat = parseEXPRSTAT(reading);
    if (exprstat !== null) return exprstat;

    return 'mismatch';
}

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
function parseSWITCH(reading: ReadingState): TriedParse<NodeSWITCH> {
    if (reading.next().text !== 'switch') return 'mismatch';
    reading.step();
    reading.expect('(', HighlightToken.Operator);
    const assign = parseASSIGN(reading);
    if (assign === null) {
        diagnostic.addError(reading.next().location, "Expected expression");
        return 'pending';
    }
    reading.expect(')', HighlightToken.Operator);
    reading.expect('{', HighlightToken.Operator);
    const cases: NodeCASE[] = [];

    for (; ;) {
        if (reading.isEnd() || reading.next().text === '}') break;
        const case_ = parseCASE(reading);
        if (case_ === 'mismatch') break;
        if (case_ === 'pending') continue;
        cases.push(case_);
    }
    reading.expect('}', HighlightToken.Operator);
    return new NodeSWITCH(assign, cases);
}

// BREAK         ::= 'break' ';'
function parseBREAK(reading: ReadingState) {
    if (reading.next().text !== 'break') return null;
    reading.step();
    reading.expect(';', HighlightToken.Operator);
    return 'break';
}

// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
function parseFOR(reading: ReadingState): TriedParse<NodeFOR> {
    if (reading.next().text !== 'for') return 'mismatch';
    reading.step();
    reading.expect('(', HighlightToken.Operator);

    const initial: NodeEXPRSTAT | NodeVAR | null = parseEXPRSTAT(reading) ?? parseVAR(reading);
    if (initial === null) {
        diagnostic.addError(reading.next().location, "Expected initial expression or variable declaration");
        return 'pending';
    }

    const condition = parseEXPRSTAT(reading);
    if (condition === null) {
        diagnostic.addError(reading.next().location, "Expected condition expression");
        return 'pending';
    }

    const increment: NodeASSIGN[] = [];
    for (; ;) {
        if (increment.length > 0) {
            if (reading.next().text !== ',') break;
            reading.step();
        }
        const assign = parseASSIGN(reading);
        if (assign === null) break;
        increment.push(assign);
    }

    reading.expect(')', HighlightToken.Operator);

    const statement = parseSTATEMENT(reading);
    if (statement === 'mismatch' || statement === 'pending') return 'pending';

    return new NodeFOR(initial, condition, increment, statement);
}

// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
function parseWHILE(reading: ReadingState): TriedParse<NodeWHILE> {
    if (reading.next().text !== 'while') return 'mismatch';
    reading.step();
    reading.expect('(', HighlightToken.Operator);
    const assign = parseASSIGN(reading);
    if (assign === null) {
        diagnostic.addError(reading.next().location, "Expected condition expression");
        return 'pending';
    }
    reading.expect(')', HighlightToken.Operator);
    const statement = parseSTATEMENT(reading);
    if (statement === 'mismatch' || statement === 'pending') {
        diagnostic.addError(reading.next().location, "Expected statement");
        return 'pending';
    }
    return new NodeWHILE(assign, statement);
}

// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
function parseDOWHILE(reading: ReadingState): TriedParse<NodeDOWHILE> {
    if (reading.next().text !== 'do') return 'mismatch';
    reading.step();
    const statement = parseSTATEMENT(reading);
    if (statement === 'mismatch' || statement === 'pending') {
        diagnostic.addError(reading.next().location, "Expected statement");
        return 'pending';
    }
    reading.expect('while', HighlightToken.Keyword);
    reading.expect('(', HighlightToken.Operator);
    const assign = parseASSIGN(reading);
    if (assign === null) {
        diagnostic.addError(reading.next().location, "Expected condition expression");
        return 'pending';
    }
    reading.expect(')', HighlightToken.Operator);
    reading.expect(';', HighlightToken.Operator);
    return new NodeDOWHILE(statement, assign);
}

// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
function parseIF(reading: ReadingState): TriedParse<NodeIF> {
    if (reading.next().text !== 'if') return 'mismatch';
    reading.step();
    reading.expect('(', HighlightToken.Operator);
    const assign = parseASSIGN(reading);
    if (assign === null) {
        diagnostic.addError(reading.next().location, "Expected condition expression");
        return 'pending';
    }
    reading.expect(')', HighlightToken.Operator);
    const ts = parseSTATEMENT(reading);
    if (ts === 'mismatch' || ts === 'pending') return 'pending';
    let fs = null;
    if (reading.next().text === 'else') {
        fs = parseSTATEMENT(reading);
        if (fs === 'mismatch' || fs === 'pending') {
            diagnostic.addError(reading.next().location, "Expected statement");
            return new NodeIF(assign, ts, null);
        }
    }
    return new NodeIF(assign, ts, fs);
}

// CONTINUE      ::= 'continue' ';'
function parseCONTINUE(reading: ReadingState) {
    if (reading.next().text !== 'continue') return null;
    reading.step();
    reading.expect(';', HighlightToken.Operator);
    return 'continue';
}

// EXPRSTAT      ::= [ASSIGN] ';'
function parseEXPRSTAT(reading: ReadingState): NodeEXPRSTAT | null {
    if (reading.next().text === ';') {
        reading.confirm(HighlightToken.Operator);
        return 'empty';
    }
    const assign = parseASSIGN(reading);
    if (assign === null) return null;
    reading.expect(';', HighlightToken.Operator);
    return assign;
}

// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK

// RETURN        ::= 'return' [ASSIGN] ';'
function parseRETURN(reading: ReadingState): TriedParse<NodeRETURN> {
    if (reading.next().text !== 'return') return 'mismatch';
    reading.step();
    const assign = parseASSIGN(reading);
    if (assign === null) {
        diagnostic.addError(reading.next().location, "Expected expression");
        return 'pending';
    }
    reading.expect(';', HighlightToken.Operator);
    return new NodeRETURN(assign);
}

// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
function parseCASE(reading: ReadingState): TriedParse<NodeCASE> {
    let expr = null;
    if (reading.next().text === 'case') {
        reading.step();
        expr = parseEXPR(reading);
        if (expr === null) {
            diagnostic.addError(reading.next().location, "Expected expression");
            return 'pending';
        }
    } else if (reading.next().text === 'default') {
        reading.step();
    } else {
        return 'mismatch';
    }
    reading.expect(':', HighlightToken.Operator);
    const statements: NodeSTATEMENT[] = [];
    for (; ;) {
        const statement = parseSTATEMENT(reading);
        if (statement === 'mismatch') break;
        if (statement === 'pending') continue;
        statements.push(statement);
    }
    return new NodeCASE(expr, statements);
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
function parseEXPR(reading: ReadingState): NodeEXPR | null {
    const exprTerm = parseEXPRTERM(reading);
    if (exprTerm === null) return null;
    const exprOp = parseEXPROP(reading);
    if (exprOp === null) return new NodeEXPR(exprTerm, null, null);
    const tail = parseEXPR(reading);
    if (tail === null) {
        diagnostic.addError(reading.next().location, "Expected expression");
        return new NodeEXPR(exprTerm, null, null);
    }
    return new NodeEXPR(exprTerm, exprOp, tail);
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function parseEXPRTERM(reading: ReadingState) {
    const exprTerm2 = parseEXPRTERM2(reading);
    if (exprTerm2 !== null) return exprTerm2;
    return null;
}

const preOpSet = new Set(['-', '+', '!', '++', '--', '~', '@']);
const opStopSet = new Set(['.', '[', '(', '++', '--']);

function parseEXPRTERM2(reading: ReadingState) {
    const rollbackPos = reading.getPos();
    let pre = null;
    if (preOpSet.has(reading.next().text)) {
        pre = reading.next();
        reading.confirm(HighlightToken.Operator);
    }

    const exprValue = parseEXPRVALUE(reading);
    if (exprValue === null) {
        reading.setPos(rollbackPos);
        return null;
    }

    let stop = null;
    if (opStopSet.has(reading.next().text)) {
        stop = reading.next();
        reading.confirm(HighlightToken.Operator);
    }
    return new NodeEXPRTERM2(pre, exprValue, stop);
}

// EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
function parseEXPRVALUE(reading: ReadingState): NodeEXPRVALUE | null {
    // TODO
    const funcCall = parseFUNCCALL(reading);
    if (funcCall !== null) return funcCall;

    const varAccess = parseVARACCESS(reading);
    if (varAccess !== null) return varAccess;

    const literal = parseLITERAL(reading);
    if (literal !== null) return literal;

    if (reading.next().text === '(') {
        reading.confirm(HighlightToken.Operator);
        const assign = parseASSIGN(reading);
        if (assign === null) {
            diagnostic.addError(reading.next().location, "Expected expression");
            return null;
        }
        reading.expect(')', HighlightToken.Operator);
        return assign;
    }

    return null;
}

// CONSTRUCTCALL ::= TYPE ARGLIST
// EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'
// EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']') | ARGLIST | '++' | '--'
// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK

// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
function parseLITERAL(reading: ReadingState) {
    const next = reading.next();
    if (next.kind === 'number') {
        reading.confirm(HighlightToken.Number);
        return next;
    }
    if (next.text === 'true' || next.text === 'false' || next.text === 'null') {
        reading.confirm(HighlightToken.Builtin);
        return next;
    }
    return null;
}

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
function parseFUNCCALL(reading: ReadingState) {
    const rollbackPos = reading.getPos();
    const scope = parseSCOPE(reading);
    const identifier = reading.next();
    if (identifier.kind !== 'identifier') {
        reading.setPos(rollbackPos);
        return null;
    }
    reading.confirm(HighlightToken.Function);
    const argList = parseARGLIST(reading);
    if (argList === null) {
        reading.setPos(rollbackPos);
        return null;
    }
    return new NodeFUNCCALL(scope, identifier, argList);
}

// VARACCESS     ::= SCOPE IDENTIFIER
function parseVARACCESS(reading: ReadingState) {
    const next = reading.next();
    if (next.kind !== 'identifier') return null;
    reading.confirm(HighlightToken.Variable);
    return new NodeVARACCESS(next);
}

// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
function parseARGLIST(reading: ReadingState): NodeARGLIST | null {
    if (reading.next().text !== '(') return null;
    reading.confirm(HighlightToken.Operator);
    const args: [TokenObject | null, NodeASSIGN][] = [];
    while (reading.isEnd() === false) {
        if (reading.next().text === ')') {
            reading.confirm(HighlightToken.Operator);
            break;
        }
        if (args.length > 0) {
            if (reading.expect(',', HighlightToken.Operator) === false) break;
        }
        let identifier = null;
        if (reading.next().kind === 'identifier' && reading.next(1).text === ':') {
            identifier = reading.next();
            reading.confirm(HighlightToken.Parameter);
            reading.confirm(HighlightToken.Operator);
        }
        const assign = parseASSIGN(reading);
        if (assign === null) {
            diagnostic.addError(reading.next().location, "Expected expression");
            continue;
        }
        args.push([identifier, assign]);
    }
    return new NodeARGLIST(args);
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
function parseASSIGN(reading: ReadingState): NodeASSIGN | null {
    const condition = parseCONDITION(reading);
    if (condition === null) return null;
    const op = parseASSIGNOP(reading);
    if (op === null) return new NodeASSIGN(condition, null, null);
    const assign = parseASSIGN(reading);
    return new NodeASSIGN(condition, op, assign);
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
function parseCONDITION(reading: ReadingState) {
    const expr = parseEXPR(reading);
    if (expr === null) return null;
    return new NodeCONDITION(expr, null, null);
}

// CONSTRUCTCALL ::= TYPE ARGLIST

// EXPROP        ::= MATHOP | COMPOP | LOGICOP | BITOP
function parseEXPROP(reading: ReadingState) {
    const candidates = [
        '+', '-', '*', '/', '%', '**',
        '==', '!=', '<', '<=', '>', '>=', 'is',
        '&&', '||', '^^', 'and', 'or', 'xor',
        '&', '|', '^', '<<', '>>', '>>>'
    ];
    if (candidates.includes(reading.next().text) === false) return null;
    const next = reading.next();
    reading.confirm(HighlightToken.Operator);
    return next;
}

// BITOP         ::= '&' | '|' | '^' | '<<' | '>>' | '>>>'
// MATHOP        ::= '+' | '-' | '*' | '/' | '%' | '**'
// COMPOP        ::= '==' | '!=' | '<' | '<=' | '>' | '>=' | 'is' | '!is'
// LOGICOP       ::= '&&' | '||' | '^^' | 'and' | 'or' | 'xor'

// ASSIGNOP      ::= '=' | '+=' | '-=' | '*=' | '/=' | '|=' | '&=' | '^=' | '%=' | '**=' | '<<=' | '>>=' | '>>>='
function parseASSIGNOP(reading: ReadingState) {
    if (assignOpSet.has(reading.next().text) === false) return null;
    const next = reading.next();
    reading.confirm(HighlightToken.Operator);
    return next;
}

const assignOpSet = new Set([
    '=', '+=', '-=', '*=', '/=', '|=', '&=', '^=', '%=', '**=', '<<=', '>>=', '>>>='
]);

export function parseFromTokens(tokens: TokenObject[]): NodeScript {
    const reading = new ReadingState(tokens);
    return parseSCRIPT(reading);
}

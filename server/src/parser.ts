// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_script_bnf.html

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
import {TokenObject} from "./tokenizer";
import {NodeDATATYPE, NodeFunc, NodePARAMLIST, NodeScript, NodeSTATEMENT, NodeType_} from "./nodes";
import {diagnostic} from "./diagnostic";
import {HighlightModifier, HighlightToken} from "./highlight";

class ReadingState {
    public constructor(
        private tokens: TokenObject[],
        private pos: number = 0
    ) {
    }

    public isEnd(): boolean {
        return this.pos >= this.tokens.length;
    }

    public next(): TokenObject {
        if (this.pos >= this.tokens.length) return this.tokens[this.tokens.length - 1];
        return this.tokens[this.pos];
    }

    public stepNext() {
        this.pos++;
    }

    public confirm(analyzeToken: HighlightToken, analyzedModifier: HighlightModifier | null = null) {
        const next = this.next();
        next.highlight.token = analyzeToken;
        if (next.highlight.modifier !== null) next.highlight.modifier = analyzedModifier as HighlightModifier;
        this.stepNext();
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

function tryConsume(reading: ReadingState, token: string) {
    if (reading.isEnd()) return false;
    if (reading.next().text !== token) return false;
    reading.stepNext();
    return true;
}

function expect(reading: ReadingState, token: string): boolean {
    if (reading.isEnd()) return false;
    if (reading.next().text !== token) return false;
    reading.stepNext();
    return true;
}

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
function parseSCRIPT(reading: ReadingState) {
    const funcs: NodeFunc[] = [];
    while (reading.isEnd() === false) {
        const func = parseFUNC(reading);
        if (func === null) continue;
        funcs.push(func);
    }
    return new NodeScript(funcs);
}

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
function parseFUNC(reading: ReadingState) {
    const type = parseTYPE(reading);
    if (type === null) return null;
    const identifier = reading.next();
    reading.stepNext();
    const paramlist = parsePARAMLIST(reading);
    const statblock = parseSTATBLOCK(reading);
    return new NodeFunc([], null, type, null, identifier, paramlist, false, null, statblock);
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))
// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST]} ';'
// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
// MIXIN         ::= 'mixin' CLASS
// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
function parseSTATBLOCK(reading: ReadingState): NodeSTATEMENT[] {
    // TODO: var にも対応するようにする
    reading.expect('{', HighlightToken.Keyword);
    while (reading.isEnd() === false) {
        if (reading.next().text === '}') break;
        // const var_ = parseVAR(reading); // TODO
        reading.stepNext();
    }
    reading.expect('}', HighlightToken.Keyword);
    return [];
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
function parsePARAMLIST(reading: ReadingState) {
    reading.expect('(', HighlightToken.Keyword);
    const types: NodeType_[] = [];
    const identifiers: TokenObject[] = [];
    for (; ;) {
        if (reading.isEnd() || reading.next().text === ')') break;
        const type = parseTYPE(reading);
        if (type === null) break;
        types.push(type);
        identifiers.push(reading.next());
        reading.stepNext();
        reading.expect(',', HighlightToken.Keyword);
    }
    reading.expect(')', HighlightToken.Keyword);
    return new NodePARAMLIST(types, identifiers);
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
function parseTYPE(reading: ReadingState) {
    // FIXME
    const datatype = parseDATATYPE(reading);
    if (datatype === null) return null;
    return new NodeType_(false, null, datatype, [], false, false);
}

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
function parseDATATYPE(reading: ReadingState) {
    // FIXME
    const next = reading.next();
    if (next.kind === "identifier") {
        reading.confirm(HighlightToken.Type);
        return new NodeDATATYPE(next);
    }
    diagnostic.addError(next.location, "Expected identifier");
    return null;
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

export function parseFromTokens(tokens: TokenObject[]): NodeScript {
    const reading = new ReadingState(tokens);
    return parseSCRIPT(reading);
}

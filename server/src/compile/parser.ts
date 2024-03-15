// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_script_bnf.html

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
import {TokenObject} from "./token";
import {
    AccessModifier,
    NodeARGLIST,
    NodeASSIGN,
    NodeBREAK,
    NodeCASE,
    NodeCLASS,
    NodeCONDITION,
    NodeCONTINUE,
    NodeDATATYPE,
    NodeDOWHILE,
    NodeEXPR,
    NodeEXPRPOSTOP,
    NodeEXPRPOSTOP1,
    NodeEXPRPOSTOP2,
    NodeEXPRSTAT,
    NodeEXPRTERM2,
    NodeEXPRVALUE,
    NodeFOR,
    NodeFUNC,
    NodeFUNCCALL,
    NodeFUNCDEF,
    NodeIF,
    NodePARAMLIST,
    NodeRETURN,
    NodeSCOPE,
    NodeSCRIPT,
    NodeSTATBLOCK,
    NodeSTATEMENT,
    NodeSWITCH,
    NodeTYPE,
    NodeVAR,
    NodeVARACCESS,
    NodeVIRTPROP,
    NodeWHILE
} from "./nodes";
import {diagnostic} from "../code/diagnostic";
import {HighlightModifier, HighlightToken} from "../code/highlight";

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
            diagnostic.addError(this.next().location, `Expected reserved word ${word}`);
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
    const script: NodeSCRIPT = [];
    while (reading.isEnd() === false) {
        const func = parseFUNC(reading);
        if (func !== null) {
            script.push(func);
            continue;
        }

        const class_ = parseCLASS(reading);
        if (class_ === 'pending') continue;
        if (class_ !== 'mismatch') {
            script.push(class_);
            continue;
        }

        diagnostic.addError(reading.next().location, "Unexpected token");
        reading.step();
    }
    return script;
}

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
function parseCLASS(reading: ReadingState): TriedParse<NodeCLASS> {
    if (reading.next().text !== 'class') return 'mismatch';
    reading.confirm(HighlightToken.Builtin);
    const identifier = reading.next();
    if (identifier.kind !== 'identifier') {
        diagnostic.addError(reading.next().location, "Expected identifier");
        return 'pending';
    }
    reading.confirm(HighlightToken.Class);
    const bases: TokenObject[] = [];
    if (reading.next().text === ':') {
        reading.confirm(HighlightToken.Operator);
        while (reading.isEnd() === false) {
            if (reading.next().text === '{') break;
            if (bases.length > 0) {
                if (reading.expect(',', HighlightToken.Operator) === false) break;
            }
            if (reading.next().kind !== 'identifier') {
                diagnostic.addError(reading.next().location, "Expected identifier");
                break;
            }
            bases.push(reading.next());
            reading.confirm(HighlightToken.Type);
        }
    }
    reading.expect('{', HighlightToken.Operator);
    const members: (NodeVIRTPROP | NodeVAR | NodeFUNC | NodeFUNCDEF)[] = [];
    for (; ;) {
        if (reading.isEnd()) {
            diagnostic.addError(reading.next().location, "Unexpected end of file");
            break;
        }
        if (reading.next().text === '}') {
            reading.confirm(HighlightToken.Operator);
            break;
        }
        const func = parseFUNC(reading);
        if (func !== null) {
            members.push(func);
            continue;
        }
        const var_ = parseVAR(reading);
        if (var_ !== null) {
            members.push(var_);
            continue;
        }
        diagnostic.addError(reading.next().location, "Expected class member");
        reading.step();
    }
    return {
        nodeName: 'CLASS',
        identifier: identifier,
        bases: bases,
        members: members
    };
}

// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
function parseFUNC(reading: ReadingState): NodeFUNC | null {
    const rollbackPos = reading.getPos();
    const accessor: AccessModifier = parseAccessModifier(reading);
    const returnType = parseTYPE(reading);
    if (returnType === null) return null;
    const identifier = reading.next();
    reading.step();
    const paramList = parsePARAMLIST(reading);
    if (paramList === null) {
        reading.setPos(rollbackPos);
        return null;
    }
    const statBlock = parseSTATBLOCK(reading) ?? {nodeName: 'STATBLOCK', statements: []};
    return {
        nodeName: 'FUNC',
        entity: [],
        accessor: accessor,
        returnType: returnType,
        ref: null,
        identifier: identifier,
        paramList: paramList,
        isConst: false,
        funcAttr: null,
        statBlock: statBlock
    };
}

// ['private' | 'protected']
function parseAccessModifier(reading: ReadingState): AccessModifier {
    const next = reading.next().text;
    if (next === 'private' || next === 'protected') {
        reading.confirm(HighlightToken.Builtin);
        return next;
    }
    return 'public';
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST]} ';'
function parseVAR(reading: ReadingState): NodeVAR | null {
    const rollbackPos = reading.getPos();

    const accessor: AccessModifier = parseAccessModifier(reading);

    const type = parseTYPE(reading);
    if (type === null) {
        // diagnostic.addError(reading.next().location, "Expected type");
        return null;
    }
    const variables: {
        identifier: TokenObject,
        initializer: NodeEXPR | NodeARGLIST | null
    }[] = [];
    while (reading.isEnd() === false) {
        // 識別子
        const identifier = reading.next();
        if (identifier.kind !== 'identifier') {
            if (variables.length === 0) {
                reading.setPos(rollbackPos);
                return null;
            } else {
                diagnostic.addError(reading.next().location, "Expected identifier");
            }
        }
        reading.confirm(HighlightToken.Variable);

        // 初期化子
        if (reading.next().text === ';') {
            reading.confirm(HighlightToken.Operator);
            variables.push({identifier: identifier, initializer: null});
            break;
        } else if (reading.next().text === '=') {
            reading.confirm(HighlightToken.Operator);
            const expr = parseEXPR(reading);
            if (expr === null) {
                diagnostic.addError(reading.next().location, "Expected expression");
                return null;
            }
            variables.push({identifier: identifier, initializer: expr});
        } else {
            const argList = parseARGLIST(reading);
            if (reading !== null) {
                variables.push({identifier: identifier, initializer: argList});
            }
        }

        // 追加または終了判定
        if (reading.next().text === ',') {
            reading.confirm(HighlightToken.Operator);
            continue;
        } else if (reading.next().text === ';') {
            reading.confirm(HighlightToken.Operator);
            break;
        }

        diagnostic.addError(reading.next().location, "Expected ',' or ';'");
        reading.step();
    }

    return {
        nodeName: 'VAR',
        accessor: accessor,
        type: type,
        variables: variables
    };
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
    const statements: (NodeVAR | NodeSTATEMENT)[] = [];
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
    return {
        nodeName: 'STATBLOCK',
        statements: statements
    };
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
function parsePARAMLIST(reading: ReadingState): NodePARAMLIST | null {
    if (reading.next().text !== '(') return null;
    reading.confirm(HighlightToken.Operator);
    const params: NodePARAMLIST = [];
    while (reading.isEnd() === false) {
        if (reading.next().text === ')') break;
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
function parseTYPE(reading: ReadingState): NodeTYPE | null {
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
    return {
        nodeName: 'TYPE',
        isConst: isConst,
        scope: scope,
        datatype: datatype,
        generics: [],
        array: false,
        ref: false
    };
}

// '<' TYPE {',' TYPE} '>'
function parseTypeParameters(reading: ReadingState): NodeTYPE[] | null {
    const rollbackPos = reading.getPos();
    if (reading.next().text !== '<') return null;
    reading.confirm(HighlightToken.Operator);
    const generics: NodeTYPE[] = [];
    while (reading.isEnd() === false) {
        if (reading.next().text === '>') {
            reading.confirm(HighlightToken.Operator);
            break;
        }
        if (generics.length > 0) {
            if (reading.next().text !== ',') {
                reading.setPos(rollbackPos);
                return null;
            }
            reading.confirm(HighlightToken.Operator);
        }
        const type = parseTYPE(reading);
        if (type === null) {
            reading.setPos(rollbackPos);
            return null;
        }
        generics.push(type);
    }
    return generics;
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
    while (reading.isEnd() === false) {
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
            const rollbackPos = reading.getPos();
            reading.confirm(HighlightToken.Class);
            const types = parseTypeParameters(reading);
            if (types === null || reading.next().text !== '::') {
                reading.setPos(rollbackPos);
                break;
            }
            reading.confirm(HighlightToken.Operator);
            return {
                nodeName: 'SCOPE',
                isGlobal: isGlobal,
                namespaces: namespaces,
                generic: {className: identifier, types: types}
            };
        }
        break;
    }
    if (isGlobal === false && namespaces.length === 0) {
        return null;
    }
    return {
        nodeName: 'SCOPE',
        isGlobal: isGlobal,
        namespaces: namespaces,
        generic: null
    };
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
function parseDATATYPE(reading: ReadingState): NodeDATATYPE | null {
    // FIXME
    const next = reading.next();
    if (reading.next().kind === 'identifier') {
        reading.confirm(HighlightToken.Type);
        return {
            nodeName: 'DATATYPE',
            identifier: next
        };
    }

    const primtype = parsePRIMTYPE(reading);
    if (primtype !== null) return {
        nodeName: 'DATATYPE',
        identifier: primtype
    };

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
    if (if_ !== 'mismatch') return if_;

    const for_ = parseFOR(reading);
    if (for_ === 'pending') return 'pending';
    if (for_ !== 'mismatch') return for_;

    const while_ = parseWHILE(reading);
    if (while_ === 'pending') return 'pending';
    if (while_ !== 'mismatch') return while_;

    const return_ = parseRETURN(reading);
    if (return_ === 'pending') return 'pending';
    if (return_ !== 'mismatch') return return_;

    const statBlock = parseSTATBLOCK(reading);
    if (statBlock !== null) return statBlock;

    const break_ = parseBREAK(reading);
    if (break_ !== null) return break_;

    const continue_ = parseCONTINUE(reading);
    if (continue_ !== null) return continue_;

    const dowhile = parseDOWHILE(reading);
    if (dowhile === 'pending') return 'pending';
    if (dowhile !== 'mismatch') return dowhile;

    const switch_ = parseSWITCH(reading);
    if (switch_ === 'pending') return 'pending';
    if (switch_ !== 'mismatch') return switch_;

    const exprStat = parseEXPRSTAT(reading);
    if (exprStat !== null) return exprStat;

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

    while (reading.isEnd() === false) {
        if (reading.isEnd() || reading.next().text === '}') break;
        const case_ = parseCASE(reading);
        if (case_ === 'mismatch') break;
        if (case_ === 'pending') continue;
        cases.push(case_);
    }
    reading.expect('}', HighlightToken.Operator);
    return {
        nodeName: 'SWITCH',
        assign: assign,
        cases: cases
    };
}

// BREAK         ::= 'break' ';'
function parseBREAK(reading: ReadingState): NodeBREAK | null {
    if (reading.next().text !== 'break') return null;
    reading.step();
    reading.expect(';', HighlightToken.Operator);
    return {nodeName: 'BREAK'};
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
    while (reading.isEnd() === false) {
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

    return {
        nodeName: 'FOR',
        initial: initial,
        condition: condition,
        increment: increment,
        statement: statement
    };
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

    return {
        nodeName: 'WHILE',
        assign: assign,
        statement: statement
    };
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
    return {
        nodeName: 'DOWHILE',
        statement: statement,
        assign: assign
    };
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
            return {
                nodeName: 'IF',
                condition: assign,
                ts: ts,
                fs: null
            };
        }
    }
    return {
        nodeName: 'IF',
        condition: assign,
        ts: ts,
        fs: fs
    };
}

// CONTINUE      ::= 'continue' ';'
function parseCONTINUE(reading: ReadingState): NodeCONTINUE | null {
    if (reading.next().text !== 'continue') return null;
    reading.step();
    reading.expect(';', HighlightToken.Operator);
    return {nodeName: 'CONTINUE'};
}

// EXPRSTAT      ::= [ASSIGN] ';'
function parseEXPRSTAT(reading: ReadingState): NodeEXPRSTAT | null {
    if (reading.next().text === ';') {
        reading.confirm(HighlightToken.Operator);
        return {
            nodeName: "EXPRSTAT",
            assign: null
        };
    }
    const assign = parseASSIGN(reading);
    if (assign === null) return null;
    reading.expect(';', HighlightToken.Operator);
    return {
        nodeName: "EXPRSTAT",
        assign: assign
    };
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
    return {
        nodeName: 'RETURN',
        assign: assign
    };
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
    while (reading.isEnd() === false) {
        const statement = parseSTATEMENT(reading);
        if (statement === 'mismatch') break;
        if (statement === 'pending') continue;
        statements.push(statement);
    }
    return {
        nodeName: 'CASE',
        expr: expr,
        statement: statements
    };
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
function parseEXPR(reading: ReadingState): NodeEXPR | null {
    const exprTerm = parseEXPRTERM(reading);
    if (exprTerm === null) return null;
    const exprOp = parseEXPROP(reading);
    if (exprOp === null) return {
        nodeName: 'EXPR',
        head: exprTerm,
        op: null,
        tail: null
    };
    const tail = parseEXPR(reading);
    if (tail === null) {
        diagnostic.addError(reading.next().location, "Expected expression");
        return {
            nodeName: 'EXPR',
            head: exprTerm,
            op: null,
            tail: null
        };
    }
    return {
        nodeName: 'EXPR',
        head: exprTerm,
        op: exprOp,
        tail: tail
    };
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function parseEXPRTERM(reading: ReadingState) {
    const exprTerm2 = parseEXPRTERM2(reading);
    if (exprTerm2 !== null) return exprTerm2;
    return null;
}

const preOpSet = new Set(['-', '+', '!', '++', '--', '~', '@']);

// const postOpSet = new Set(['.', '[', '(', '++', '--']);

function parseEXPRTERM2(reading: ReadingState): NodeEXPRTERM2 | null {
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

    const postOp = parseEXPRPOSTOP(reading);

    return {
        nodeName: 'EXPRTERM',
        exprTerm: 2,
        preOp: pre,
        value: exprValue,
        postOp: postOp
    };
}

// EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
function parseEXPRVALUE(reading: ReadingState): NodeEXPRVALUE | null {
    // TODO
    const funcCall = parseFUNCCALL(reading);
    if (funcCall !== null) return funcCall;

    const varAccess = parseVARACCESS(reading);
    if (varAccess !== null) return varAccess;

    const literal = parseLITERAL(reading);
    if (literal !== null) return {nodeName: 'LITERAL', value: literal};

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
function parseEXPRPOSTOP(reading: ReadingState): NodeEXPRPOSTOP | null {
    const exprPostOp1 = parseEXPRPOSTOP1(reading);
    if (exprPostOp1 !== null) return exprPostOp1;

    const exprPostOp2 = parseEXPRPOSTOP2(reading);
    if (exprPostOp2 !== null) return exprPostOp2;

    const argList = parseARGLIST(reading);
    if (argList !== null) return {
        nodeName: 'EXPRPOSTOP',
        postOp: 3,
        args: argList
    };

    const maybeOperator = reading.next().text;
    if (maybeOperator === '++' || maybeOperator === '--') {
        reading.confirm(HighlightToken.Operator);
        return {
            nodeName: 'EXPRPOSTOP',
            postOp: 4,
            operator: maybeOperator
        };
    }

    return null;
}

// ('.' (FUNCCALL | IDENTIFIER))
function parseEXPRPOSTOP1(reading: ReadingState): NodeEXPRPOSTOP1 | null {
    if (reading.next().text !== '.') return null;
    reading.confirm(HighlightToken.Operator);
    const funcCall = parseFUNCCALL(reading);
    if (funcCall !== null) return {
        nodeName: 'EXPRPOSTOP',
        postOp: 1,
        member: funcCall,
    };
    const identifier = reading.next();
    if (identifier.kind !== 'identifier') {
        diagnostic.addError(reading.next().location, "Expected identifier");
        return null;
    }
    reading.confirm(HighlightToken.Variable);
    return {
        nodeName: 'EXPRPOSTOP',
        postOp: 1,
        member: identifier
    };
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
function parseEXPRPOSTOP2(reading: ReadingState): NodeEXPRPOSTOP2 | null {
    if (reading.next().text !== '[') return null;
    reading.confirm(HighlightToken.Operator);
    const indexes: { identifier: TokenObject | null, assign: NodeASSIGN }[] = [];
    while (reading.isEnd() === false) {
        if (reading.next().text === ']') {
            if (indexes.length === 0) {
                diagnostic.addError(reading.next().location, "Expected index");
            }
            reading.confirm(HighlightToken.Operator);
            break;
        }
        if (indexes.length > 0) {
            if (reading.expect(',', HighlightToken.Operator) === false) break;
        }
        let identifier = null;
        if (reading.next(0).kind === 'identifier' && reading.next(1).text === ':') {
            identifier = reading.next();
            reading.confirm(HighlightToken.Parameter);
            reading.confirm(HighlightToken.Operator);
        }
        const assign = parseASSIGN(reading);
        if (assign === null) {
            diagnostic.addError(reading.next().location, "Expected expression");
            continue;
        }
        indexes.push({identifier: identifier, assign: assign});
    }
    return {
        nodeName: 'EXPRPOSTOP',
        postOp: 2,
        indexes: indexes
    };
}

// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK

// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
function parseLITERAL(reading: ReadingState) {
    const next = reading.next();
    if (next.kind === 'number') {
        reading.confirm(HighlightToken.Number);
        return next;
    }
    if (next.kind === 'string') {
        reading.confirm(HighlightToken.String);
        return next;
    }
    if (next.text === 'true' || next.text === 'false' || next.text === 'null') {
        reading.confirm(HighlightToken.Builtin);
        return next;
    }
    return null;
}

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
function parseFUNCCALL(reading: ReadingState): NodeFUNCCALL | null {
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
    return {
        nodeName: 'FUNCCALL',
        scope: scope,
        identifier: identifier,
        argList: argList
    };
}

// VARACCESS     ::= SCOPE IDENTIFIER
function parseVARACCESS(reading: ReadingState): NodeVARACCESS | null {
    const next = reading.next();
    if (next.kind !== 'identifier') return null;
    const isBuiltin: boolean = next.text === 'this';
    reading.confirm(isBuiltin ? HighlightToken.Builtin : HighlightToken.Variable);
    return {
        nodeName: 'VARACCESS',
        identifier: next
    };
}

// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
function parseARGLIST(reading: ReadingState): NodeARGLIST | null {
    if (reading.next().text !== '(') return null;
    reading.confirm(HighlightToken.Operator);
    const args: { identifier: TokenObject | null, assign: NodeASSIGN }[] = [];
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
            reading.step();
            continue;
        }
        args.push({identifier: identifier, assign: assign});
    }
    return {
        nodeName: 'ARGLIST',
        args: args
    };
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
function parseASSIGN(reading: ReadingState): NodeASSIGN | null {
    const condition = parseCONDITION(reading);
    if (condition === null) return null;
    const op = parseASSIGNOP(reading);
    if (op === null) return {
        nodeName: 'ASSIGN',
        condition: condition,
        op: null,
        assign: null
    };
    const assign = parseASSIGN(reading);
    return {
        nodeName: 'ASSIGN',
        condition: condition,
        op: op,
        assign: assign
    };
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
function parseCONDITION(reading: ReadingState): NodeCONDITION | null {
    const expr = parseEXPR(reading);
    if (expr === null) return null;
    return {
        nodeName: 'CONDITION',
        expr: expr,
        ta: null,
        fa: null
    };
}

// CONSTRUCTCALL ::= TYPE ARGLIST

// EXPROP        ::= MATHOP | COMPOP | LOGICOP | BITOP
function parseEXPROP(reading: ReadingState) {
    if (exprOpSet.has(reading.next().text) === false) return null;
    const next = reading.next();
    reading.confirm(HighlightToken.Operator);
    return next;
}

const exprOpSet = new Set([
    '+', '-', '*', '/', '%', '**',
    '==', '!=', '<', '<=', '>', '>=', 'is',
    '&&', '||', '^^', 'and', 'or', 'xor',
    '&', '|', '^', '<<', '>>', '>>>'
]);

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

export function parseFromTokens(tokens: TokenObject[]): NodeSCRIPT {
    const reading = new ReadingState(tokens);
    return parseSCRIPT(reading);
}

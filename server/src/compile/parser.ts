// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_script_bnf.html

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
import {TokenObject} from "./token";
import {
    AccessModifier, EntityModifier,
    NodeARGLIST,
    NodeASSIGN,
    NodeBREAK,
    NodeCASE, NodeCAST,
    NodeCLASS,
    NodeCONDITION, NodeCONSTRUCTCALL,
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
    NodeIF, NodeLAMBDA, NodeNAMESPACE,
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
    NodeWHILE, TypeModifier
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

    public confirm(analyzeToken: HighlightToken, analyzedModifier: HighlightModifier | undefined = undefined) {
        const next = this.next();
        next.highlight.token = analyzeToken;
        if (analyzedModifier !== undefined) next.highlight.modifier = analyzedModifier;
        this.step();
    }

    public expect(word: string, analyzeToken: HighlightToken, analyzedModifier: HighlightModifier | undefined = undefined) {
        if (this.isEnd()) {
            diagnostic.addError(this.next().location, "Unexpected end of file ❌");
            return false;
        }
        if (this.next().kind !== "reserved") {
            diagnostic.addError(this.next().location, `Expected reserved word 👉 ${word} 👈`);
            return false;
        }
        if (this.next().text !== word) {
            diagnostic.addError(this.next().location, `Expected reserved word 👉 ${word} 👈`);
            return false;
        }
        this.confirm(analyzeToken, analyzedModifier);
        return true;
    }
}

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
function parseSCRIPT(reading: ReadingState): NodeSCRIPT {
    const script: NodeSCRIPT = [];
    while (reading.isEnd() === false) {
        const func = parseFUNC(reading);
        if (func !== undefined) {
            script.push(func);
            continue;
        }

        const class_ = parseCLASS(reading);
        if (class_ === 'pending') continue;
        if (class_ !== 'mismatch') {
            script.push(class_);
            continue;
        }

        const namespace_ = parseNAMESPACE(reading);
        if (namespace_ === 'pending') continue;
        if (namespace_ !== 'mismatch') {
            script.push(namespace_);
            continue;
        }

        if (reading.next().text === ';') {
            reading.confirm(HighlightToken.Operator);
            continue;
        }

        break;
    }
    return script;
}

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
function parseNAMESPACE(reading: ReadingState): TriedParse<NodeNAMESPACE> {
    if (reading.next().text !== 'namespace') return 'mismatch';
    reading.confirm(HighlightToken.Builtin);

    const namespaces: TokenObject[] = [];
    while (reading.isEnd() === false) {
        if (reading.next().text === '{') {
            if (namespaces.length === 0) {
                diagnostic.addError(reading.next().location, "Expected identifier 🐚");
            }
            reading.confirm(HighlightToken.Operator);
            break;
        }
        if (namespaces.length > 0) {
            if (reading.expect('::', HighlightToken.Operator) === false) continue;
        }
        const identifier = reading.next();
        if (identifier.kind !== 'identifier') {
            diagnostic.addError(reading.next().location, "Expected identifier 🐚");
            break;
        }
        reading.confirm(HighlightToken.Namespace);
        namespaces.push(identifier);
    }

    if (namespaces.length === 0) {
        return 'pending';
    }

    const script = parseSCRIPT(reading);
    reading.expect('}', HighlightToken.Operator);
    return {
        nodeName: 'NAMESPACE',
        namespaces: namespaces,
        script: script
    };
}

// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))

function parseEntityModifier(reading: ReadingState): EntityModifier | undefined {
    let modifier: EntityModifier | undefined = undefined;
    while (reading.isEnd() === false) {
        const next = reading.next().text;
        if (next === 'shared' || next === 'external') {
            if (modifier === undefined) {
                modifier = {isShared: false, isExternal: false};
            }
            if (next === 'shared') modifier.isShared = true;
            else if (next === 'external') modifier.isExternal = true;
            reading.confirm(HighlightToken.Builtin);
        } else break;
    }

    return modifier;

}

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
        if (func !== undefined) {
            members.push(func);
            continue;
        }
        const var_ = parseVAR(reading);
        if (var_ !== undefined) {
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
function parseFUNC(reading: ReadingState): NodeFUNC | undefined {
    const rollbackPos = reading.getPos();
    const entity = parseEntityModifier(reading);
    const accessor = parseAccessModifier(reading);
    let head: { returnType: NodeTYPE; isRef: boolean; } | '~';
    if (reading.next().text === '~') {
        reading.confirm(HighlightToken.Operator);
        head = '~';
    } else {
        const returnType = parseTYPE(reading);
        if (returnType === undefined) {
            reading.setPos(rollbackPos);
            return undefined;
        }
        const isRef = reading.next().text === '&';
        if (isRef) reading.confirm(HighlightToken.Builtin);
        head = {returnType: returnType, isRef: isRef};
    }
    const identifier = reading.next();
    reading.step();
    const paramList = parsePARAMLIST(reading);
    if (paramList === undefined) {
        reading.setPos(rollbackPos);
        return undefined;
    }
    const statBlock = parseSTATBLOCK(reading) ?? {nodeName: 'STATBLOCK', statements: []};
    return {
        nodeName: 'FUNC',
        entity: entity,
        accessor: accessor,
        head: head,
        identifier: identifier,
        paramList: paramList,
        isConst: false,
        funcAttr: undefined,
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
function parseVAR(reading: ReadingState): NodeVAR | undefined {
    const rollbackPos = reading.getPos();

    const accessor: AccessModifier = parseAccessModifier(reading);

    const type = parseTYPE(reading);
    if (type === undefined) {
        // diagnostic.addError(reading.next().location, "Expected type");
        return undefined;
    }
    const variables: {
        identifier: TokenObject,
        initializer: NodeEXPR | NodeARGLIST | undefined
    }[] = [];
    while (reading.isEnd() === false) {
        // 識別子
        const identifier = reading.next();
        if (identifier.kind !== 'identifier') {
            if (variables.length === 0) {
                reading.setPos(rollbackPos);
                return undefined;
            } else {
                diagnostic.addError(reading.next().location, "Expected identifier");
            }
        }
        reading.confirm(HighlightToken.Variable);

        // 初期化子
        if (reading.next().text === ';') {
            reading.confirm(HighlightToken.Operator);
            variables.push({identifier: identifier, initializer: undefined});
            break;
        } else if (reading.next().text === '=') {
            reading.confirm(HighlightToken.Operator);
            const expr = parseEXPR(reading);
            if (expr === undefined) {
                diagnostic.addError(reading.next().location, "Expected expression");
                return undefined;
            }
            variables.push({identifier: identifier, initializer: expr});
        } else {
            const argList = parseARGLIST(reading);
            if (reading !== undefined) {
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
function parseSTATBLOCK(reading: ReadingState): NodeSTATBLOCK | undefined {
    if (reading.next().text !== '{') return undefined;
    reading.step();
    const statements: (NodeVAR | NodeSTATEMENT)[] = [];
    while (reading.isEnd() === false) {
        if (reading.next().text === '}') break;
        const var_ = parseVAR(reading);
        if (var_ !== undefined) {
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
function parsePARAMLIST(reading: ReadingState): NodePARAMLIST | undefined {
    if (reading.next().text !== '(') return undefined;
    if (reading.next().text === 'void') {
        reading.confirm(HighlightToken.Builtin);
        reading.expect(')', HighlightToken.Operator);
        return [];
    }
    reading.confirm(HighlightToken.Operator);
    const params: NodePARAMLIST = [];
    while (reading.isEnd() === false) {
        if (reading.next().text === ')') break;
        if (params.length > 0) {
            if (reading.expect(',', HighlightToken.Operator) === false) break;
        }
        const type = parseTYPE(reading);
        if (type === undefined) break;
        if (reading.next().kind === 'identifier') {
            params.push({type: type, identifier: reading.next()});
            reading.step();
        } else {
            params.push({type: type, identifier: undefined});
        }
    }

    reading.expect(')', HighlightToken.Operator);
    return params;
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]
function parseTYPEMOD(reading: ReadingState): TypeModifier | undefined {
    if (reading.next().text !== '&') return undefined;
    reading.confirm(HighlightToken.Builtin);
    const next = reading.next().text;
    if (next === 'in' || next === 'out' || next === 'inout') {
        reading.confirm(HighlightToken.Builtin);
        return next;
    } else {
        return 'inout';
    }
}

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
function parseTYPE(reading: ReadingState): NodeTYPE | undefined {
    const rollbackPos = reading.getPos();
    let isConst = false;
    if (reading.next().text === 'const') {
        reading.confirm(HighlightToken.Keyword);
        isConst = true;
    }
    const scope = parseSCOPE(reading);
    const datatype = parseDATATYPE(reading);
    if (datatype === undefined) {
        reading.setPos(rollbackPos);
        return undefined;
    }
    const generics = parseTypeParameters(reading) ?? [];
    return {
        nodeName: 'TYPE',
        isConst: isConst,
        scope: scope,
        datatype: datatype,
        generics: generics,
        array: false,
        ref: false
    };
}

// '<' TYPE {',' TYPE} '>'
function parseTypeParameters(reading: ReadingState): NodeTYPE[] | undefined {
    const rollbackPos = reading.getPos();
    if (reading.next().text !== '<') return undefined;
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
                return undefined;
            }
            reading.confirm(HighlightToken.Operator);
        }
        const type = parseTYPE(reading);
        if (type === undefined) {
            reading.setPos(rollbackPos);
            return undefined;
        }
        generics.push(type);
    }
    if (generics.length == 0) {
        diagnostic.addError(reading.next().location, "Expected type parameter 🪹");
    }
    return generics;
}

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'

// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
function parseSCOPE(reading: ReadingState): NodeSCOPE | undefined {
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
            if (types === undefined || reading.next().text !== '::') {
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
        return undefined;
    }
    return {
        nodeName: 'SCOPE',
        isGlobal: isGlobal,
        namespaces: namespaces,
        generic: undefined
    };
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
function parseDATATYPE(reading: ReadingState): NodeDATATYPE | undefined {
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
    if (primtype !== undefined) return {
        nodeName: 'DATATYPE',
        identifier: primtype
    };

    return undefined;
}

// PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
function parsePRIMTYPE(reading: ReadingState) {
    const next = reading.next();
    if (primeTypeSet.has(next.text) === false) return undefined;
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
    if (statBlock !== undefined) return statBlock;

    const break_ = parseBREAK(reading);
    if (break_ !== undefined) return break_;

    const continue_ = parseCONTINUE(reading);
    if (continue_ !== undefined) return continue_;

    const dowhile = parseDOWHILE(reading);
    if (dowhile === 'pending') return 'pending';
    if (dowhile !== 'mismatch') return dowhile;

    const switch_ = parseSWITCH(reading);
    if (switch_ === 'pending') return 'pending';
    if (switch_ !== 'mismatch') return switch_;

    const exprStat = parseEXPRSTAT(reading);
    if (exprStat !== undefined) return exprStat;

    return 'mismatch';
}

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
function parseSWITCH(reading: ReadingState): TriedParse<NodeSWITCH> {
    if (reading.next().text !== 'switch') return 'mismatch';
    reading.step();
    reading.expect('(', HighlightToken.Operator);
    const assign = parseASSIGN(reading);
    if (assign === undefined) {
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
function parseBREAK(reading: ReadingState): NodeBREAK | undefined {
    if (reading.next().text !== 'break') return undefined;
    reading.step();
    reading.expect(';', HighlightToken.Operator);
    return {nodeName: 'BREAK'};
}

// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
function parseFOR(reading: ReadingState): TriedParse<NodeFOR> {
    if (reading.next().text !== 'for') return 'mismatch';
    reading.step();
    reading.expect('(', HighlightToken.Operator);

    const initial: NodeEXPRSTAT | NodeVAR | undefined = parseEXPRSTAT(reading) ?? parseVAR(reading);
    if (initial === undefined) {
        diagnostic.addError(reading.next().location, "Expected initial expression or variable declaration");
        return 'pending';
    }

    const condition = parseEXPRSTAT(reading);
    if (condition === undefined) {
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
        if (assign === undefined) break;
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
    if (assign === undefined) {
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
    if (assign === undefined) {
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
    if (assign === undefined) {
        diagnostic.addError(reading.next().location, "Expected condition expression");
        return 'pending';
    }
    reading.expect(')', HighlightToken.Operator);
    const ts = parseSTATEMENT(reading);
    if (ts === 'mismatch' || ts === 'pending') return 'pending';
    let fs = undefined;
    if (reading.next().text === 'else') {
        fs = parseSTATEMENT(reading);
        if (fs === 'mismatch' || fs === 'pending') {
            diagnostic.addError(reading.next().location, "Expected statement");
            return {
                nodeName: 'IF',
                condition: assign,
                ts: ts,
                fs: undefined
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
function parseCONTINUE(reading: ReadingState): NodeCONTINUE | undefined {
    if (reading.next().text !== 'continue') return undefined;
    reading.step();
    reading.expect(';', HighlightToken.Operator);
    return {nodeName: 'CONTINUE'};
}

// EXPRSTAT      ::= [ASSIGN] ';'
function parseEXPRSTAT(reading: ReadingState): NodeEXPRSTAT | undefined {
    if (reading.next().text === ';') {
        reading.confirm(HighlightToken.Operator);
        return {
            nodeName: "EXPRSTAT",
            assign: undefined
        };
    }
    const assign = parseASSIGN(reading);
    if (assign === undefined) return undefined;
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
    if (assign === undefined) {
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
    let expr = undefined;
    if (reading.next().text === 'case') {
        reading.step();
        expr = parseEXPR(reading);
        if (expr === undefined) {
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
        statements: statements
    };
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
function parseEXPR(reading: ReadingState): NodeEXPR | undefined {
    const exprTerm = parseEXPRTERM(reading);
    if (exprTerm === undefined) return undefined;
    const exprOp = parseEXPROP(reading);
    if (exprOp === undefined) return {
        nodeName: 'EXPR',
        head: exprTerm,
        op: undefined,
        tail: undefined
    };
    const tail = parseEXPR(reading);
    if (tail === undefined) {
        diagnostic.addError(reading.next().location, "Expected expression");
        return {
            nodeName: 'EXPR',
            head: exprTerm,
            op: undefined,
            tail: undefined
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
    if (exprTerm2 !== undefined) return exprTerm2;
    return undefined;
}

const preOpSet = new Set(['-', '+', '!', '++', '--', '~', '@']);

// const postOpSet = new Set(['.', '[', '(', '++', '--']);

// ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function parseEXPRTERM2(reading: ReadingState): NodeEXPRTERM2 | undefined {
    const rollbackPos = reading.getPos();
    let pre = undefined;
    if (preOpSet.has(reading.next().text)) {
        pre = reading.next();
        reading.confirm(HighlightToken.Operator);
    }

    const exprValue = parseEXPRVALUE(reading);
    if (exprValue === 'mismatch') reading.setPos(rollbackPos);
    if (exprValue === 'mismatch' || exprValue === 'pending') {
        return undefined;
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
function parseEXPRVALUE(reading: ReadingState): TriedParse<NodeEXPRVALUE> {
    const lambda = parseLAMBDA(reading);
    if (lambda === 'pending') return 'pending';
    if (lambda !== 'mismatch') return lambda;

    const cast = parseCAST(reading);
    if (cast === 'pending') return 'pending';
    if (cast !== 'mismatch') return cast;

    if (reading.next().text === '(') {
        reading.confirm(HighlightToken.Operator);
        const assign = parseASSIGN(reading);
        if (assign === undefined) {
            diagnostic.addError(reading.next().location, "Expected expression 🖼️");
            return 'pending';
        }
        reading.expect(')', HighlightToken.Operator);
        return assign;
    }

    const literal = parseLITERAL(reading);
    if (literal !== undefined) return {nodeName: 'LITERAL', value: literal};

    const funcCall = parseFUNCCALL(reading);
    if (funcCall !== undefined) return funcCall;

    const constructCall = parseCONSTRUCTCALL(reading);
    if (constructCall !== undefined) return constructCall;

    const varAccess = parseVARACCESS(reading);
    if (varAccess !== undefined) return varAccess;

    return 'mismatch';
}

// CONSTRUCTCALL ::= TYPE ARGLIST
function parseCONSTRUCTCALL(reading: ReadingState): NodeCONSTRUCTCALL | undefined {
    const rollbackPos = reading.getPos();
    const type = parseTYPE(reading);
    if (type === undefined) return undefined;

    const argList = parseARGLIST(reading);
    if (argList === undefined) {
        reading.setPos(rollbackPos);
        return undefined;
    }

    return {
        nodeName: 'CONSTRUCTCALL',
        type: type,
        argList: argList
    };
}

// EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']') | ARGLIST | '++' | '--'
function parseEXPRPOSTOP(reading: ReadingState): NodeEXPRPOSTOP | undefined {
    const exprPostOp1 = parseEXPRPOSTOP1(reading);
    if (exprPostOp1 !== undefined) return exprPostOp1;

    const exprPostOp2 = parseEXPRPOSTOP2(reading);
    if (exprPostOp2 !== undefined) return exprPostOp2;

    const argList = parseARGLIST(reading);
    if (argList !== undefined) return {
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

    return undefined;
}

// ('.' (FUNCCALL | IDENTIFIER))
function parseEXPRPOSTOP1(reading: ReadingState): NodeEXPRPOSTOP1 | undefined {
    if (reading.next().text !== '.') return undefined;
    reading.confirm(HighlightToken.Operator);
    const funcCall = parseFUNCCALL(reading);
    if (funcCall !== undefined) return {
        nodeName: 'EXPRPOSTOP',
        postOp: 1,
        member: funcCall,
    };
    const identifier = reading.next();
    if (identifier.kind !== 'identifier') {
        diagnostic.addError(reading.next().location, "Expected identifier");
        return undefined;
    }
    reading.confirm(HighlightToken.Variable);
    return {
        nodeName: 'EXPRPOSTOP',
        postOp: 1,
        member: identifier
    };
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
function parseEXPRPOSTOP2(reading: ReadingState): NodeEXPRPOSTOP2 | undefined {
    if (reading.next().text !== '[') return undefined;
    reading.confirm(HighlightToken.Operator);
    const indexes: { identifier: TokenObject | undefined, assign: NodeASSIGN }[] = [];
    while (reading.isEnd() === false) {
        if (reading.next().text === ']') {
            if (indexes.length === 0) {
                diagnostic.addError(reading.next().location, "Expected index 📮");
            }
            reading.confirm(HighlightToken.Operator);
            break;
        }
        if (indexes.length > 0) {
            if (reading.expect(',', HighlightToken.Operator) === false) break;
        }
        let identifier = undefined;
        if (reading.next(0).kind === 'identifier' && reading.next(1).text === ':') {
            identifier = reading.next();
            reading.confirm(HighlightToken.Parameter);
            reading.confirm(HighlightToken.Operator);
        }
        const assign = parseASSIGN(reading);
        if (assign === undefined) {
            diagnostic.addError(reading.next().location, "Expected expression 📮");
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
function parseCAST(reading: ReadingState): TriedParse<NodeCAST> {
    if (reading.next().text !== 'cast') return 'mismatch';
    reading.confirm(HighlightToken.Keyword);
    reading.expect('<', HighlightToken.Operator);
    const type = parseTYPE(reading);
    if (type === undefined) {
        diagnostic.addError(reading.next().location, "Expected type");
        return 'pending';
    }
    reading.expect('>', HighlightToken.Operator);
    reading.expect('(', HighlightToken.Operator);
    const assign = parseASSIGN(reading);
    if (assign === undefined) {
        diagnostic.addError(reading.next().location, "Expected expression");
        return 'pending';
    }
    reading.expect(')', HighlightToken.Operator);
    return {
        nodeName: 'CAST',
        type: type,
        assign: assign
    };
}

// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
const parseLAMBDA = (reading: ReadingState): TriedParse<NodeLAMBDA> => {
    if (reading.next().text !== 'function') return 'mismatch';
    reading.confirm(HighlightToken.Keyword);
    reading.expect('(', HighlightToken.Operator);
    const params: {
        type: NodeTYPE | undefined,
        typeMod: TypeModifier | undefined,
        identifier: TokenObject | undefined
    }[] = [];
    while (reading.isEnd() === false) {
        if (reading.next().text === ')') {
            reading.confirm(HighlightToken.Operator);
            break;
        }
        if (params.length > 0) {
            if (reading.expect(',', HighlightToken.Operator) === false) continue;
        }

        if (reading.next(0).kind === 'identifier' && reading.next(1).kind === 'reserved') {
            reading.confirm(HighlightToken.Parameter);
            params.push({type: undefined, typeMod: undefined, identifier: reading.next()});
            continue;
        }

        const type = parseTYPE(reading);
        const typeMod = type !== undefined ? parseTYPEMOD(reading) : undefined;

        let identifier: TokenObject | undefined = undefined;
        if (reading.next().kind === 'identifier') {
            identifier = reading.next();
            reading.confirm(HighlightToken.Parameter);
        }
        params.push({type: type, typeMod: typeMod, identifier: identifier});
    }
    const statBlock = parseSTATBLOCK(reading);
    if (statBlock === undefined) {
        diagnostic.addError(reading.next().location, "Expected statement block 🪔");
        return 'pending';
    }
    return {
        nodeName: 'LAMBDA',
        params: params,
        statBlock: statBlock
    };
};

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
    return undefined;
}

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
function parseFUNCCALL(reading: ReadingState): NodeFUNCCALL | undefined {
    const rollbackPos = reading.getPos();
    const scope = parseSCOPE(reading);
    const identifier = reading.next();
    if (identifier.kind !== 'identifier') {
        reading.setPos(rollbackPos);
        return undefined;
    }
    reading.confirm(HighlightToken.Function);
    const argList = parseARGLIST(reading);
    if (argList === undefined) {
        reading.setPos(rollbackPos);
        return undefined;
    }
    return {
        nodeName: 'FUNCCALL',
        scope: scope,
        identifier: identifier,
        argList: argList
    };
}

// VARACCESS     ::= SCOPE IDENTIFIER
function parseVARACCESS(reading: ReadingState): NodeVARACCESS | undefined {
    const scope = parseSCOPE(reading);
    const next = reading.next();
    if (next.kind !== 'identifier') {
        if (scope !== undefined) {
            diagnostic.addError(reading.next().location, "Expected identifier");
        }
        return undefined;
    }
    const isBuiltin: boolean = next.text === 'this';
    reading.confirm(isBuiltin ? HighlightToken.Builtin : HighlightToken.Variable);
    return {
        nodeName: 'VARACCESS',
        scope: scope,
        identifier: next
    };
}

// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
function parseARGLIST(reading: ReadingState): NodeARGLIST | undefined {
    if (reading.next().text !== '(') return undefined;
    reading.confirm(HighlightToken.Operator);
    const args: { identifier: TokenObject | undefined, assign: NodeASSIGN }[] = [];
    while (reading.isEnd() === false) {
        if (reading.next().text === ')') {
            reading.confirm(HighlightToken.Operator);
            break;
        }
        if (args.length > 0) {
            if (reading.expect(',', HighlightToken.Operator) === false) break;
        }
        let identifier = undefined;
        if (reading.next().kind === 'identifier' && reading.next(1).text === ':') {
            identifier = reading.next();
            reading.confirm(HighlightToken.Parameter);
            reading.confirm(HighlightToken.Operator);
        }
        const assign = parseASSIGN(reading);
        if (assign === undefined) {
            diagnostic.addError(reading.next().location, "Expected expression 🍡");
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
function parseASSIGN(reading: ReadingState): NodeASSIGN | undefined {
    const condition = parseCONDITION(reading);
    if (condition === undefined) return undefined;
    const op = parseASSIGNOP(reading);
    const result: NodeASSIGN = {
        nodeName: 'ASSIGN',
        condition: condition,
        tail: undefined
    };
    if (op === undefined) return result;
    const assign = parseASSIGN(reading);
    if (assign === undefined) return result;
    result.tail = {op: op, assign: assign};
    return result;
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
function parseCONDITION(reading: ReadingState): NodeCONDITION | undefined {
    const expr = parseEXPR(reading);
    if (expr === undefined) return undefined;
    const result: NodeCONDITION = {
        nodeName: 'CONDITION',
        expr: expr,
        ternary: undefined
    };
    if (reading.next().text === '?') {
        reading.confirm(HighlightToken.Operator);
        const ta = parseASSIGN(reading);
        if (ta === undefined) {
            diagnostic.addError(reading.next().location, "Expected expression 🤹");
            return result;
        }
        reading.expect(':', HighlightToken.Operator);
        const fa = parseASSIGN(reading);
        if (fa === undefined) {
            diagnostic.addError(reading.next().location, "Expected expression 🤹");
            return result;
        }
        result.ternary = {ta: ta, fa: fa};
    }
    return result;
}

// EXPROP        ::= MATHOP | COMPOP | LOGICOP | BITOP
function parseEXPROP(reading: ReadingState) {
    if (exprOpSet.has(reading.next().text) === false) return undefined;
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
    if (assignOpSet.has(reading.next().text) === false) return undefined;
    const next = reading.next();
    reading.confirm(HighlightToken.Operator);
    return next;
}

const assignOpSet = new Set([
    '=', '+=', '-=', '*=', '/=', '|=', '&=', '^=', '%=', '**=', '<<=', '>>=', '>>>='
]);

export function parseFromTokens(tokens: TokenObject[]): NodeSCRIPT {
    const reading = new ReadingState(tokens);
    const script: NodeSCRIPT = [];
    while (reading.isEnd() === false) {
        script.push(...parseSCRIPT(reading));
        if (reading.isEnd() === false) {
            diagnostic.addError(reading.next().location, "Unexpected token ⚠️");
            reading.step();
        }
    }

    return script;
}

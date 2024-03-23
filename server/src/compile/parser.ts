// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_script_bnf.html

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
import {TokenizingToken} from "./token";
import {
    AccessModifier, EntityModifier,
    NodeArgList,
    NodeAssign,
    NodeBreak,
    NodeCASE, NodeCast,
    NodeClass,
    NodeCondition, NodeConstructCall,
    NodeContinue,
    NodeDATATYPE,
    NodeDoWhile,
    NodeEXPR,
    NodeExprPostOp,
    NodeExprPostOp1,
    NodeExprPostOp2,
    NodeExprStat,
    NodeEXPRTERM2,
    NodeExprValue,
    NodeFor,
    NodeFunc,
    NodeFuncCall,
    NodeFuncDef,
    NodeIf, NodeLambda, NodeLiteral, NodeNamespace,
    NodeParamList,
    NodeReturn,
    NodeScope,
    NodeScript,
    NodeStatBlock,
    NodeStatement,
    NodeSwitch,
    NodeType,
    NodeVar,
    NodeVarAccess,
    NodeVirtProp,
    NodeWhile, TypeModifier
} from "./nodes";
import {diagnostic} from "../code/diagnostic";
import {HighlightTokenKind} from "../code/highlight";
import {ParsingState, ParsingToken, TriedParse} from "./parsing";

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
function parseSCRIPT(parsing: ParsingState): NodeScript {
    const script: NodeScript = [];
    while (parsing.isEnd() === false) {
        const func = parseFunc(parsing);
        if (func !== undefined) {
            script.push(func);
            continue;
        }

        const class_ = parseCLASS(parsing);
        if (class_ === 'pending') continue;
        if (class_ !== 'mismatch') {
            script.push(class_);
            continue;
        }

        const namespace_ = parseNAMESPACE(parsing);
        if (namespace_ === 'pending') continue;
        if (namespace_ !== 'mismatch') {
            script.push(namespace_);
            continue;
        }

        if (parsing.next().text === ';') {
            parsing.confirm(HighlightTokenKind.Operator);
            continue;
        }

        break;
    }
    return script;
}

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
function parseNAMESPACE(parsing: ParsingState): TriedParse<NodeNamespace> {
    if (parsing.next().text !== 'namespace') return 'mismatch';
    const rangeStart = parsing.next();
    parsing.confirm(HighlightTokenKind.Builtin);

    const namespaces: ParsingToken[] = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === '{') {
            if (namespaces.length === 0) {
                diagnostic.addError(parsing.next().location, "Expected identifier 🐚");
            }
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }
        if (namespaces.length > 0) {
            if (parsing.expect('::', HighlightTokenKind.Operator) === false) continue;
        }
        const identifier = parsing.next();
        if (identifier.kind !== 'identifier') {
            diagnostic.addError(parsing.next().location, "Expected identifier 🐚");
            break;
        }
        parsing.confirm(HighlightTokenKind.Namespace);
        namespaces.push(identifier);
    }

    if (namespaces.length === 0) {
        return 'pending';
    }

    const script = parseSCRIPT(parsing);
    parsing.expect('}', HighlightTokenKind.Operator);
    return {
        nodeName: 'Namespace',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        namespaceList: namespaces,
        script: script
    };
}

// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))

function parseEntityModifier(parsing: ParsingState): EntityModifier | undefined {
    let modifier: EntityModifier | undefined = undefined;
    while (parsing.isEnd() === false) {
        const next = parsing.next().text;
        if (next === 'shared' || next === 'external') {
            if (modifier === undefined) {
                modifier = {isShared: false, isExternal: false};
            }
            if (next === 'shared') modifier.isShared = true;
            else if (next === 'external') modifier.isExternal = true;
            parsing.confirm(HighlightTokenKind.Builtin);
        } else break;
    }

    return modifier;

}

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
function parseCLASS(parsing: ParsingState): TriedParse<NodeClass> {
    const rangeStart = parsing.next();
    if (parsing.next().text !== 'class') return 'mismatch';
    parsing.confirm(HighlightTokenKind.Builtin);
    const identifier = parsing.next();
    if (identifier.kind !== 'identifier') {
        diagnostic.addError(parsing.next().location, "Expected identifier");
        return 'pending';
    }
    parsing.confirm(HighlightTokenKind.Class);
    const baseList: ParsingToken[] = [];
    if (parsing.next().text === ':') {
        parsing.confirm(HighlightTokenKind.Operator);
        while (parsing.isEnd() === false) {
            if (parsing.next().text === '{') break;
            if (baseList.length > 0) {
                if (parsing.expect(',', HighlightTokenKind.Operator) === false) break;
            }
            if (parsing.next().kind !== 'identifier') {
                diagnostic.addError(parsing.next().location, "Expected identifier");
                break;
            }
            baseList.push(parsing.next());
            parsing.confirm(HighlightTokenKind.Type);
        }
    }
    const scopeStart = parsing.next();
    let scopeEnd = scopeStart;
    parsing.expect('{', HighlightTokenKind.Operator);
    const members: (NodeVirtProp | NodeVar | NodeFunc | NodeFuncDef)[] = [];
    for (; ;) {
        if (parsing.isEnd()) {
            diagnostic.addError(parsing.next().location, "Unexpected end of file");
            break;
        }
        if (parsing.next().text === '}') {
            scopeEnd = parsing.next();
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }
        const func = parseFunc(parsing);
        if (func !== undefined) {
            members.push(func);
            continue;
        }
        const var_ = parseVAR(parsing);
        if (var_ !== undefined) {
            members.push(var_);
            continue;
        }
        diagnostic.addError(parsing.next().location, "Expected class member");
        parsing.step();
    }
    return {
        nodeName: 'Class',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        scopeRange: {start: scopeStart, end: scopeEnd},
        identifier: identifier,
        baseList: baseList,
        memberList: members
    };
}

// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
function parseFunc(parsing: ParsingState): NodeFunc | undefined {
    const rangeStart = parsing.next();
    const entity = parseEntityModifier(parsing);
    const accessor = parseAccessModifier(parsing);
    let head: { returnType: NodeType; isRef: boolean; } | '~';
    if (parsing.next().text === '~') {
        parsing.confirm(HighlightTokenKind.Operator);
        head = '~';
    } else {
        const returnType = parseTYPE(parsing);
        if (returnType === undefined) {
            parsing.backtrack(rangeStart);
            return undefined;
        }
        const isRef = parsing.next().text === '&';
        if (isRef) parsing.confirm(HighlightTokenKind.Builtin);
        head = {returnType: returnType, isRef: isRef};
    }
    const identifier = parsing.next();
    parsing.step();
    const paramList = parsePARAMLIST(parsing);
    if (paramList === undefined) {
        parsing.backtrack(rangeStart);
        return undefined;
    }
    let statBlock = parseStatBlock(parsing);
    if (statBlock === undefined) statBlock = {
        nodeName: 'StatBlock',
        nodeRange: {start: parsing.next(), end: parsing.next()},
        statements: []
    };

    return {
        nodeName: 'Func',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        scopeRange: statBlock.nodeRange,
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
function parseAccessModifier(parsing: ParsingState): AccessModifier {
    const next = parsing.next().text;
    if (next === 'private' || next === 'protected') {
        parsing.confirm(HighlightTokenKind.Builtin);
        return next;
    }
    return 'public';
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST]} ';'
function parseVAR(parsing: ParsingState): NodeVar | undefined {
    const rangeStart = parsing.next();

    const accessor: AccessModifier = parseAccessModifier(parsing);

    const type = parseTYPE(parsing);
    if (type === undefined) {
        // diagnostic.addError(parsing.next().location, "Expected type");
        return undefined;
    }
    const variables: {
        identifier: ParsingToken,
        initializer: NodeEXPR | NodeArgList | undefined
    }[] = [];
    while (parsing.isEnd() === false) {
        // 識別子
        const identifier = parsing.next();
        if (identifier.kind !== 'identifier') {
            if (variables.length === 0) {
                parsing.backtrack(rangeStart);
                return undefined;
            } else {
                diagnostic.addError(parsing.next().location, "Expected identifier");
            }
        }
        parsing.confirm(HighlightTokenKind.Variable);

        // 初期化子
        if (parsing.next().text === ';') {
            parsing.confirm(HighlightTokenKind.Operator);
            variables.push({identifier: identifier, initializer: undefined});
            break;
        } else if (parsing.next().text === '=') {
            parsing.confirm(HighlightTokenKind.Operator);
            const expr = parseEXPR(parsing);
            if (expr === undefined) {
                diagnostic.addError(parsing.next().location, "Expected expression");
                return undefined;
            }
            variables.push({identifier: identifier, initializer: expr});
        } else {
            const argList = parseArgList(parsing);
            if (parsing !== undefined) {
                variables.push({identifier: identifier, initializer: argList});
            }
        }

        // 追加または終了判定
        if (parsing.next().text === ',') {
            parsing.confirm(HighlightTokenKind.Operator);
            continue;
        } else if (parsing.next().text === ';') {
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }

        diagnostic.addError(parsing.next().location, "Expected ',' or ';'");
        parsing.step();
    }

    return {
        nodeName: 'Var',
        nodeRange: {start: rangeStart, end: parsing.prev()},
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
function parseStatBlock(parsing: ParsingState): NodeStatBlock | undefined {
    if (parsing.next().text !== '{') return undefined;
    const rangeStart = parsing.next();
    parsing.step();
    const statements: (NodeVar | NodeStatement)[] = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === '}') break;
        const var_ = parseVAR(parsing);
        if (var_ !== undefined) {
            statements.push(var_);
            continue;
        }
        const statement = parseSTATEMENT(parsing);
        if (statement === 'pending') {
            continue;
        }
        if (statement !== 'mismatch') {
            statements.push(statement);
            continue;
        }
        parsing.step();
    }
    parsing.expect('}', HighlightTokenKind.Keyword);
    return {
        nodeName: 'StatBlock',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        statements: statements
    };
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
function parsePARAMLIST(parsing: ParsingState): NodeParamList | undefined {
    if (parsing.next().text !== '(') return undefined;
    if (parsing.next().text === 'void') {
        parsing.confirm(HighlightTokenKind.Builtin);
        parsing.expect(')', HighlightTokenKind.Operator);
        return [];
    }
    parsing.confirm(HighlightTokenKind.Operator);
    const params: NodeParamList = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === ')') break;
        if (params.length > 0) {
            if (parsing.expect(',', HighlightTokenKind.Operator) === false) break;
        }
        const type = parseTYPE(parsing);
        if (type === undefined) break;
        if (parsing.next().kind === 'identifier') {
            params.push({type: type, identifier: parsing.next()});
            parsing.step();
        } else {
            params.push({type: type, identifier: undefined});
        }
    }

    parsing.expect(')', HighlightTokenKind.Operator);
    return params;
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]
function parseTYPEMOD(parsing: ParsingState): TypeModifier | undefined {
    if (parsing.next().text !== '&') return undefined;
    parsing.confirm(HighlightTokenKind.Builtin);
    const next = parsing.next().text;
    if (next === 'in' || next === 'out' || next === 'inout') {
        parsing.confirm(HighlightTokenKind.Builtin);
        return next;
    } else {
        return 'inout';
    }
}

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
function parseTYPE(parsing: ParsingState): NodeType | undefined {
    const rangeStart = parsing.next();
    let isConst = false;
    if (parsing.next().text === 'const') {
        parsing.confirm(HighlightTokenKind.Keyword);
        isConst = true;
    }
    const scope = parseScope(parsing);
    const datatype = parseDATATYPE(parsing);
    if (datatype === undefined) {
        parsing.backtrack(rangeStart);
        return undefined;
    }
    const generics = parseTypeParameters(parsing) ?? [];
    return {
        nodeName: 'Type',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        isConst: isConst,
        scope: scope,
        datatype: datatype,
        genericList: generics,
        isArray: false,
        isRef: false
    };
}

// '<' TYPE {',' TYPE} '>'
function parseTypeParameters(parsing: ParsingState): NodeType[] | undefined {
    const rangeStart = parsing.next();
    if (parsing.next().text !== '<') return undefined;
    parsing.confirm(HighlightTokenKind.Operator);
    const generics: NodeType[] = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === '>') {
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }
        if (generics.length > 0) {
            if (parsing.next().text !== ',') {
                parsing.backtrack(rangeStart);
                return undefined;
            }
            parsing.confirm(HighlightTokenKind.Operator);
        }
        const type = parseTYPE(parsing);
        if (type === undefined) {
            parsing.backtrack(rangeStart);
            return undefined;
        }
        generics.push(type);
    }
    if (generics.length == 0) {
        diagnostic.addError(parsing.next().location, "Expected type parameter 🪹");
    }
    return generics;
}

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'

// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
function parseScope(parsing: ParsingState): NodeScope | undefined {
    const rangeStart = parsing.next();
    let isGlobal = false;
    if (parsing.next().text === '::') {
        parsing.confirm(HighlightTokenKind.Operator);
        isGlobal = true;
    }
    const namespaces: ParsingToken[] = [];
    while (parsing.isEnd() === false) {
        const identifier = parsing.next(0);
        if (identifier.kind !== 'identifier') {
            break;
        }
        if (parsing.next(1).text === '::') {
            parsing.confirm(HighlightTokenKind.Namespace);
            parsing.confirm(HighlightTokenKind.Operator);
            namespaces.push(identifier);
            continue;
        } else if (parsing.next(1).text === '<') {
            const rangeStart = parsing.next();
            parsing.confirm(HighlightTokenKind.Class);
            const types = parseTypeParameters(parsing);
            if (types === undefined || parsing.next().text !== '::') {
                parsing.backtrack(rangeStart);
                break;
            }
            parsing.confirm(HighlightTokenKind.Operator);
            return {
                nodeName: 'Scope',
                nodeRange: {start: rangeStart, end: parsing.prev()},
                isGlobal: isGlobal,
                namespaceList: namespaces,
                generic: {className: identifier, types: types}
            };
        }
        break;
    }
    if (isGlobal === false && namespaces.length === 0) {
        return undefined;
    }
    return {
        nodeName: 'Scope',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        isGlobal: isGlobal,
        namespaceList: namespaces,
        generic: undefined
    };
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
function parseDATATYPE(parsing: ParsingState): NodeDATATYPE | undefined {
    // FIXME
    const next = parsing.next();
    if (parsing.next().kind === 'identifier') {
        parsing.confirm(HighlightTokenKind.Type);
        return {
            nodeName: 'DataType',
            nodeRange: {start: next, end: next},
            identifier: next
        };
    }

    const primtype = parsePRIMTYPE(parsing);
    if (primtype !== undefined) return {
        nodeName: 'DataType',
        nodeRange: {start: next, end: next},
        identifier: primtype
    };

    return undefined;
}

// PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
function parsePRIMTYPE(parsing: ParsingState) {
    const next = parsing.next();
    if (primeTypeSet.has(next.text) === false) return undefined;
    parsing.confirm(HighlightTokenKind.Builtin);
    return next;
}

const primeTypeSet = new Set<string>(['void', 'int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'float', 'double', 'bool']);

// FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property'}

// STATEMENT     ::= (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
function parseSTATEMENT(parsing: ParsingState): TriedParse<NodeStatement> {
    const if_ = parseIF(parsing);
    if (if_ === 'pending') return 'pending';
    if (if_ !== 'mismatch') return if_;

    const for_ = parseFOR(parsing);
    if (for_ === 'pending') return 'pending';
    if (for_ !== 'mismatch') return for_;

    const while_ = parseWHILE(parsing);
    if (while_ === 'pending') return 'pending';
    if (while_ !== 'mismatch') return while_;

    const return_ = parseReturn(parsing);
    if (return_ === 'pending') return 'pending';
    if (return_ !== 'mismatch') return return_;

    const statBlock = parseStatBlock(parsing);
    if (statBlock !== undefined) return statBlock;

    const break_ = parseBREAK(parsing);
    if (break_ !== undefined) return break_;

    const continue_ = parseCONTINUE(parsing);
    if (continue_ !== undefined) return continue_;

    const dowhile = parseDOWHILE(parsing);
    if (dowhile === 'pending') return 'pending';
    if (dowhile !== 'mismatch') return dowhile;

    const switch_ = parseSWITCH(parsing);
    if (switch_ === 'pending') return 'pending';
    if (switch_ !== 'mismatch') return switch_;

    const exprStat = parseEXPRSTAT(parsing);
    if (exprStat !== undefined) return exprStat;

    return 'mismatch';
}

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
function parseSWITCH(parsing: ParsingState): TriedParse<NodeSwitch> {
    if (parsing.next().text !== 'switch') return 'mismatch';
    const rangeStart = parsing.next();
    parsing.step();
    parsing.expect('(', HighlightTokenKind.Operator);
    const assign = parseASSIGN(parsing);
    if (assign === undefined) {
        diagnostic.addError(parsing.next().location, "Expected expression");
        return 'pending';
    }
    parsing.expect(')', HighlightTokenKind.Operator);
    parsing.expect('{', HighlightTokenKind.Operator);
    const cases: NodeCASE[] = [];

    while (parsing.isEnd() === false) {
        if (parsing.isEnd() || parsing.next().text === '}') break;
        const case_ = parseCASE(parsing);
        if (case_ === 'mismatch') break;
        if (case_ === 'pending') continue;
        cases.push(case_);
    }
    parsing.expect('}', HighlightTokenKind.Operator);
    return {
        nodeName: 'Switch',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        assign: assign,
        cases: cases
    };
}

// BREAK         ::= 'break' ';'
function parseBREAK(parsing: ParsingState): NodeBreak | undefined {
    if (parsing.next().text !== 'break') return undefined;
    const rangeStart = parsing.next();
    parsing.step();
    parsing.expect(';', HighlightTokenKind.Operator);
    return {nodeName: 'Break', nodeRange: {start: rangeStart, end: parsing.prev()}};
}

// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
function parseFOR(parsing: ParsingState): TriedParse<NodeFor> {
    if (parsing.next().text !== 'for') return 'mismatch';
    const rangeStart = parsing.next();
    parsing.step();
    parsing.expect('(', HighlightTokenKind.Operator);

    const initial: NodeExprStat | NodeVar | undefined = parseEXPRSTAT(parsing) ?? parseVAR(parsing);
    if (initial === undefined) {
        diagnostic.addError(parsing.next().location, "Expected initial expression or variable declaration");
        return 'pending';
    }

    const condition = parseEXPRSTAT(parsing);
    if (condition === undefined) {
        diagnostic.addError(parsing.next().location, "Expected condition expression");
        return 'pending';
    }

    const increment: NodeAssign[] = [];
    while (parsing.isEnd() === false) {
        if (increment.length > 0) {
            if (parsing.next().text !== ',') break;
            parsing.step();
        }
        const assign = parseASSIGN(parsing);
        if (assign === undefined) break;
        increment.push(assign);
    }

    parsing.expect(')', HighlightTokenKind.Operator);

    const statement = parseSTATEMENT(parsing);
    if (statement === 'mismatch' || statement === 'pending') return 'pending';

    return {
        nodeName: 'For',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        initial: initial,
        condition: condition,
        incrementList: increment,
        statement: statement
    };
}

// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
function parseWHILE(parsing: ParsingState): TriedParse<NodeWhile> {
    if (parsing.next().text !== 'while') return 'mismatch';
    const rangeStart = parsing.next();
    parsing.step();
    parsing.expect('(', HighlightTokenKind.Operator);
    const assign = parseASSIGN(parsing);
    if (assign === undefined) {
        diagnostic.addError(parsing.next().location, "Expected condition expression");
        return 'pending';
    }
    parsing.expect(')', HighlightTokenKind.Operator);
    const statement = parseSTATEMENT(parsing);
    if (statement === 'mismatch' || statement === 'pending') {
        diagnostic.addError(parsing.next().location, "Expected statement");
        return 'pending';
    }

    return {
        nodeName: 'While',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        assign: assign,
        statement: statement
    };
}

// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
function parseDOWHILE(parsing: ParsingState): TriedParse<NodeDoWhile> {
    if (parsing.next().text !== 'do') return 'mismatch';
    const rangeStart = parsing.next();
    parsing.step();
    const statement = parseSTATEMENT(parsing);
    if (statement === 'mismatch' || statement === 'pending') {
        diagnostic.addError(parsing.next().location, "Expected statement");
        return 'pending';
    }
    parsing.expect('while', HighlightTokenKind.Keyword);
    parsing.expect('(', HighlightTokenKind.Operator);
    const assign = parseASSIGN(parsing);
    if (assign === undefined) {
        diagnostic.addError(parsing.next().location, "Expected condition expression");
        return 'pending';
    }
    parsing.expect(')', HighlightTokenKind.Operator);
    parsing.expect(';', HighlightTokenKind.Operator);
    return {
        nodeName: 'DoWhile',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        statement: statement,
        assign: assign
    };
}

// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
function parseIF(parsing: ParsingState): TriedParse<NodeIf> {
    if (parsing.next().text !== 'if') return 'mismatch';
    const rangeStart = parsing.next();
    parsing.step();
    parsing.expect('(', HighlightTokenKind.Operator);
    const assign = parseASSIGN(parsing);
    if (assign === undefined) {
        diagnostic.addError(parsing.next().location, "Expected condition expression");
        return 'pending';
    }
    parsing.expect(')', HighlightTokenKind.Operator);
    const ts = parseSTATEMENT(parsing);
    if (ts === 'mismatch' || ts === 'pending') return 'pending';
    let fs = undefined;
    if (parsing.next().text === 'else') {
        fs = parseSTATEMENT(parsing);
        if (fs === 'mismatch' || fs === 'pending') {
            diagnostic.addError(parsing.next().location, "Expected statement");
            return {
                nodeName: 'If',
                nodeRange: {start: rangeStart, end: parsing.prev()},
                condition: assign,
                ts: ts,
                fs: undefined
            };
        }
    }
    return {
        nodeName: 'If',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        condition: assign,
        ts: ts,
        fs: fs
    };
}

// CONTINUE      ::= 'continue' ';'
function parseCONTINUE(parsing: ParsingState): NodeContinue | undefined {
    if (parsing.next().text !== 'continue') return undefined;
    const rangeStart = parsing.next();
    parsing.step();
    parsing.expect(';', HighlightTokenKind.Operator);
    return {nodeName: 'Continue', nodeRange: {start: rangeStart, end: parsing.prev()}};
}

// EXPRSTAT      ::= [ASSIGN] ';'
function parseEXPRSTAT(parsing: ParsingState): NodeExprStat | undefined {
    if (parsing.next().text === ';') {
        parsing.confirm(HighlightTokenKind.Operator);
        return {
            nodeName: 'ExprStat',
            assign: undefined
        };
    }
    const assign = parseASSIGN(parsing);
    if (assign === undefined) return undefined;
    parsing.expect(';', HighlightTokenKind.Operator);
    return {
        nodeName: 'ExprStat',
        assign: assign
    };
}

// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK

// RETURN        ::= 'return' [ASSIGN] ';'
function parseReturn(parsing: ParsingState): TriedParse<NodeReturn> {
    if (parsing.next().text !== 'return') return 'mismatch';
    const rangeStart = parsing.next();
    parsing.step();
    const assign = parseASSIGN(parsing);
    if (assign === undefined) {
        diagnostic.addError(parsing.next().location, "Expected expression");
        return 'pending';
    }
    parsing.expect(';', HighlightTokenKind.Operator);
    return {
        nodeName: 'Return',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        assign: assign
    };
}

// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
function parseCASE(parsing: ParsingState): TriedParse<NodeCASE> {
    const rangeStart = parsing.next();
    let expr = undefined;
    if (parsing.next().text === 'case') {
        parsing.step();
        expr = parseEXPR(parsing);
        if (expr === undefined) {
            diagnostic.addError(parsing.next().location, "Expected expression");
            return 'pending';
        }
    } else if (parsing.next().text === 'default') {
        parsing.step();
    } else {
        return 'mismatch';
    }
    parsing.expect(':', HighlightTokenKind.Operator);
    const statements: NodeStatement[] = [];
    while (parsing.isEnd() === false) {
        const statement = parseSTATEMENT(parsing);
        if (statement === 'mismatch') break;
        if (statement === 'pending') continue;
        statements.push(statement);
    }
    return {
        nodeName: 'Case',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        expr: expr,
        statementList: statements
    };
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
function parseEXPR(parsing: ParsingState): NodeEXPR | undefined {
    const rangeStart = parsing.next();
    const exprTerm = parseEXPRTERM(parsing);
    if (exprTerm === undefined) return undefined;
    const exprOp = parseEXPROP(parsing);
    if (exprOp === undefined) return {
        nodeName: 'Expr',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        head: exprTerm,
        tail: undefined
    };
    const tail = parseEXPR(parsing);
    if (tail === undefined) {
        diagnostic.addError(parsing.next().location, "Expected expression");
        return {
            nodeName: 'Expr',
            nodeRange: {start: rangeStart, end: parsing.prev()},
            head: exprTerm,
            tail: undefined
        };
    }
    return {
        nodeName: 'Expr',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        head: exprTerm,
        tail: {
            operator: exprOp,
            expression: tail
        }
    };
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function parseEXPRTERM(parsing: ParsingState) {
    const exprTerm2 = parseEXPRTERM2(parsing);
    if (exprTerm2 !== undefined) return exprTerm2;
    return undefined;
}

const preOpSet = new Set(['-', '+', '!', '++', '--', '~', '@']);

// const postOpSet = new Set(['.', '[', '(', '++', '--']);

// ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function parseEXPRTERM2(parsing: ParsingState): NodeEXPRTERM2 | undefined {
    const rangeStart = parsing.next();
    let pre = undefined;
    if (preOpSet.has(parsing.next().text)) {
        pre = parsing.next();
        parsing.confirm(HighlightTokenKind.Operator);
    }

    const exprValue = parseExprValue(parsing);
    if (exprValue === 'mismatch') parsing.backtrack(rangeStart);
    if (exprValue === 'mismatch' || exprValue === 'pending') {
        return undefined;
    }

    const postOp = parseExprPostOp(parsing);

    return {
        nodeName: 'ExprTerm',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        exprTerm: 2,
        preOp: pre,
        value: exprValue,
        postOp: postOp
    };
}

// EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
function parseExprValue(parsing: ParsingState): TriedParse<NodeExprValue> {
    const lambda = parseLAMBDA(parsing);
    if (lambda === 'pending') return 'pending';
    if (lambda !== 'mismatch') return lambda;

    const cast = parseCAST(parsing);
    if (cast === 'pending') return 'pending';
    if (cast !== 'mismatch') return cast;

    if (parsing.next().text === '(') {
        parsing.confirm(HighlightTokenKind.Operator);
        const assign = parseASSIGN(parsing);
        if (assign === undefined) {
            diagnostic.addError(parsing.next().location, "Expected expression 🖼️");
            return 'pending';
        }
        parsing.expect(')', HighlightTokenKind.Operator);
        return assign;
    }

    const literal = parseLITERAL(parsing);
    if (literal !== undefined) return literal;

    const funcCall = parseFuncCall(parsing);
    if (funcCall !== undefined) return funcCall;

    const constructCall = parseConstructCall(parsing);
    if (constructCall !== undefined) return constructCall;

    const varAccess = parseVarAccess(parsing);
    if (varAccess !== undefined) return varAccess;

    return 'mismatch';
}

// CONSTRUCTCALL ::= TYPE ARGLIST
function parseConstructCall(parsing: ParsingState): NodeConstructCall | undefined {
    const rangeStart = parsing.next();
    const type = parseTYPE(parsing);
    if (type === undefined) return undefined;

    const argList = parseArgList(parsing);
    if (argList === undefined) {
        parsing.backtrack(rangeStart);
        return undefined;
    }

    return {
        nodeName: 'ConstructCall',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        type: type,
        argList: argList
    };
}

// EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']') | ARGLIST | '++' | '--'
function parseExprPostOp(parsing: ParsingState): NodeExprPostOp | undefined {
    const rangeStart = parsing.next();

    const exprPostOp1 = parseExprPostOp1(parsing);
    if (exprPostOp1 !== undefined) return exprPostOp1;

    const exprPostOp2 = parseExprPostOp2(parsing);
    if (exprPostOp2 !== undefined) return exprPostOp2;

    const argList = parseArgList(parsing);
    if (argList !== undefined) return {
        nodeName: 'ExprPostOp',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        postOp: 3,
        args: argList
    };

    const maybeOperator = parsing.next().text;
    if (maybeOperator === '++' || maybeOperator === '--') {
        parsing.confirm(HighlightTokenKind.Operator);
        return {
            nodeName: 'ExprPostOp',
            nodeRange: {start: rangeStart, end: parsing.prev()},
            postOp: 4,
            operator: maybeOperator
        };
    }

    return undefined;
}

// ('.' (FUNCCALL | IDENTIFIER))
function parseExprPostOp1(parsing: ParsingState): NodeExprPostOp1 | undefined {
    if (parsing.next().text !== '.') return undefined;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightTokenKind.Operator);
    const funcCall = parseFuncCall(parsing);
    if (funcCall !== undefined) return {
        nodeName: 'ExprPostOp',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        postOp: 1,
        member: funcCall,
    };
    const identifier = parsing.next();
    if (identifier.kind !== 'identifier') {
        diagnostic.addError(parsing.next().location, "Expected identifier");
        return {
            nodeName: 'ExprPostOp',
            nodeRange: {start: rangeStart, end: parsing.prev()},
            postOp: 1,
            member: undefined
        };
    }
    parsing.confirm(HighlightTokenKind.Variable);
    return {
        nodeName: 'ExprPostOp',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        postOp: 1,
        member: identifier
    };
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
function parseExprPostOp2(parsing: ParsingState): NodeExprPostOp2 | undefined {
    if (parsing.next().text !== '[') return undefined;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightTokenKind.Operator);
    const indexes: { identifier: ParsingToken | undefined, assign: NodeAssign }[] = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === ']') {
            if (indexes.length === 0) {
                diagnostic.addError(parsing.next().location, "Expected index 📮");
            }
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }
        if (indexes.length > 0) {
            if (parsing.expect(',', HighlightTokenKind.Operator) === false) break;
        }
        let identifier = undefined;
        if (parsing.next(0).kind === 'identifier' && parsing.next(1).text === ':') {
            identifier = parsing.next();
            parsing.confirm(HighlightTokenKind.Parameter);
            parsing.confirm(HighlightTokenKind.Operator);
        }
        const assign = parseASSIGN(parsing);
        if (assign === undefined) {
            diagnostic.addError(parsing.next().location, "Expected expression 📮");
            continue;
        }
        indexes.push({identifier: identifier, assign: assign});
    }
    return {
        nodeName: 'ExprPostOp',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        postOp: 2,
        indexes: indexes
    };
}

// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
function parseCAST(parsing: ParsingState): TriedParse<NodeCast> {
    if (parsing.next().text !== 'cast') return 'mismatch';
    const rangeStart = parsing.next();
    parsing.confirm(HighlightTokenKind.Keyword);
    parsing.expect('<', HighlightTokenKind.Operator);
    const type = parseTYPE(parsing);
    if (type === undefined) {
        diagnostic.addError(parsing.next().location, "Expected type");
        return 'pending';
    }
    parsing.expect('>', HighlightTokenKind.Operator);
    parsing.expect('(', HighlightTokenKind.Operator);
    const assign = parseASSIGN(parsing);
    if (assign === undefined) {
        diagnostic.addError(parsing.next().location, "Expected expression");
        return 'pending';
    }
    parsing.expect(')', HighlightTokenKind.Operator);
    return {
        nodeName: 'Cast',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        type: type,
        assign: assign
    };
}

// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
const parseLAMBDA = (parsing: ParsingState): TriedParse<NodeLambda> => {
    if (parsing.next().text !== 'function') return 'mismatch';
    const rangeStart = parsing.next();
    parsing.confirm(HighlightTokenKind.Keyword);
    parsing.expect('(', HighlightTokenKind.Operator);
    const params: {
        type: NodeType | undefined,
        typeMod: TypeModifier | undefined,
        identifier: ParsingToken | undefined
    }[] = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === ')') {
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }
        if (params.length > 0) {
            if (parsing.expect(',', HighlightTokenKind.Operator) === false) continue;
        }

        if (parsing.next(0).kind === 'identifier' && parsing.next(1).kind === 'reserved') {
            parsing.confirm(HighlightTokenKind.Parameter);
            params.push({type: undefined, typeMod: undefined, identifier: parsing.next()});
            continue;
        }

        const type = parseTYPE(parsing);
        const typeMod = type !== undefined ? parseTYPEMOD(parsing) : undefined;

        let identifier: ParsingToken | undefined = undefined;
        if (parsing.next().kind === 'identifier') {
            identifier = parsing.next();
            parsing.confirm(HighlightTokenKind.Parameter);
        }
        params.push({type: type, typeMod: typeMod, identifier: identifier});
    }
    const statBlock = parseStatBlock(parsing);
    if (statBlock === undefined) {
        diagnostic.addError(parsing.next().location, "Expected statement block 🪔");
        return 'pending';
    }
    return {
        nodeName: 'Lambda',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        params: params,
        statBlock: statBlock
    };
};

// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
function parseLITERAL(parsing: ParsingState): NodeLiteral | undefined {
    const next = parsing.next();
    if (next.kind === 'number') {
        parsing.confirm(HighlightTokenKind.Number);
        return {nodeName: 'Literal', nodeRange: {start: next, end: next}, value: next};
    }
    if (next.kind === 'string') {
        parsing.confirm(HighlightTokenKind.String);
        return {nodeName: 'Literal', nodeRange: {start: next, end: next}, value: next};
    }
    if (next.text === 'true' || next.text === 'false' || next.text === 'null') {
        parsing.confirm(HighlightTokenKind.Builtin);
        return {nodeName: 'Literal', nodeRange: {start: next, end: next}, value: next};
    }
    return undefined;
}

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
function parseFuncCall(parsing: ParsingState): NodeFuncCall | undefined {
    const rangeStart = parsing.next();
    const scope = parseScope(parsing);
    const identifier = parsing.next();
    if (identifier.kind !== 'identifier') {
        parsing.backtrack(rangeStart);
        return undefined;
    }
    parsing.confirm(HighlightTokenKind.Function);
    const argList = parseArgList(parsing);
    if (argList === undefined) {
        parsing.backtrack(rangeStart);
        return undefined;
    }
    return {
        nodeName: 'FuncCall',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        scope: scope,
        identifier: identifier,
        argList: argList
    };
}

// VARACCESS     ::= SCOPE IDENTIFIER
function parseVarAccess(parsing: ParsingState): NodeVarAccess | undefined {
    const rangeStart = parsing.next();
    const scope = parseScope(parsing);
    const next = parsing.next();
    if (next.kind !== 'identifier') {
        if (scope === undefined) return undefined;
        diagnostic.addError(parsing.next().location, "Expected identifier");

        return {
            nodeName: 'VarAccess',
            nodeRange: {start: rangeStart, end: parsing.prev()},
            scope: scope,
            identifier: undefined
        };
    }
    const isBuiltin: boolean = next.text === 'this';
    parsing.confirm(isBuiltin ? HighlightTokenKind.Builtin : HighlightTokenKind.Variable);
    return {
        nodeName: 'VarAccess',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        scope: scope,
        identifier: next
    };
}

// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
function parseArgList(parsing: ParsingState): NodeArgList | undefined {
    if (parsing.next().text !== '(') return undefined;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightTokenKind.Operator);
    const args: { identifier: ParsingToken | undefined, assign: NodeAssign }[] = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === ')') {
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }
        if (args.length > 0) {
            if (parsing.expect(',', HighlightTokenKind.Operator) === false) break;
        }
        let identifier = undefined;
        if (parsing.next().kind === 'identifier' && parsing.next(1).text === ':') {
            identifier = parsing.next();
            parsing.confirm(HighlightTokenKind.Parameter);
            parsing.confirm(HighlightTokenKind.Operator);
        }
        const assign = parseASSIGN(parsing);
        if (assign === undefined) {
            diagnostic.addError(parsing.next().location, "Expected expression 🍡");
            parsing.step();
            continue;
        }
        args.push({identifier: identifier, assign: assign});
    }
    return {
        nodeName: 'ArgList',
        nodeRange: {start: rangeStart, end: parsing.prev()},
        args: args
    };
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
function parseASSIGN(parsing: ParsingState): NodeAssign | undefined {
    const rangeStart = parsing.next();
    const condition = parseCONDITION(parsing);
    if (condition === undefined) return undefined;
    const op = parseASSIGNOP(parsing);
    const result: NodeAssign = {
        nodeName: 'Assign',
        nodeRange: {start: rangeStart, end: rangeStart},
        condition: condition,
        tail: undefined
    };
    if (op === undefined) return result;
    const assign = parseASSIGN(parsing);
    if (assign === undefined) return result;
    result.tail = {op: op, assign: assign};
    result.nodeRange.end = parsing.prev();
    return result;
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
function parseCONDITION(parsing: ParsingState): NodeCondition | undefined {
    const rangeStart = parsing.next();
    const expr = parseEXPR(parsing);
    if (expr === undefined) return undefined;
    const result: NodeCondition = {
        nodeName: 'Condition',
        nodeRange: {start: rangeStart, end: rangeStart},
        expr: expr,
        ternary: undefined
    };
    if (parsing.next().text === '?') {
        parsing.confirm(HighlightTokenKind.Operator);
        const ta = parseASSIGN(parsing);
        if (ta === undefined) {
            diagnostic.addError(parsing.next().location, "Expected expression 🤹");
            return result;
        }
        parsing.expect(':', HighlightTokenKind.Operator);
        const fa = parseASSIGN(parsing);
        if (fa === undefined) {
            diagnostic.addError(parsing.next().location, "Expected expression 🤹");
            return result;
        }
        result.ternary = {ta: ta, fa: fa};
    }
    result.nodeRange.end = parsing.prev();
    return result;
}

// EXPROP        ::= MATHOP | COMPOP | LOGICOP | BITOP
function parseEXPROP(parsing: ParsingState) {
    if (exprOpSet.has(parsing.next().text) === false) return undefined;
    const next = parsing.next();
    parsing.confirm(HighlightTokenKind.Operator);
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
function parseASSIGNOP(parsing: ParsingState) {
    if (assignOpSet.has(parsing.next().text) === false) return undefined;
    const next = parsing.next();
    parsing.confirm(HighlightTokenKind.Operator);
    return next;
}

const assignOpSet = new Set([
    '=', '+=', '-=', '*=', '/=', '|=', '&=', '^=', '%=', '**=', '<<=', '>>=', '>>>='
]);

export function parseFromTokenized(tokens: ParsingToken[]): NodeScript {
    const parsing = new ParsingState(tokens);
    const script: NodeScript = [];
    while (parsing.isEnd() === false) {
        script.push(...parseSCRIPT(parsing));
        if (parsing.isEnd() === false) {
            diagnostic.addError(parsing.next().location, "Unexpected token ⚠️");
            parsing.step();
        }
    }

    return script;
}

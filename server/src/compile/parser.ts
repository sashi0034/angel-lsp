// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_script_bnf.html

import {
    AccessModifier,
    EntityAttribute,
    funcHeadConstructor,
    funcHeadDestructor,
    FuncHeads,
    FunctionAttribute,
    isFunctionHeadReturns,
    NodeArgList,
    NodeAssign,
    NodeBreak,
    NodeCase,
    NodeCast,
    NodeClass,
    NodeCondition,
    NodeConstructCall,
    NodeContinue,
    NodeDataType,
    NodeDoWhile,
    NodeEnum,
    NodeExpr,
    NodeExprPostOp,
    NodeExprPostOp1,
    NodeExprPostOp2,
    NodeExprStat,
    NodeExprTerm1,
    NodeExprTerm2,
    NodeExprValue,
    NodeFor,
    NodeFunc,
    NodeFuncCall,
    NodeFuncDef,
    NodeIf,
    NodeInitList,
    NodeLambda,
    NodeLiteral,
    NodeName,
    NodeNamespace,
    NodeParamList,
    NodeReturn,
    NodeScope,
    NodeScript,
    NodeStatBlock,
    NodeStatement,
    NodeSwitch, NodeTry,
    NodeType,
    NodeVar,
    NodeVarAccess,
    NodeVirtualProp,
    NodeWhile,
    ParsedEnumMember,
    ParsedPostIndexer,
    ParsedVariableInit,
    ReferenceModifier,
    setEntityAttribute,
    setFunctionAttribute,
    TypeModifier
} from "./nodes";
import {HighlightTokenKind} from "../code/highlight";
import {ParsingToken} from "./parsingToken";
import {TokenKind} from "./tokens";
import {ParseFailure, ParsingState, TriedParse} from "./parsingState";
import {ParseCacheKind} from "./parseCached";

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
function parseScript(parsing: ParsingState): NodeScript {
    const script: NodeScript = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === ';') {
            parsing.confirm(HighlightTokenKind.Operator);
            continue;
        }

        const entityAttribute = parseEntityAttribute(parsing);

        const parsedClass = parseClass(parsing, entityAttribute);
        if (parsedClass === ParseFailure.Pending) continue;
        if (parsedClass !== ParseFailure.Mismatch) {
            script.push(parsedClass);
            continue;
        }

        const parsedNamespace = parseNamespace(parsing);
        if (parsedNamespace === ParseFailure.Pending) continue;
        if (parsedNamespace !== ParseFailure.Mismatch) {
            script.push(parsedNamespace);
            continue;
        }

        const parsedEnum = parseEnum(parsing, entityAttribute);
        if (parsedEnum === ParseFailure.Pending) continue;
        if (parsedEnum !== ParseFailure.Mismatch) {
            script.push(parsedEnum);
            continue;
        }

        const parsedFunc = parseFunc(parsing);
        if (parsedFunc !== undefined) {
            script.push(parsedFunc);
            continue;
        }

        const parsedVar = parseVar(parsing);
        if (parsedVar !== undefined) {
            script.push(parsedVar);
            continue;
        }

        break;
    }
    return script;
}

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
function parseNamespace(parsing: ParsingState): TriedParse<NodeNamespace> {
    if (parsing.next().text !== 'namespace') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightTokenKind.Builtin);

    const namespaces: ParsingToken[] = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === '{') {
            if (namespaces.length === 0) {
                parsing.error("Expected identifier ❌");
            }
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }
        if (namespaces.length > 0) {
            if (parsing.expect('::', HighlightTokenKind.Operator) === false) continue;
        }
        const identifier = expectIdentifier(parsing, HighlightTokenKind.Namespace);
        if (identifier === undefined) break;
        namespaces.push(identifier);
    }

    if (namespaces.length === 0) {
        return ParseFailure.Pending;
    }

    const script = parseScript(parsing);
    parsing.expect('}', HighlightTokenKind.Operator);
    return {
        nodeName: NodeName.Namespace,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        namespaceList: namespaces,
        script: script
    };
}

function expectIdentifier(parsing: ParsingState, kind: HighlightTokenKind): ParsingToken | undefined {
    const identifier = parsing.next();
    if (identifier.kind !== TokenKind.Identifier) {
        parsing.error("Expected identifier ❌");
        return undefined;
    }
    parsing.confirm(kind);
    return identifier;
}

// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
function parseEnum(
    parsing: ParsingState,
    entity: EntityAttribute | undefined
): TriedParse<NodeEnum> {
    if (parsing.next().text !== 'enum') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightTokenKind.Builtin);

    const identifier = expectIdentifier(parsing, HighlightTokenKind.Enum);
    if (identifier === undefined) return ParseFailure.Pending;

    let memberList: ParsedEnumMember[] = [];
    const scopeStart = parsing.next();

    if (parsing.next().text === ';') {
        parsing.confirm(HighlightTokenKind.Operator);
    } else {
        memberList = expectEnumMembers(parsing);
    }

    return {
        nodeName: NodeName.Enum,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        scopeRange: {start: scopeStart, end: parsing.prev()},
        entity: entity,
        identifier: identifier,
        memberList: memberList
    };
}

// '{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'
function expectEnumMembers(parsing: ParsingState): ParsedEnumMember[] {
    const members: ParsedEnumMember[] = [];
    parsing.expect('{', HighlightTokenKind.Operator);
    while (parsing.isEnd() === false) {
        if (parsing.next().text === '}') {
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }

        if (members.length > 0) {
            parsing.expect(',', HighlightTokenKind.Operator);
        }

        const identifier = expectIdentifier(parsing, HighlightTokenKind.EnumMember);
        if (identifier === undefined) break;

        let expr: NodeExpr | undefined = undefined;
        if (parsing.next().text === '=') {
            parsing.confirm(HighlightTokenKind.Operator);
            expr = expectExpr(parsing);
        }

        members.push({identifier: identifier, expr: expr});
    }

    return members;

}

// {'shared' | 'abstract' | 'final' | 'external'}
function parseEntityAttribute(parsing: ParsingState): EntityAttribute | undefined {
    const cache = parsing.cache(ParseCacheKind.EntityAttribute);
    if (cache.restore !== undefined) return cache.restore();

    let attribute: EntityAttribute | undefined = undefined;
    while (parsing.isEnd() === false) {
        const next = parsing.next().text;
        const isEntityToken = next === 'shared' || next === 'external' || next === 'abstract' || next === 'final';
        if (isEntityToken === false) break;
        if (attribute === undefined) attribute = {
            isShared: false,
            isExternal: false,
            isAbstract: false,
            isFinal: false
        };
        setEntityAttribute(attribute, next);
        parsing.confirm(HighlightTokenKind.Builtin);
    }

    cache.store(attribute);
    return attribute;
}

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
function parseClass(
    parsing: ParsingState,
    entity: EntityAttribute | undefined
): TriedParse<NodeClass> {
    const rangeStart = parsing.next();
    if (parsing.next().text !== 'class') return ParseFailure.Mismatch;
    parsing.confirm(HighlightTokenKind.Builtin);

    const identifier = expectIdentifier(parsing, HighlightTokenKind.Class);
    if (identifier === undefined) return ParseFailure.Pending;

    const typeParameters = parseTypeParameters(parsing);

    const baseList: ParsingToken[] = [];
    if (parsing.next().text === ':') {
        parsing.confirm(HighlightTokenKind.Operator);
        while (parsing.isEnd() === false) {
            if (parsing.next().text === '{') break;
            if (baseList.length > 0) {
                if (parsing.expect(',', HighlightTokenKind.Operator) === false) break;
            }
            const identifier = expectIdentifier(parsing, HighlightTokenKind.Type);
            if (identifier === undefined) break;
            baseList.push(identifier);
        }
    }
    const scopeStart = parsing.next();
    const members = expectClassMembers(parsing);
    const scopeEnd = parsing.prev();
    return {
        nodeName: NodeName.Class,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        scopeRange: {start: scopeStart, end: scopeEnd},
        entity: entity,
        identifier: identifier,
        typeParameters: typeParameters,
        baseList: baseList,
        memberList: members
    };
}

// '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'
function expectClassMembers(parsing: ParsingState) {
    parsing.expect('{', HighlightTokenKind.Operator);
    const members: (NodeVirtualProp | NodeVar | NodeFunc | NodeFuncDef)[] = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === '}') break;

        const parsedFunc = parseFunc(parsing);
        if (parsedFunc !== undefined) {
            members.push(parsedFunc);
            continue;
        }

        const parsedVar = parseVar(parsing);
        if (parsedVar !== undefined) {
            members.push(parsedVar);
            continue;
        }

        parsing.error("Expected class member ❌");
        parsing.step();
    }

    parsing.expect('}', HighlightTokenKind.Operator);
    return members;
}

// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
function parseFunc(parsing: ParsingState): NodeFunc | undefined {
    const rangeStart = parsing.next();

    const entityAttribute = parseEntityAttribute(parsing);

    const accessor = parseAccessModifier(parsing);

    let head: FuncHeads;
    if (parsing.next().text === '~') {
        parsing.confirm(HighlightTokenKind.Operator);
        head = funcHeadDestructor;
    } else if (parsing.next(0).kind === TokenKind.Identifier && parsing.next(1).text === '(') {
        head = funcHeadConstructor;
    } else {
        const returnType = parseType(parsing);
        if (returnType === undefined) {
            parsing.backtrack(rangeStart);
            return undefined;
        }
        const isRef = parsing.next().text === '&';
        if (isRef) parsing.confirm(HighlightTokenKind.Builtin);
        head = {returnType: returnType, isRef: isRef};
    }
    const identifier = parsing.next();
    parsing.confirm(isFunctionHeadReturns(head) ? HighlightTokenKind.Function : HighlightTokenKind.Type);
    const paramList = parseParamList(parsing);
    if (paramList === undefined) {
        parsing.backtrack(rangeStart);
        return undefined;
    }

    const isConst = parseConst(parsing);

    const funcAttr = parseFuncAttr(parsing);

    const statStart = parsing.next().text;
    let statBlock: NodeStatBlock | undefined = undefined;
    if (statStart === ';') {
        parsing.confirm(HighlightTokenKind.Operator);
    } else if (statStart === '{') {
        statBlock = parseStatBlock(parsing);
    } else {
        parsing.error("Expected ';' or '{' ❌");
    }
    if (statBlock === undefined) statBlock = {
        nodeName: NodeName.StatBlock,
        nodeRange: {start: parsing.next(), end: parsing.next()},
        statements: []
    };

    return {
        nodeName: NodeName.Func,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        entity: entityAttribute,
        accessor: accessor,
        head: head,
        identifier: identifier,
        paramList: paramList,
        isConst: isConst,
        funcAttr: funcAttr,
        statBlock: statBlock
    };
}

function parseConst(parsing: ParsingState): boolean {
    if (parsing.next().text !== 'const') return false;
    parsing.confirm(HighlightTokenKind.Keyword);
    return true;
}

// ['private' | 'protected']
function parseAccessModifier(parsing: ParsingState): AccessModifier | undefined {
    const next = parsing.next().text;
    if (next === 'private' || next === 'protected') {
        parsing.confirm(HighlightTokenKind.Builtin);
        return next === 'private' ? AccessModifier.Private : AccessModifier.Protected;
    }
    return undefined;
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))

// VAR           ::= ['private' | 'protected'] TYPE IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST]} ';'
function parseVar(parsing: ParsingState): NodeVar | undefined {
    const rangeStart = parsing.next();

    const accessor = parseAccessModifier(parsing);

    const type = parseType(parsing);
    if (type === undefined) return undefined;

    const variables: ParsedVariableInit[] = [];
    while (parsing.isEnd() === false) {
        // 識別子
        const identifier = parsing.next();
        if (identifier.kind !== TokenKind.Identifier) {
            if (variables.length === 0) {
                parsing.backtrack(rangeStart);
                return undefined;
            } else {
                parsing.error("Expected identifier ❌");
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
            const initListOrExpr = expectInitListOrExpr(parsing);
            variables.push({identifier: identifier, initializer: initListOrExpr});
        } else {
            const argList = parseArgList(parsing);
            variables.push({identifier: identifier, initializer: argList});
        }

        // 追加または終了判定
        if (parsing.next().text === ',') {
            parsing.confirm(HighlightTokenKind.Operator);
            continue;
        } else if (parsing.next().text === ';') {
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }

        parsing.error("Expected ',' or ';' ❌");
        parsing.step();
    }

    return {
        nodeName: NodeName.Var,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        accessor: accessor,
        type: type,
        variables: variables
    };
}

function expectInitListOrExpr(parsing: ParsingState) {
    const initList = parseInitList(parsing);
    if (initList !== undefined) {
        return initList;
    }

    const expr = expectExpr(parsing);
    if (expr !== undefined) {
        return expr;
    }

    parsing.error("Expected initializer list or expression ❌");
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
        const parsedVar = parseVar(parsing);
        if (parsedVar !== undefined) {
            statements.push(parsedVar);
            continue;
        }
        const statement = parseStatement(parsing);
        if (statement === ParseFailure.Pending) {
            continue;
        }
        if (statement !== ParseFailure.Mismatch) {
            statements.push(statement);
            continue;
        }
        parsing.step();
    }
    parsing.expect('}', HighlightTokenKind.Keyword);
    return {
        nodeName: NodeName.StatBlock,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        statements: statements
    };
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
function parseParamList(parsing: ParsingState): NodeParamList | undefined {
    if (parsing.next().text !== '(') return undefined;
    parsing.confirm(HighlightTokenKind.Operator);

    if (parsing.next().text === 'void') {
        parsing.confirm(HighlightTokenKind.Builtin);
        parsing.expect(')', HighlightTokenKind.Operator);
        return [];
    }

    const params: NodeParamList = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === ')') break;
        if (params.length > 0) {
            if (parsing.expect(',', HighlightTokenKind.Operator) === false) break;
        }
        const type = parseType(parsing);
        if (type === undefined) break;

        const typeMod = parseTypeMod(parsing);

        let identifier: ParsingToken | undefined = undefined;
        if (parsing.next().kind === TokenKind.Identifier) {
            identifier = parsing.next();
            parsing.confirm(HighlightTokenKind.Variable);
        }

        let defaultExpr: NodeExpr | undefined = undefined;
        if (parsing.next().text === '=') {
            parsing.confirm(HighlightTokenKind.Operator);
            defaultExpr = expectExpr(parsing);
        }
        params.push({type: type, modifier: typeMod, identifier: identifier, defaultExpr: defaultExpr});
    }

    parsing.expect(')', HighlightTokenKind.Operator);
    return params;
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]
function parseTypeMod(parsing: ParsingState): TypeModifier | undefined {
    if (parsing.next().text !== '&') return undefined;
    parsing.confirm(HighlightTokenKind.Builtin);
    const next = parsing.next().text;
    if (next === 'in' || next === 'out' || next === 'inout') {
        parsing.confirm(HighlightTokenKind.Builtin);
        if (next === 'in') return TypeModifier.In;
        if (next === 'out') return TypeModifier.Out;
    }
    return TypeModifier.InOut;
}

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
function parseType(parsing: ParsingState): NodeType | undefined {
    const rangeStart = parsing.next();
    const isConst = parseConst(parsing);
    const scope = parseScope(parsing);
    const datatype = parseDatatype(parsing);
    if (datatype === undefined) {
        parsing.backtrack(rangeStart);
        return undefined;
    }
    const typeParameters = parseTypeParameters(parsing) ?? [];
    const {isArray, refModifier} = parseTypeTail(parsing);
    return {
        nodeName: NodeName.Type,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        isConst: isConst,
        scope: scope,
        dataType: datatype,
        typeParameters: typeParameters,
        isArray: isArray,
        refModifier: refModifier
    };
}

function parseTypeTail(parsing: ParsingState) {
    let isArray = false;
    let refModifier: ReferenceModifier | undefined = undefined;
    while (parsing.isEnd() === false) {
        if (parsing.next(0).text === '[' && parsing.next().text === ']') {
            parsing.confirm(HighlightTokenKind.Operator);
            parsing.confirm(HighlightTokenKind.Operator);
            isArray = true;
            continue;
        } else if (parsing.next().text === '@') {
            parsing.confirm(HighlightTokenKind.Builtin);
            if (parsing.next().text === 'const') {
                parsing.confirm(HighlightTokenKind.Keyword);
                refModifier = ReferenceModifier.AtConst;
            } else {
                refModifier = ReferenceModifier.At;
            }
            continue;
        }
        break;
    }
    return {isArray, refModifier};
}

// '<' TYPE {',' TYPE} '>'
function parseTypeParameters(parsing: ParsingState): NodeType[] | undefined {
    const cache = parsing.cache(ParseCacheKind.TypeParameters);
    if (cache.restore !== undefined) return cache.restore();

    const rangeStart = parsing.next();
    if (parsing.next().text !== '<') return undefined;
    parsing.confirm(HighlightTokenKind.Operator);

    const typeParameters: NodeType[] = [];
    while (parsing.isEnd() === false) {
        const next = parsing.next();
        if (next.text === '>') {
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }
        if (typeParameters.length > 0) {
            if (next.text !== ',') {
                parsing.backtrack(rangeStart);
                return undefined;
            }
            parsing.confirm(HighlightTokenKind.Operator);
        }
        const type = parseType(parsing);
        if (type === undefined) {
            parsing.backtrack(rangeStart);
            return undefined;
        }
        typeParameters.push(type);
    }

    if (typeParameters.length == 0) {
        parsing.error("Expected type parameter ❌");
    }
    cache.store(typeParameters);
    return typeParameters;
}

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
function parseInitList(parsing: ParsingState): NodeInitList | undefined {
    if (parsing.next().text !== '{') return undefined;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightTokenKind.Operator);

    const initList: (NodeAssign | NodeInitList)[] = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === '}') {
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }
        if (initList.length > 0) {
            parsing.expect(',', HighlightTokenKind.Operator);
        }

        const assign = parseAssign(parsing);
        if (assign !== undefined) {
            initList.push(assign);
            continue;
        }

        const parsedInits = parseInitList(parsing);
        if (parsedInits !== undefined) {
            initList.push(parsedInits);
            continue;
        }

        parsing.error("Expected assignment or initializer list ❌");
        parsing.step();
    }
    return {
        nodeName: NodeName.InitList,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        initList: initList
    };
}

// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
function parseScope(parsing: ParsingState): NodeScope | undefined {
    const cache = parsing.cache(ParseCacheKind.Scope);
    if (cache.restore !== undefined) return cache.restore();

    const rangeStart = parsing.next();

    let isGlobal = false;
    if (parsing.next().text === '::') {
        parsing.confirm(HighlightTokenKind.Operator);
        isGlobal = true;
    }

    const scopeList: ParsingToken[] = [];
    let typeParameters: NodeType[] | undefined = undefined;
    while (parsing.isEnd() === false) {
        const identifier = parsing.next(0);
        if (identifier.kind !== TokenKind.Identifier) {
            break;
        }
        if (parsing.next(1).text === '::') {
            parsing.confirm(HighlightTokenKind.Namespace);
            parsing.confirm(HighlightTokenKind.Operator);
            scopeList.push(identifier);
            continue;
        } else if (parsing.next(1).text === '<') {
            const typesStart = parsing.next();
            parsing.confirm(HighlightTokenKind.Class);
            typeParameters = parseTypeParameters(parsing);
            if (typeParameters === undefined || parsing.next().text !== '::') {
                parsing.backtrack(typesStart);
            } else {
                parsing.confirm(HighlightTokenKind.Operator);
                scopeList.push(identifier);
            }
        }
        break;
    }

    if (isGlobal === false && scopeList.length === 0) {
        cache.store(undefined);
        return undefined;
    }

    const nodeScope: NodeScope = {
        nodeName: NodeName.Scope,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        isGlobal: isGlobal,
        scopeList: scopeList,
        typeParameters: typeParameters ?? []
    };
    cache.store(nodeScope);
    return nodeScope;
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
function parseDatatype(parsing: ParsingState): NodeDataType | undefined {
    // FIXME
    const next = parsing.next();
    if (next.kind === TokenKind.Identifier) {
        parsing.confirm(HighlightTokenKind.Type);
        return {
            nodeName: NodeName.DataType,
            nodeRange: {start: next, end: next},
            identifier: next
        };
    }

    if (next.text === '?' || next.text === 'auto') {
        parsing.confirm(HighlightTokenKind.Builtin);
        return {
            nodeName: NodeName.DataType,
            nodeRange: {start: next, end: next},
            identifier: next
        };
    }

    const primType = parsePrimeType(parsing);
    if (primType !== undefined) return {
        nodeName: NodeName.DataType,
        nodeRange: {start: next, end: next},
        identifier: primType
    };

    return undefined;
}

// PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
function parsePrimeType(parsing: ParsingState) {
    const next = parsing.next();
    if (next.kind !== TokenKind.Reserved || next.property.isPrimeType === false) return undefined;
    parsing.confirm(HighlightTokenKind.Builtin);
    return next;
}

// FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property'}
function parseFuncAttr(parsing: ParsingState): FunctionAttribute | undefined {
    let attribute: FunctionAttribute | undefined = undefined;
    while (parsing.isEnd() === false) {
        const next = parsing.next().text;
        const isFuncAttrToken = next === 'override' || next === 'final' || next === 'explicit' || next === 'property';
        if (isFuncAttrToken === false) break;
        if (attribute === undefined) attribute = {
            isOverride: false,
            isFinal: false,
            isExplicit: false,
            isProperty: false
        };
        setFunctionAttribute(attribute, next);
        parsing.confirm(HighlightTokenKind.Builtin);
    }
    return attribute;
}

// STATEMENT     ::= (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
function parseStatement(parsing: ParsingState): TriedParse<NodeStatement> {
    const parsedIf = parseIf(parsing);
    if (parsedIf === ParseFailure.Pending) return ParseFailure.Pending;
    if (parsedIf !== ParseFailure.Mismatch) return parsedIf;

    const parsedFor = parseFor(parsing);
    if (parsedFor === ParseFailure.Pending) return ParseFailure.Pending;
    if (parsedFor !== ParseFailure.Mismatch) return parsedFor;

    const parsedWhile = parseWhile(parsing);
    if (parsedWhile === ParseFailure.Pending) return ParseFailure.Pending;
    if (parsedWhile !== ParseFailure.Mismatch) return parsedWhile;

    const parsedReturn = parseReturn(parsing);
    if (parsedReturn === ParseFailure.Pending) return ParseFailure.Pending;
    if (parsedReturn !== ParseFailure.Mismatch) return parsedReturn;

    const statBlock = parseStatBlock(parsing);
    if (statBlock !== undefined) return statBlock;

    const parsedBreak = parseBreak(parsing);
    if (parsedBreak !== undefined) return parsedBreak;

    const parsedContinue = parseContinue(parsing);
    if (parsedContinue !== undefined) return parsedContinue;

    const doWhile = parseDoWhile(parsing);
    if (doWhile === ParseFailure.Pending) return ParseFailure.Pending;
    if (doWhile !== ParseFailure.Mismatch) return doWhile;

    const parsedSwitch = parseSwitch(parsing);
    if (parsedSwitch === ParseFailure.Pending) return ParseFailure.Pending;
    if (parsedSwitch !== ParseFailure.Mismatch) return parsedSwitch;

    const parsedTry = parseTry(parsing);
    if (parsedTry === ParseFailure.Pending) return ParseFailure.Pending;
    if (parsedTry !== ParseFailure.Mismatch) return parsedTry;

    const exprStat = parseExprStat(parsing);
    if (exprStat !== undefined) return exprStat;

    return ParseFailure.Mismatch;
}

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
function parseSwitch(parsing: ParsingState): TriedParse<NodeSwitch> {
    if (parsing.next().text !== 'switch') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightTokenKind.Keyword);
    parsing.expect('(', HighlightTokenKind.Operator);

    const assign = expectAssign(parsing);
    if (assign === undefined) return ParseFailure.Pending;

    parsing.expect(')', HighlightTokenKind.Operator);
    parsing.expect('{', HighlightTokenKind.Operator);
    const cases: NodeCase[] = [];

    while (parsing.isEnd() === false) {
        if (parsing.isEnd() || parsing.next().text === '}') break;
        const parsedCase = parseCase(parsing);
        if (parsedCase === ParseFailure.Mismatch) break;
        if (parsedCase === ParseFailure.Pending) continue;
        cases.push(parsedCase);
    }
    parsing.expect('}', HighlightTokenKind.Operator);
    return {
        nodeName: NodeName.Switch,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        assign: assign,
        cases: cases
    };
}

// BREAK         ::= 'break' ';'
function parseBreak(parsing: ParsingState): NodeBreak | undefined {
    if (parsing.next().text !== 'break') return undefined;
    const rangeStart = parsing.next();
    parsing.step();
    parsing.expect(';', HighlightTokenKind.Operator);
    return {nodeName: NodeName.Break, nodeRange: {start: rangeStart, end: parsing.prev()}};
}

// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
function parseFor(parsing: ParsingState): TriedParse<NodeFor> {
    if (parsing.next().text !== 'for') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.step();
    parsing.expect('(', HighlightTokenKind.Operator);

    const initial: NodeExprStat | NodeVar | undefined = parseExprStat(parsing) ?? parseVar(parsing);
    if (initial === undefined) {
        parsing.error("Expected initial expression or variable declaration ❌");
        return ParseFailure.Pending;
    }

    const condition = parseExprStat(parsing);
    if (condition === undefined) {
        parsing.error("Expected condition expression ❌");
        return ParseFailure.Pending;
    }

    const increment: NodeAssign[] = [];
    while (parsing.isEnd() === false) {
        if (increment.length > 0) {
            if (parsing.next().text !== ',') break;
            parsing.step();
        }
        const assign = parseAssign(parsing);
        if (assign === undefined) break;
        increment.push(assign);
    }

    parsing.expect(')', HighlightTokenKind.Operator);

    const statement = parseStatement(parsing);
    if (statement === ParseFailure.Mismatch || statement === ParseFailure.Pending) return ParseFailure.Pending;

    return {
        nodeName: NodeName.For,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        initial: initial,
        condition: condition,
        incrementList: increment,
        statement: statement
    };
}

// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
function parseWhile(parsing: ParsingState): TriedParse<NodeWhile> {
    if (parsing.next().text !== 'while') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.step();
    parsing.expect('(', HighlightTokenKind.Operator);
    const assign = parseAssign(parsing);
    if (assign === undefined) {
        parsing.error("Expected condition expression ❌");
        return ParseFailure.Pending;
    }
    parsing.expect(')', HighlightTokenKind.Operator);
    const statement = parseStatement(parsing);
    if (statement === ParseFailure.Mismatch || statement === ParseFailure.Pending) {
        parsing.error("Expected statement ❌");
        return ParseFailure.Pending;
    }

    return {
        nodeName: NodeName.While,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        assign: assign,
        statement: statement
    };
}

// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
function parseDoWhile(parsing: ParsingState): TriedParse<NodeDoWhile> {
    if (parsing.next().text !== 'do') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.step();
    const statement = parseStatement(parsing);
    if (statement === ParseFailure.Mismatch || statement === ParseFailure.Pending) {
        parsing.error("Expected statement ❌");
        return ParseFailure.Pending;
    }
    parsing.expect('while', HighlightTokenKind.Keyword);
    parsing.expect('(', HighlightTokenKind.Operator);
    const assign = parseAssign(parsing);
    if (assign === undefined) {
        parsing.error("Expected condition expression ❌");
        return ParseFailure.Pending;
    }
    parsing.expect(')', HighlightTokenKind.Operator);
    parsing.expect(';', HighlightTokenKind.Operator);
    return {
        nodeName: NodeName.DoWhile,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        statement: statement,
        assign: assign
    };
}

// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
function parseIf(parsing: ParsingState): TriedParse<NodeIf> {
    if (parsing.next().text !== 'if') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightTokenKind.Keyword);
    parsing.expect('(', HighlightTokenKind.Operator);
    const assign = parseAssign(parsing);
    if (assign === undefined) {
        parsing.error("Expected condition expression ❌");
        return ParseFailure.Pending;
    }
    parsing.expect(')', HighlightTokenKind.Operator);
    const thenStat = parseStatement(parsing);
    if (thenStat === ParseFailure.Mismatch || thenStat === ParseFailure.Pending) return ParseFailure.Pending;
    let elseStat = undefined;
    if (parsing.next().text === 'else') {
        parsing.confirm(HighlightTokenKind.Keyword);
        const parsedElse = parseStatement(parsing);
        if (parsedElse === ParseFailure.Mismatch || parsedElse === ParseFailure.Pending) {
            parsing.error("Expected statement ❌");
        } else {
            elseStat = parsedElse;
        }
    }
    return {
        nodeName: NodeName.If,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        condition: assign,
        thenStat: thenStat,
        elseStat: elseStat
    };
}

// CONTINUE      ::= 'continue' ';'
function parseContinue(parsing: ParsingState): NodeContinue | undefined {
    if (parsing.next().text !== 'continue') return undefined;
    const rangeStart = parsing.next();
    parsing.step();
    parsing.expect(';', HighlightTokenKind.Operator);
    return {nodeName: NodeName.Continue, nodeRange: {start: rangeStart, end: parsing.prev()}};
}

// EXPRSTAT      ::= [ASSIGN] ';'
function parseExprStat(parsing: ParsingState): NodeExprStat | undefined {
    if (parsing.next().text === ';') {
        parsing.confirm(HighlightTokenKind.Operator);
        return {
            nodeName: NodeName.ExprStat,
            assign: undefined
        };
    }
    const assign = parseAssign(parsing);
    if (assign === undefined) return undefined;
    parsing.expect(';', HighlightTokenKind.Operator);
    return {
        nodeName: NodeName.ExprStat,
        assign: assign
    };
}

// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK
function parseTry(parsing: ParsingState): TriedParse<NodeTry> {
    if (parsing.next().text !== 'try') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightTokenKind.Keyword);

    const tryBlock = parseStatBlock(parsing);
    if (tryBlock === undefined) {
        parsing.error("Expected try block ❌");
        return ParseFailure.Pending;
    }

    if (parsing.next().text !== 'catch') {
        parsing.error("Expected catch block ❌");
        return ParseFailure.Pending;
    }
    parsing.confirm(HighlightTokenKind.Keyword);

    const catchBlock = parseStatBlock(parsing);
    if (catchBlock === undefined) {
        parsing.error("Expected catch block ❌");
    }

    return {
        nodeName: NodeName.Try,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        tryBlock: tryBlock,
        catchBlock: catchBlock
    };
}

// RETURN        ::= 'return' [ASSIGN] ';'
function parseReturn(parsing: ParsingState): TriedParse<NodeReturn> {
    if (parsing.next().text !== 'return') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightTokenKind.Keyword);

    const assign = expectAssign(parsing);
    if (assign === undefined) return ParseFailure.Pending;

    parsing.expect(';', HighlightTokenKind.Operator);
    return {
        nodeName: NodeName.Return,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        assign: assign
    };
}

// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
function parseCase(parsing: ParsingState): TriedParse<NodeCase> {
    const rangeStart = parsing.next();
    let expr = undefined;
    if (parsing.next().text === 'case') {
        parsing.confirm(HighlightTokenKind.Keyword);

        expr = expectExpr(parsing);
        if (expr === undefined) return ParseFailure.Pending;
    } else if (parsing.next().text === 'default') {
        parsing.step();
    } else {
        return ParseFailure.Mismatch;
    }
    parsing.expect(':', HighlightTokenKind.Operator);
    const statements: NodeStatement[] = [];
    while (parsing.isEnd() === false) {
        const statement = parseStatement(parsing);
        if (statement === ParseFailure.Mismatch) break;
        if (statement === ParseFailure.Pending) continue;
        statements.push(statement);
    }
    return {
        nodeName: NodeName.Case,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        expr: expr,
        statementList: statements
    };
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
function parseExpr(parsing: ParsingState): NodeExpr | undefined {
    const rangeStart = parsing.next();

    const exprTerm = parseExprTerm(parsing);
    if (exprTerm === undefined) return undefined;

    const exprOp = parseExprOp(parsing);
    if (exprOp === undefined) return {
        nodeName: NodeName.Expr,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        head: exprTerm,
        tail: undefined
    };

    const tail = expectExpr(parsing);
    if (tail === undefined) return {
        nodeName: NodeName.Expr,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        head: exprTerm,
        tail: undefined
    };

    return {
        nodeName: NodeName.Expr,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        head: exprTerm,
        tail: {
            operator: exprOp,
            expression: tail
        }
    };
}

function expectExpr(parsing: ParsingState): NodeExpr | undefined {
    const expr = parseExpr(parsing);
    if (expr === undefined) {
        parsing.error("Expected expression ❌");
    }
    return expr;
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function parseExprTerm(parsing: ParsingState) {
    const exprTerm1 = parseExprTerm1(parsing);
    if (exprTerm1 !== undefined) return exprTerm1;

    const exprTerm2 = parseExprTerm2(parsing);
    if (exprTerm2 !== undefined) return exprTerm2;

    return undefined;
}

// ([TYPE '='] INITLIST)
function parseExprTerm1(parsing: ParsingState): NodeExprTerm1 | undefined {
    const rangeStart = parsing.next();

    const type = parseType(parsing);

    if (type !== undefined) {
        if (parsing.next().text !== '=') {
            parsing.backtrack(rangeStart);
            return undefined;
        }
        parsing.confirm(HighlightTokenKind.Operator);
    }

    const initList = parseInitList(parsing);
    if (initList === undefined) {
        parsing.backtrack(rangeStart);
        return undefined;
    }

    return {
        nodeName: NodeName.ExprTerm,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        exprTerm: 1,
        type: type,
        initList: initList
    };
}

// ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function parseExprTerm2(parsing: ParsingState): NodeExprTerm2 | undefined {
    const rangeStart = parsing.next();

    const preOps: ParsingToken[] = [];
    while (parsing.isEnd() === false) {
        const next = parsing.next();
        if (next.kind !== TokenKind.Reserved || next.property.isExprPreOp === false) break;
        preOps.push(parsing.next());
        parsing.confirm(HighlightTokenKind.Operator);
    }

    const exprValue = parseExprValue(parsing);
    if (exprValue === ParseFailure.Mismatch) parsing.backtrack(rangeStart);
    if (exprValue === ParseFailure.Mismatch || exprValue === ParseFailure.Pending) {
        return undefined;
    }

    const postOps: NodeExprPostOp[] = [];
    while (parsing.isEnd() === false) {
        const parsed = parseExprPostOp(parsing);
        if (parsed === undefined) break;
        postOps.push(parsed);
    }

    return {
        nodeName: NodeName.ExprTerm,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        exprTerm: 2,
        preOps: preOps,
        value: exprValue,
        postOps: postOps
    };
}

// EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
function parseExprValue(parsing: ParsingState): TriedParse<NodeExprValue> {
    const lambda = parseLambda(parsing);
    if (lambda === ParseFailure.Pending) return ParseFailure.Pending;
    if (lambda !== ParseFailure.Mismatch) return lambda;

    const cast = parseCast(parsing);
    if (cast === ParseFailure.Pending) return ParseFailure.Pending;
    if (cast !== ParseFailure.Mismatch) return cast;

    if (parsing.next().text === '(') {
        parsing.confirm(HighlightTokenKind.Operator);
        const assign = expectAssign(parsing);
        if (assign === undefined) return ParseFailure.Pending;
        parsing.expect(')', HighlightTokenKind.Operator);
        return assign;
    }

    const literal = parseLiteral(parsing);
    if (literal !== undefined) return literal;

    const funcCall = parseFuncCall(parsing);
    if (funcCall !== undefined) return funcCall;

    const constructCall = parseConstructCall(parsing);
    if (constructCall !== undefined) return constructCall;

    const varAccess = parseVarAccess(parsing);
    if (varAccess !== undefined) return varAccess;

    return ParseFailure.Mismatch;
}

// CONSTRUCTCALL ::= TYPE ARGLIST
function parseConstructCall(parsing: ParsingState): NodeConstructCall | undefined {
    const rangeStart = parsing.next();
    const type = parseType(parsing);
    if (type === undefined) return undefined;

    const argList = parseArgList(parsing);
    if (argList === undefined) {
        parsing.backtrack(rangeStart);
        return undefined;
    }

    return {
        nodeName: NodeName.ConstructCall,
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
    if (argList !== undefined)
        return {
            nodeName: NodeName.ExprPostOp,
            nodeRange: {start: rangeStart, end: parsing.prev()},
            postOp: 3,
            args: argList
        };

    const maybeOperator = parsing.next().text;
    if (maybeOperator === '++' || maybeOperator === '--') {
        parsing.confirm(HighlightTokenKind.Operator);
        return {
            nodeName: NodeName.ExprPostOp,
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
    if (funcCall !== undefined)
        return {
            nodeName: NodeName.ExprPostOp,
            nodeRange: {start: rangeStart, end: parsing.prev()},
            postOp: 1,
            member: funcCall,
        };

    const identifier = expectIdentifier(parsing, HighlightTokenKind.Variable);
    return {
        nodeName: NodeName.ExprPostOp,
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

    const indexerList: ParsedPostIndexer[] = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === ']') {
            parsing.confirm(HighlightTokenKind.Operator);
            if (indexerList.length === 0) {
                parsing.error("Expected index ❌");
            }
            break;
        }
        if (indexerList.length > 0) {
            if (parsing.expect(',', HighlightTokenKind.Operator) === false) break;
        }
        const identifier = parseIdentifierWithColon(parsing);
        const assign = expectAssign(parsing);
        if (assign === undefined) continue;
        indexerList.push({identifier: identifier, assign: assign});
    }
    return {
        nodeName: NodeName.ExprPostOp,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        postOp: 2,
        indexerList: indexerList
    };
}

// [IDENTIFIER ':']
function parseIdentifierWithColon(parsing: ParsingState): ParsingToken | undefined {
    if (parsing.next(0).kind === TokenKind.Identifier && parsing.next(1).text === ':') {
        const identifier = parsing.next();
        parsing.confirm(HighlightTokenKind.Parameter);
        parsing.confirm(HighlightTokenKind.Operator);
        return identifier;
    }
    return undefined;
}

// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
function parseCast(parsing: ParsingState): TriedParse<NodeCast> {
    if (parsing.next().text !== 'cast') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightTokenKind.Keyword);
    parsing.expect('<', HighlightTokenKind.Operator);
    const type = parseType(parsing);
    if (type === undefined) {
        parsing.error("Expected type ❌");
        return ParseFailure.Pending;
    }
    parsing.expect('>', HighlightTokenKind.Operator);
    parsing.expect('(', HighlightTokenKind.Operator);
    const assign = expectAssign(parsing);
    if (assign === undefined) return ParseFailure.Pending;
    parsing.expect(')', HighlightTokenKind.Operator);
    return {
        nodeName: NodeName.Cast,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        type: type,
        assign: assign
    };
}

// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
const parseLambda = (parsing: ParsingState): TriedParse<NodeLambda> => {
    if (parsing.next().text !== 'function') return ParseFailure.Mismatch;
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

        if (parsing.next(0).kind === TokenKind.Identifier && parsing.next(1).kind === TokenKind.Reserved) {
            parsing.confirm(HighlightTokenKind.Parameter);
            params.push({type: undefined, typeMod: undefined, identifier: parsing.next()});
            continue;
        }

        const type = parseType(parsing);
        const typeMod = type !== undefined ? parseTypeMod(parsing) : undefined;

        let identifier: ParsingToken | undefined = undefined;
        if (parsing.next().kind === TokenKind.Identifier) {
            identifier = parsing.next();
            parsing.confirm(HighlightTokenKind.Parameter);
        }
        params.push({type: type, typeMod: typeMod, identifier: identifier});
    }
    const statBlock = parseStatBlock(parsing);
    if (statBlock === undefined) {
        parsing.backtrack(rangeStart);
        return ParseFailure.Mismatch;
    }
    return {
        nodeName: NodeName.Lambda,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        params: params,
        statBlock: statBlock
    };
};

// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
function parseLiteral(parsing: ParsingState): NodeLiteral | undefined {
    const next = parsing.next();
    if (next.kind === TokenKind.Number) {
        parsing.confirm(HighlightTokenKind.Number);
        return {nodeName: NodeName.Literal, nodeRange: {start: next, end: next}, value: next};
    }
    if (next.kind === TokenKind.String) {
        parsing.confirm(HighlightTokenKind.String);
        return {nodeName: NodeName.Literal, nodeRange: {start: next, end: next}, value: next};
    }
    if (next.text === 'true' || next.text === 'false' || next.text === 'null') {
        parsing.confirm(HighlightTokenKind.Builtin);
        return {nodeName: NodeName.Literal, nodeRange: {start: next, end: next}, value: next};
    }
    return undefined;
}

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
function parseFuncCall(parsing: ParsingState): NodeFuncCall | undefined {
    const rangeStart = parsing.next();
    const scope = parseScope(parsing);
    const identifier = parsing.next();
    if (identifier.kind !== TokenKind.Identifier) {
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
        nodeName: NodeName.FuncCall,
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
    if (next.kind !== TokenKind.Identifier) {
        if (scope === undefined) return undefined;
        parsing.error("Expected identifier ❌");
        return {
            nodeName: NodeName.VarAccess,
            nodeRange: {start: rangeStart, end: parsing.prev()},
            scope: scope,
            identifier: undefined
        };
    }
    const isBuiltin: boolean = next.text === 'this';
    parsing.confirm(isBuiltin ? HighlightTokenKind.Builtin : HighlightTokenKind.Variable);
    return {
        nodeName: NodeName.VarAccess,
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
    const argList: { identifier: ParsingToken | undefined, assign: NodeAssign }[] = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === ')') {
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }
        if (argList.length > 0) {
            if (parsing.expect(',', HighlightTokenKind.Operator) === false) break;
        }
        const identifier = parseIdentifierWithColon(parsing);
        const assign = expectAssign(parsing);
        if (assign === undefined) break;
        argList.push({identifier: identifier, assign: assign});
    }
    return {
        nodeName: NodeName.ArgList,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        argList: argList
    };
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
function parseAssign(parsing: ParsingState): NodeAssign | undefined {
    const rangeStart = parsing.next();
    const condition = parseCondition(parsing);
    if (condition === undefined) return undefined;
    const op = parseAssignOp(parsing);
    const result: NodeAssign = {
        nodeName: NodeName.Assign,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        condition: condition,
        tail: undefined
    };
    if (op === undefined) return result;
    const assign = parseAssign(parsing);
    if (assign === undefined) return result;
    result.tail = {op: op, assign: assign};
    result.nodeRange.end = parsing.prev();
    return result;
}

function expectAssign(parsing: ParsingState): NodeAssign | undefined {
    const assign = parseAssign(parsing);
    if (assign === undefined) {
        parsing.error("Expected assignment ❌");
    }
    return assign;
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
function parseCondition(parsing: ParsingState): NodeCondition | undefined {
    const rangeStart = parsing.next();
    const expr = parseExpr(parsing);
    if (expr === undefined) return undefined;
    const result: NodeCondition = {
        nodeName: NodeName.Condition,
        nodeRange: {start: rangeStart, end: rangeStart},
        expr: expr,
        ternary: undefined
    };
    if (parsing.next().text === '?') {
        parsing.confirm(HighlightTokenKind.Operator);
        const trueAssign = expectAssign(parsing);
        if (trueAssign === undefined) return result;
        parsing.expect(':', HighlightTokenKind.Operator);
        const falseAssign = expectAssign(parsing);
        if (falseAssign === undefined) return result;
        result.ternary = {trueAssign: trueAssign, falseAssign: falseAssign};
    }
    result.nodeRange.end = parsing.prev();
    return result;
}

// EXPROP        ::= MATHOP | COMPOP | LOGICOP | BITOP
function parseExprOp(parsing: ParsingState) {
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
function parseAssignOp(parsing: ParsingState) {
    const next = parsing.next();
    if (next.kind !== TokenKind.Reserved || next.property.isAssignOp === false) return undefined;
    parsing.confirm(HighlightTokenKind.Operator);
    return next;
}

export function parseFromTokenized(tokens: ParsingToken[]): NodeScript {
    const parsing = new ParsingState(tokens);
    const script: NodeScript = [];
    while (parsing.isEnd() === false) {
        script.push(...parseScript(parsing));
        if (parsing.isEnd() === false) {
            parsing.error("Unexpected token ❌");
            parsing.step();
        }
    }

    return script;
}

// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_script_bnf.html

import {
    AccessModifier,
    EntityAttribute,
    funcHeadConstructor,
    funcHeadDestructor,
    FuncHeads,
    FunctionAttribute, getLocationBetween,
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
    NodeImport,
    NodeInitList,
    NodeInterface,
    NodeIntfMethod,
    NodeLambda,
    NodeLiteral,
    NodeMixin,
    NodeName,
    NodeNamespace,
    NodeParamList,
    NodeReturn,
    NodesBase,
    NodeScope,
    NodeScript,
    NodeStatBlock,
    NodeStatement,
    NodeSwitch,
    NodeTry,
    NodeType,
    NodeTypeDef,
    NodeVar,
    NodeVarAccess,
    NodeVirtualProp,
    NodeWhile,
    ParsedArgument,
    ParsedEnumMember,
    ParsedGetterSetter,
    ParsedPostIndexer,
    ParsedVariableInit,
    ReferenceModifier,
    setEntityAttribute,
    setFunctionAttribute,
    TypeModifier
} from "./nodes";
import {HighlightToken} from "../code/highlight";
import {createVirtualToken, isTokensLinkedBy, ParsingToken} from "./parsingToken";
import {TokenKind} from "./tokens";
import {BreakThrough, ParseFailure, ParsingState, TriedParse} from "./parsingState";
import {ParseCacheKind} from "./parseCached";

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
function parseScript(parsing: ParsingState): NodeScript {
    const script: NodeScript = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === ';') {
            parsing.confirm(HighlightToken.Operator);
            continue;
        }

        const parsedImport = parseImport(parsing);
        if (parsedImport === ParseFailure.Pending) continue;
        if (parsedImport !== ParseFailure.Mismatch) {
            script.push(parsedImport);
            continue;
        }

        const parsedTypeDef = parseTypeDef(parsing);
        if (parsedTypeDef === ParseFailure.Pending) continue;
        if (parsedTypeDef !== ParseFailure.Mismatch) {
            script.push(parsedTypeDef);
            continue;
        }

        const parsedMixin = parseMixin(parsing);
        if (parsedMixin === ParseFailure.Pending) continue;
        if (parsedMixin !== ParseFailure.Mismatch) {
            script.push(parsedMixin);
            continue;
        }

        const parsedNamespace = parseNamespace(parsing);
        if (parsedNamespace === ParseFailure.Pending) continue;
        if (parsedNamespace !== ParseFailure.Mismatch) {
            script.push(parsedNamespace);
            continue;
        }

        const parsedClass = parseClass(parsing);
        if (parsedClass === ParseFailure.Pending) continue;
        if (parsedClass !== ParseFailure.Mismatch) {
            script.push(parsedClass);
            continue;
        }

        const parsedInterface = parseInterface(parsing);
        if (parsedInterface === ParseFailure.Pending) continue;
        if (parsedInterface !== ParseFailure.Mismatch) {
            script.push(parsedInterface);
            continue;
        }

        const parsedEnum = parseEnum(parsing);
        if (parsedEnum === ParseFailure.Pending) continue;
        if (parsedEnum !== ParseFailure.Mismatch) {
            script.push(parsedEnum);
            continue;
        }

        const parsedFuncDef = parseFuncDef(parsing);
        if (parsedFuncDef === ParseFailure.Pending) continue;
        if (parsedFuncDef !== ParseFailure.Mismatch) {
            script.push(parsedFuncDef);
            continue;
        }

        const parsedFunc = parseFunc(parsing);
        if (parsedFunc !== undefined) {
            script.push(parsedFunc);
            continue;
        }

        const parsedVirtualProp = parseVirtualProp(parsing);
        if (parsedVirtualProp !== undefined) {
            script.push(parsedVirtualProp);
            continue;
        }

        parseMetadata(parsing);
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
    parsing.confirm(HighlightToken.Builtin);

    const namespaceList: ParsingToken[] = [];
    while (parsing.isEnd() === false) {
        const identifier = expectIdentifier(parsing, HighlightToken.Namespace);
        if (identifier !== undefined) namespaceList.push(identifier);

        if (expectContinuousOrClose(parsing, '::', '{', true) === BreakThrough.Break) break;

        if (identifier === undefined) parsing.step();
    }

    if (namespaceList.length === 0) {
        return ParseFailure.Pending;
    }

    const script = parseScript(parsing);

    parsing.expect('}', HighlightToken.Operator);

    return {
        nodeName: NodeName.Namespace,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        namespaceList: namespaceList,
        script: script
    };
}

function parseIdentifier(parsing: ParsingState, kind: HighlightToken): ParsingToken | undefined {
    const identifier = parsing.next();
    if (identifier.kind !== TokenKind.Identifier) return undefined;
    parsing.confirm(kind);
    return identifier;
}

function expectIdentifier(parsing: ParsingState, kind: HighlightToken): ParsingToken | undefined {
    const identifier = parseIdentifier(parsing, kind);
    if (identifier === undefined) {
        parsing.error("Expected identifier ❌");
    }
    return identifier;
}

function expectContextualKeyword(parsing: ParsingState, keyword: string): boolean {
    if (parsing.next().text !== keyword) {
        parsing.error(`Expected '${keyword}' ❌`);
        return false;
    }
    parsing.confirm(HighlightToken.Keyword);
    return true;
}

// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
function parseEnum(parsing: ParsingState): TriedParse<NodeEnum> {
    const rangeStart = parsing.next();

    const entity = parseEntityAttribute(parsing);

    if (parsing.next().text !== 'enum') {
        parsing.backtrack(rangeStart);
        return ParseFailure.Mismatch;
    }
    parsing.confirm(HighlightToken.Builtin);

    const identifier = expectIdentifier(parsing, HighlightToken.Enum);
    if (identifier === undefined) return ParseFailure.Pending;

    let memberList: ParsedEnumMember[] = [];
    const scopeStart = parsing.next();

    if (parsing.next().text === ';') {
        parsing.confirm(HighlightToken.Operator);
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
    parsing.expect('{', HighlightToken.Operator);
    while (parsing.isEnd() === false) {
        if (expectContinuousOrClose(parsing, ',', '}', members.length > 0) === BreakThrough.Break) break;

        const identifier = expectIdentifier(parsing, HighlightToken.EnumMember);
        if (identifier === undefined) break;

        let expr: NodeExpr | undefined = undefined;
        if (parsing.next().text === '=') {
            parsing.confirm(HighlightToken.Operator);
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
        parsing.confirm(HighlightToken.Builtin);
    }

    cache.store(attribute);
    return attribute;
}

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
function parseClass(parsing: ParsingState): TriedParse<NodeClass> {
    const rangeStart = parsing.next();

    parseMetadata(parsing);

    const entity = parseEntityAttribute(parsing);

    if (parsing.next().text !== 'class') {
        parsing.backtrack(rangeStart);
        return ParseFailure.Mismatch;
    }
    parsing.confirm(HighlightToken.Builtin);

    const identifier = expectIdentifier(parsing, HighlightToken.Class);
    if (identifier === undefined) return ParseFailure.Pending;

    const typeTemplates = parseTypeTemplates(parsing);

    const baseList: ParsingToken[] = [];
    if (parsing.next().text === ':') {
        parsing.confirm(HighlightToken.Operator);
        while (parsing.isEnd() === false) {
            const identifier = expectIdentifier(parsing, HighlightToken.Type);
            if (identifier !== undefined) baseList.push(identifier);

            if (expectContinuousOrClose(parsing, ',', '{', true) === BreakThrough.Break) break;

            if (identifier === undefined) parsing.step();
        }
    } else {
        parsing.expect('{', HighlightToken.Operator);
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
        typeTemplates: typeTemplates,
        baseList: baseList,
        memberList: members
    };
}

// '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'
function expectClassMembers(parsing: ParsingState) {
    // parsing.expect('{', HighlightTokenKind.Operator);
    const members: (NodeVirtualProp | NodeVar | NodeFunc | NodeFuncDef)[] = [];
    while (parsing.isEnd() === false) {
        if (parseCloseOperator(parsing, '}') === BreakThrough.Break) break;

        const parsedFuncDef = parseFuncDef(parsing);
        if (parsedFuncDef === ParseFailure.Pending) continue;
        if (parsedFuncDef !== ParseFailure.Mismatch) {
            members.push(parsedFuncDef);
            continue;
        }

        const parsedFunc = parseFunc(parsing);
        if (parsedFunc !== undefined) {
            members.push(parsedFunc);
            continue;
        }

        const parsedVirtualProp = parseVirtualProp(parsing);
        if (parsedVirtualProp !== undefined) {
            members.push(parsedVirtualProp);
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

    return members;
}

// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'
function parseTypeDef(parsing: ParsingState): TriedParse<NodeTypeDef> {
    if (parsing.next().text !== 'typedef') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightToken.Builtin);

    const primeType = parsePrimeType(parsing);
    if (primeType === undefined) {
        parsing.error("Expected primitive type ❌");
        return ParseFailure.Pending;
    }

    const identifier = parsing.next();
    parsing.confirm(HighlightToken.Type);

    parsing.expect(';', HighlightToken.Operator);

    return {
        nodeName: NodeName.TypeDef,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        type: primeType,
        identifier: identifier
    };
}

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
function parseFunc(parsing: ParsingState): NodeFunc | undefined {
    const rangeStart = parsing.next();

    parseMetadata(parsing);

    const entityAttribute = parseEntityAttribute(parsing);

    const accessor = parseAccessModifier(parsing);

    let head: FuncHeads;
    if (parsing.next().text === '~') {
        parsing.confirm(HighlightToken.Operator);
        head = funcHeadDestructor;
    } else if (parsing.next(0).kind === TokenKind.Identifier && parsing.next(1).text === '(') {
        head = funcHeadConstructor;
    } else {
        const returnType = parseType(parsing);
        if (returnType === undefined) {
            parsing.backtrack(rangeStart);
            return undefined;
        }

        const isRef = parseRef(parsing);

        head = {returnType: returnType, isRef: isRef};
    }
    const identifier = parsing.next();
    parsing.confirm(isFunctionHeadReturns(head) ? HighlightToken.Function : HighlightToken.Type);

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
        parsing.confirm(HighlightToken.Operator);
    } else {
        statBlock = expectStatBlock(parsing);
    }

    if (statBlock === undefined) statBlock = {
        nodeName: NodeName.StatBlock,
        nodeRange: {start: parsing.next(), end: parsing.next()},
        statementList: []
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
    parsing.confirm(HighlightToken.Keyword);
    return true;
}

function parseRef(parsing: ParsingState) {
    const isRef = parsing.next().text === '&';
    if (isRef) parsing.confirm(HighlightToken.Builtin);
    return isRef;
}

// Metadata declarations in the same place and the only other rule is the matching count of '[' and ']'
// eg. '[Hello[]]' is ok but '[Hello[]' is not.
function parseMetadata(parsing: ParsingState) {
    const rangeStart = parsing.next();
    if (parsing.next().text !== '[') return;

    let level = 0;

    while (parsing.isEnd() === false) {
        if (parsing.next().text === '[') {
            level++;
            parsing.confirm(HighlightToken.Operator);
        } else if (parsing.next().text === ']') {
            level--;
            parsing.confirm(HighlightToken.Operator);

            if (level === 0) return;
        } else {
            parsing.confirm(HighlightToken.Decorator);
        }
    }

    if (level !== 0) {
        parsing.backtrack(rangeStart);
    }
}

// ['private' | 'protected']
function parseAccessModifier(parsing: ParsingState): AccessModifier | undefined {
    const next = parsing.next().text;
    if (next === 'private' || next === 'protected') {
        parsing.confirm(HighlightToken.Builtin);
        return next === 'private' ? AccessModifier.Private : AccessModifier.Protected;
    }
    return undefined;
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))
function parseInterface(parsing: ParsingState): TriedParse<NodeInterface> {
    const rangeStart = parsing.next();

    const entity = parseEntityAttribute(parsing);

    if (parsing.next().text !== 'interface') {
        parsing.backtrack(rangeStart);
        return ParseFailure.Mismatch;
    }
    parsing.confirm(HighlightToken.Builtin);

    const identifier = expectIdentifier(parsing, HighlightToken.Interface);
    if (identifier === undefined) return ParseFailure.Pending;

    const result: NodeInterface = {
        nodeName: NodeName.Interface,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        entity: entity,
        identifier: identifier,
        baseList: [],
        memberList: []
    };

    if (parsing.next().text === ';') {
        parsing.confirm(HighlightToken.Operator);
        return result;
    }

    if (parsing.next().text === ':') {
        parsing.confirm(HighlightToken.Operator);
        while (parsing.isEnd() === false) {
            const identifier = expectIdentifier(parsing, HighlightToken.Type);
            if (identifier !== undefined) result.baseList.push(identifier);

            if (expectContinuousOrClose(parsing, ',', '{', true) === BreakThrough.Break) break;

            if (identifier === undefined) parsing.step();
        }
    } else {
        parsing.expect('{', HighlightToken.Operator);
    }

    result.memberList = expectInterfaceMembers(parsing);

    return result;
}

// '{' {VIRTPROP | INTFMTHD} '}'
function expectInterfaceMembers(parsing: ParsingState): (NodeIntfMethod | NodeVirtualProp)[] {
    // parsing.expect('{', HighlightTokenKind.Operator);

    const members: (NodeIntfMethod | NodeVirtualProp)[] = [];
    while (parsing.isEnd() === false) {
        if (parseCloseOperator(parsing, '}') === BreakThrough.Break) break;

        const intfMethod = parseIntfMethod(parsing);
        if (intfMethod !== undefined) {
            members.push(intfMethod);
            continue;
        }

        const virtualProp = parseVirtualProp(parsing);
        if (virtualProp !== undefined) {
            members.push(virtualProp);
            continue;
        }

        parsing.error("Expected interface member ❌");
        parsing.step();
    }
    return members;
}

// VAR           ::= ['private' | 'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
function parseVar(parsing: ParsingState): NodeVar | undefined {
    const rangeStart = parsing.next();

    parseMetadata(parsing);

    const accessor = parseAccessModifier(parsing);

    const type = parseType(parsing);
    if (type === undefined) {
        parsing.backtrack(rangeStart);
        return undefined;
    }

    if (parsing.next().kind !== TokenKind.Identifier) {
        parsing.backtrack(rangeStart);
        return undefined;
    }

    const variables: ParsedVariableInit[] = [];
    while (parsing.isEnd() === false) {
        // 識別子
        const identifier = expectIdentifier(parsing, HighlightToken.Variable);
        if (identifier === undefined) break;

        // 初期化子
        if (parsing.next().text === '=') {
            parsing.confirm(HighlightToken.Operator);

            const initListOrExpr = expectInitListOrExpr(parsing);
            variables.push({identifier: identifier, initializer: initListOrExpr});
        } else {
            const argList = parseArgList(parsing);
            variables.push({identifier: identifier, initializer: argList});
        }

        // 追加または終了判定
        if (expectContinuousOrClose(parsing, ',', ';', true) === BreakThrough.Break) break;
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

    const expr = expectAssign(parsing);
    if (expr !== undefined) {
        return expr;
    }

    parsing.error("Expected initializer list or assignment ❌");
}

// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
function parseImport(parsing: ParsingState): TriedParse<NodeImport> {
    const rangeStart = parsing.next();

    if (parsing.next().text !== 'import') return ParseFailure.Mismatch;
    parsing.confirm(HighlightToken.Keyword);

    const type = expectType(parsing);
    if (type === undefined) return ParseFailure.Pending;

    const isRef = parseRef(parsing);

    const identifier = expectIdentifier(parsing, HighlightToken.Variable);
    if (identifier === undefined) return ParseFailure.Pending;

    const paramList = expectParamList(parsing);
    if (paramList === undefined) return ParseFailure.Pending;

    const funcAttr = parseFuncAttr(parsing);

    if (expectContextualKeyword(parsing, 'from') === false) return ParseFailure.Pending;

    const path = parsing.next();
    if (path.kind !== TokenKind.String) {
        parsing.error("Expected string path ❌");
        return ParseFailure.Pending;
    }
    parsing.confirm(HighlightToken.String);

    parsing.expect(';', HighlightToken.Operator);

    return {
        nodeName: NodeName.Import,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        type: type,
        isRef: isRef,
        identifier: identifier,
        paramList: paramList,
        funcAttr: funcAttr,
        path: path
    };
}

// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
function parseFuncDef(parsing: ParsingState): TriedParse<NodeFuncDef> {
    const rangeStart = parsing.next();

    const entity = parseEntityAttribute(parsing);

    if (parsing.next().text !== 'funcdef') {
        parsing.backtrack(rangeStart);
        return ParseFailure.Mismatch;
    }
    parsing.confirm(HighlightToken.Builtin);

    const returnType = expectType(parsing);
    if (returnType === undefined) return ParseFailure.Pending;

    const isRef = parseRef(parsing);

    const identifier = parsing.next();
    parsing.confirm(HighlightToken.Function);

    const paramList = expectParamList(parsing);
    if (paramList === undefined) return ParseFailure.Pending;

    parsing.expect(';', HighlightToken.Operator);

    return {
        nodeName: NodeName.FuncDef,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        entity: entity,
        returnType: returnType,
        isRef: isRef,
        identifier: identifier,
        paramList: paramList
    };
}

// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
function parseVirtualProp(parsing: ParsingState): NodeVirtualProp | undefined {
    const rangeStart = parsing.next();

    parseMetadata(parsing);

    const accessor = parseAccessModifier(parsing);

    const type = parseType(parsing);
    if (type === undefined) {
        parsing.backtrack(rangeStart);
        return undefined;
    }

    const isRef = parseRef(parsing);

    const identifier = parseIdentifier(parsing, HighlightToken.Variable);
    if (identifier === undefined) {
        parsing.backtrack(rangeStart);
        return undefined;
    }

    if (parsing.next().text !== '{') {
        parsing.backtrack(rangeStart);
        return undefined;
    }
    parsing.confirm(HighlightToken.Operator);

    let getter: ParsedGetterSetter | undefined = undefined;
    let setter: ParsedGetterSetter | undefined = undefined;
    while (parsing.isEnd() === false) {
        const next = parsing.next().text;
        if (parseCloseOperator(parsing, '}') === BreakThrough.Break) break;
        else if (next === 'get') getter = expectGetterSetter(parsing);
        else if (next === 'set') setter = expectGetterSetter(parsing);
        else {
            parsing.error("Expected getter or setter ❌");
            parsing.step();
        }
    }

    return {
        nodeName: NodeName.VirtualProp,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        accessor: accessor,
        type: type,
        isRef: isRef,
        identifier: identifier,
        getter: getter,
        setter: setter
    };
}

// ('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')
function expectGetterSetter(parsing: ParsingState): ParsedGetterSetter {
    parsing.confirm(HighlightToken.Builtin);

    const isConst = parseConst(parsing);
    const funcAttr = parseFuncAttr(parsing);
    const statBlock = expectStatBlock(parsing);

    return {
        isConst: isConst,
        funcAttr: funcAttr,
        statBlock: statBlock
    };
}

// MIXIN         ::= 'mixin' CLASS
function parseMixin(parsing: ParsingState): TriedParse<NodeMixin> {
    if (parsing.next().text !== 'mixin') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightToken.Builtin);

    const parsedClass = parseClass(parsing);
    if (parsedClass === ParseFailure.Pending) return ParseFailure.Pending;
    if (parsedClass === ParseFailure.Mismatch) {
        parsing.error("Expected class definition ❌");
        return ParseFailure.Pending;
    }

    return {
        nodeName: NodeName.Mixin,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        mixinClass: parsedClass
    };
}

// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'
function parseIntfMethod(parsing: ParsingState): NodeIntfMethod | undefined {
    const rangeStart = parsing.next();

    const returnType = expectType(parsing);
    if (returnType === undefined) return undefined;

    const isRef = parseRef(parsing);

    const identifier = parseIdentifier(parsing, HighlightToken.Function);
    if (identifier === undefined) return undefined;

    const paramList = parseParamList(parsing);
    if (paramList === undefined) return undefined;

    const isConst = parseConst(parsing);

    parsing.expect(';', HighlightToken.Operator);

    return {
        nodeName: NodeName.IntfMethod,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        returnType: returnType,
        isRef: isRef,
        identifier: identifier,
        paramList: paramList,
        isConst: isConst
    };
}

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
function parseStatBlock(parsing: ParsingState): NodeStatBlock | undefined {
    if (parsing.next().text !== '{') return undefined;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightToken.Operator);

    const statementList: (NodeVar | NodeStatement)[] = [];
    while (parsing.isEnd() === false) {
        if (parseCloseOperator(parsing, '}') === BreakThrough.Break) break;

        const parsedVar = parseVar(parsing);
        if (parsedVar !== undefined) {
            statementList.push(parsedVar);
            continue;
        }

        const statement = parseStatement(parsing);
        if (statement === ParseFailure.Pending) continue;
        if (statement !== ParseFailure.Mismatch) {
            statementList.push(statement);
            continue;
        }

        parsing.error("Expected statement ❌");
        parsing.step();
    }

    return {
        nodeName: NodeName.StatBlock,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        statementList: statementList
    };
}

function expectStatBlock(parsing: ParsingState): NodeStatBlock | undefined {
    const statBlock = parseStatBlock(parsing);
    if (statBlock === undefined) {
        parsing.error("Expected statement block ❌");
    }
    return statBlock;
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
function parseParamList(parsing: ParsingState): NodeParamList | undefined {
    if (parsing.next().text !== '(') return undefined;
    parsing.confirm(HighlightToken.Operator);

    if (parsing.next().text === 'void') {
        parsing.confirm(HighlightToken.Builtin);
        parsing.expect(')', HighlightToken.Operator);
        return [];
    }

    const paramList: NodeParamList = [];
    while (parsing.isEnd() === false) {
        if (expectCommaOrParensClose(parsing, paramList.length > 0) === BreakThrough.Break) break;

        const type = expectType(parsing);
        if (type === undefined) {
            parsing.step();
            continue;
        }

        const typeMod = parseTypeMod(parsing);

        let identifier: ParsingToken | undefined = undefined;
        if (parsing.next().kind === TokenKind.Identifier) {
            identifier = parsing.next();
            parsing.confirm(HighlightToken.Variable);
        }

        let defaultExpr: NodeExpr | undefined = undefined;
        if (parsing.next().text === '=') {
            parsing.confirm(HighlightToken.Operator);
            defaultExpr = expectExpr(parsing);
        }
        paramList.push({type: type, modifier: typeMod, identifier: identifier, defaultExpr: defaultExpr});
    }

    return paramList;
}

function expectParamList(parsing: ParsingState): NodeParamList | undefined {
    const paramList = parseParamList(parsing);
    if (paramList === undefined) {
        parsing.error("Expected parameter list ❌");
    }
    return paramList;
}

function expectCommaOrParensClose(parsing: ParsingState, canColon: boolean): BreakThrough {
    return expectContinuousOrClose(parsing, ',', ')', canColon);
}

function isCommaOrParensClose(character: string): boolean {
    return character === ',' || character === ')';
}

function parseContinuousOrClose(
    parsing: ParsingState, continuousOp: string, closeOp: string, canColon: boolean
): BreakThrough | undefined {
    const next = parsing.next().text;
    if (next === closeOp) {
        parsing.confirm(HighlightToken.Operator);
        return BreakThrough.Break;
    } else if (canColon) {
        if (next !== continuousOp) return undefined;
        parsing.confirm(HighlightToken.Operator);
    }
    return BreakThrough.Through;
}

function expectContinuousOrClose(
    parsing: ParsingState, continuousOp: string, closeOp: string, canColon: boolean
): BreakThrough {
    const parsed = parseContinuousOrClose(parsing, continuousOp, closeOp, canColon);
    if (parsed !== undefined) return parsed;

    parsing.error(`Expected '${continuousOp}' or '${closeOp}' ❌`);
    return BreakThrough.Break;
}

function parseCloseOperator(parsing: ParsingState, closeOp: string): BreakThrough {
    const next = parsing.next().text;
    if (next === closeOp) {
        parsing.confirm(HighlightToken.Operator);
        return BreakThrough.Break;
    }
    return BreakThrough.Through;
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]
function parseTypeMod(parsing: ParsingState): TypeModifier | undefined {
    if (parsing.next().text !== '&') return undefined;
    parsing.confirm(HighlightToken.Builtin);

    const next = parsing.next().text;
    if (next === 'in' || next === 'out' || next === 'inout') {
        parsing.confirm(HighlightToken.Builtin);
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

    const typeTemplates = parseTypeTemplates(parsing) ?? [];

    const {isArray, refModifier} = parseTypeTail(parsing);

    return {
        nodeName: NodeName.Type,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        isConst: isConst,
        scope: scope,
        dataType: datatype,
        typeTemplates: typeTemplates,
        isArray: isArray,
        refModifier: refModifier
    };
}

function parseTypeTail(parsing: ParsingState) {
    let isArray = false;
    let refModifier: ReferenceModifier | undefined = undefined;
    while (parsing.isEnd() === false) {
        if (parsing.next(0).text === '[' && parsing.next(1).text === ']') {
            parsing.confirm(HighlightToken.Operator);
            parsing.confirm(HighlightToken.Operator);
            isArray = true;
            continue;
        } else if (parsing.next().text === '@') {
            parsing.confirm(HighlightToken.Builtin);
            if (parsing.next().text === 'const') {
                parsing.confirm(HighlightToken.Builtin);
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

function expectType(parsing: ParsingState): NodeType | undefined {
    const type = parseType(parsing);
    if (type === undefined) {
        parsing.error("Expected type ❌");
    }
    return type;
}

// '<' TYPE {',' TYPE} '>'
function parseTypeTemplates(parsing: ParsingState): NodeType[] | undefined {
    const cache = parsing.cache(ParseCacheKind.TypeTemplates);
    if (cache.restore !== undefined) return cache.restore();

    const rangeStart = parsing.next();
    if (parsing.next().text !== '<') return undefined;
    parsing.confirm(HighlightToken.Operator);

    const typeTemplates: NodeType[] = [];
    while (parsing.isEnd() === false) {
        const type = parseType(parsing);
        if (type === undefined) {
            parsing.backtrack(rangeStart);
            return undefined;
        }

        typeTemplates.push(type);

        const continuous = parseContinuousOrClose(parsing, ',', '>', typeTemplates.length > 0);
        if (continuous === BreakThrough.Break) break;
        else if (continuous === undefined) {
            parsing.backtrack(rangeStart);
            cache.store(undefined);
            return undefined;
        }
    }

    cache.store(typeTemplates);
    return typeTemplates;
}

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
function parseInitList(parsing: ParsingState): NodeInitList | undefined {
    if (parsing.next().text !== '{') return undefined;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightToken.Operator);

    const initList: (NodeAssign | NodeInitList)[] = [];
    while (parsing.isEnd() === false) {
        if (expectContinuousOrClose(parsing, ',', '}', initList.length > 0) === BreakThrough.Break) break;

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
        parsing.confirm(HighlightToken.Operator);
        isGlobal = true;
    }

    const scopeList: ParsingToken[] = [];
    let typeTemplates: NodeType[] | undefined = undefined;
    while (parsing.isEnd() === false) {
        const identifier = parsing.next(0);
        if (identifier.kind !== TokenKind.Identifier) {
            break;
        }

        if (parsing.next(1).text === '::') {
            parsing.confirm(HighlightToken.Namespace);
            parsing.confirm(HighlightToken.Operator);
            scopeList.push(identifier);
            continue;
        } else if (parsing.next(1).text === '<') {
            const typesStart = parsing.next();
            parsing.confirm(HighlightToken.Class);

            typeTemplates = parseTypeTemplates(parsing);
            if (typeTemplates === undefined || parsing.next().text !== '::') {
                parsing.backtrack(typesStart);
            } else {
                parsing.confirm(HighlightToken.Operator);
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
        typeTemplates: typeTemplates ?? []
    };
    cache.store(nodeScope);
    return nodeScope;
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
function parseDatatype(parsing: ParsingState): NodeDataType | undefined {
    const next = parsing.next();
    if (next.kind === TokenKind.Identifier) {
        parsing.confirm(HighlightToken.Type);
        return {
            nodeName: NodeName.DataType,
            nodeRange: {start: next, end: next},
            identifier: next
        };
    }

    if (next.text === '?' || next.text === 'auto') {
        parsing.confirm(HighlightToken.Builtin);
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
    parsing.confirm(HighlightToken.Builtin);
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
        parsing.confirm(HighlightToken.Builtin);
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

function expectStatement(parsing: ParsingState): NodeStatement | undefined {
    const statement = parseStatement(parsing);
    if (statement === ParseFailure.Pending) return undefined;
    if (statement === ParseFailure.Mismatch) {
        parsing.error("Expected statement ❌");
        return undefined;
    }
    return statement;
}

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
function parseSwitch(parsing: ParsingState): TriedParse<NodeSwitch> {
    if (parsing.next().text !== 'switch') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightToken.Keyword);

    parsing.expect('(', HighlightToken.Operator);

    const assign = expectAssign(parsing);
    if (assign === undefined) return ParseFailure.Pending;

    parsing.expect(')', HighlightToken.Operator);
    parsing.expect('{', HighlightToken.Operator);

    const cases: NodeCase[] = [];
    while (parsing.isEnd() === false) {
        if (parseCloseOperator(parsing, '}') === BreakThrough.Break) break;

        const parsedCase = parseCase(parsing);
        if (parsedCase === ParseFailure.Mismatch) {
            parsing.error("Expected case statement ❌");
            parsing.step();
            continue;
        }
        if (parsedCase === ParseFailure.Pending) continue;
        cases.push(parsedCase);
    }

    return {
        nodeName: NodeName.Switch,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        assign: assign,
        caseList: cases
    };
}

// BREAK         ::= 'break' ';'
function parseBreak(parsing: ParsingState): NodeBreak | undefined {
    if (parsing.next().text !== 'break') return undefined;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightToken.Keyword);

    parsing.expect(';', HighlightToken.Operator);
    return {nodeName: NodeName.Break, nodeRange: {start: rangeStart, end: parsing.prev()}};
}

// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
function parseFor(parsing: ParsingState): TriedParse<NodeFor> {
    if (parsing.next().text !== 'for') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightToken.Keyword);

    if (parsing.expect('(', HighlightToken.Operator) === false) return ParseFailure.Pending;

    const initial: NodeExprStat | NodeVar | undefined = parseVar(parsing) ?? parseExprStat(parsing);
    if (initial === undefined) {
        parsing.error("Expected initial expression statement or variable declaration ❌");
        return ParseFailure.Pending;
    }

    const result: NodeFor = {
        nodeName: NodeName.For,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        initial: initial,
        condition: undefined,
        incrementList: [],
        statement: undefined
    };

    result.condition = expectExprStat(parsing);
    if (result.condition === undefined) return appliedNodeEnd(parsing, result);

    while (parsing.isEnd() === false) {
        if (expectContinuousOrClose(parsing, ',', ')', result.incrementList.length > 0) === BreakThrough.Break) break;

        const assign = expectAssign(parsing);
        if (assign === undefined) break;

        result.incrementList.push(assign);
    }

    result.statement = expectStatement(parsing);
    return appliedNodeEnd(parsing, result);
}

// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
function parseWhile(parsing: ParsingState): TriedParse<NodeWhile> {
    if (parsing.next().text !== 'while') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightToken.Keyword);

    if (parsing.expect('(', HighlightToken.Operator) === false) return ParseFailure.Pending;

    const assign = expectAssign(parsing);
    if (assign === undefined) return ParseFailure.Pending;

    const result: NodeWhile = {
        nodeName: NodeName.While,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        assign: assign,
        statement: undefined
    };

    if (parsing.expect(')', HighlightToken.Operator) === false) return appliedNodeEnd(parsing, result);

    result.statement = expectStatement(parsing);
    return appliedNodeEnd(parsing, result);
}

// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
function parseDoWhile(parsing: ParsingState): TriedParse<NodeDoWhile> {
    if (parsing.next().text !== 'do') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightToken.Keyword);

    const statement = expectStatement(parsing);
    if (statement === undefined) return ParseFailure.Pending;

    const result: NodeDoWhile = {
        nodeName: NodeName.DoWhile,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        statement: statement,
        assign: undefined
    };

    if (parsing.expect('while', HighlightToken.Keyword) === false) return appliedNodeEnd(parsing, result);
    if (parsing.expect('(', HighlightToken.Operator) === false) return appliedNodeEnd(parsing, result);

    result.assign = expectAssign(parsing);
    if (result.assign === undefined) return appliedNodeEnd(parsing, result);

    if (parsing.expect(')', HighlightToken.Operator) === false) return appliedNodeEnd(parsing, result);

    parsing.expect(';', HighlightToken.Operator);
    return appliedNodeEnd(parsing, result);
}

// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
function parseIf(parsing: ParsingState): TriedParse<NodeIf> {
    if (parsing.next().text !== 'if') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightToken.Keyword);

    if (parsing.expect('(', HighlightToken.Operator) === false) return ParseFailure.Pending;

    const assign = expectAssign(parsing);
    if (assign === undefined) return ParseFailure.Pending;

    const result: NodeIf = {
        nodeName: NodeName.If,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        condition: assign,
        thenStat: undefined,
        elseStat: undefined
    };

    if (parsing.expect(')', HighlightToken.Operator) === false) return appliedNodeEnd(parsing, result);

    result.thenStat = expectStatement(parsing);
    if (result.thenStat === undefined) return appliedNodeEnd(parsing, result);

    if (parsing.next().text === 'else') {
        parsing.confirm(HighlightToken.Keyword);

        result.elseStat = expectStatement(parsing);
    }

    return appliedNodeEnd(parsing, result);
}

function appliedNodeEnd<T extends NodesBase>(parsing: ParsingState, node: T): T {
    node.nodeRange.end = parsing.prev();
    return node;
}

// CONTINUE      ::= 'continue' ';'
function parseContinue(parsing: ParsingState): NodeContinue | undefined {
    if (parsing.next().text !== 'continue') return undefined;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightToken.Keyword);
    parsing.expect(';', HighlightToken.Operator);
    return {nodeName: NodeName.Continue, nodeRange: {start: rangeStart, end: parsing.prev()}};
}

// EXPRSTAT      ::= [ASSIGN] ';'
function parseExprStat(parsing: ParsingState): NodeExprStat | undefined {
    const rangeStart = parsing.next();
    if (parsing.next().text === ';') {
        parsing.confirm(HighlightToken.Operator);
        return {
            nodeName: NodeName.ExprStat,
            nodeRange: {start: rangeStart, end: parsing.prev()},
            assign: undefined
        };
    }

    const assign = parseAssign(parsing);
    if (assign === undefined) return undefined;

    parsing.expect(';', HighlightToken.Operator);

    return {
        nodeName: NodeName.ExprStat,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        assign: assign
    };
}

function expectExprStat(parsing: ParsingState): NodeExprStat | undefined {
    const exprStat = parseExprStat(parsing);
    if (exprStat === undefined) {
        parsing.error("Expected expression statement ❌");
    }
    return exprStat;
}

// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK
function parseTry(parsing: ParsingState): TriedParse<NodeTry> {
    if (parsing.next().text !== 'try') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightToken.Keyword);

    const tryBlock = expectStatBlock(parsing);
    if (tryBlock === undefined) return ParseFailure.Pending;

    const result: NodeTry = {
        nodeName: NodeName.Try,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        tryBlock: tryBlock,
        catchBlock: undefined
    };

    if (parsing.expect('catch', HighlightToken.Keyword) === false) return appliedNodeEnd(parsing, result);

    result.catchBlock = expectStatBlock(parsing);
    return appliedNodeEnd(parsing, result);
}

// RETURN        ::= 'return' [ASSIGN] ';'
function parseReturn(parsing: ParsingState): TriedParse<NodeReturn> {
    if (parsing.next().text !== 'return') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightToken.Keyword);

    const result: NodeReturn = {
        nodeName: NodeName.Return,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        assign: undefined
    };

    if (parsing.next().text === ';') {
        parsing.confirm(HighlightToken.Operator);
        return appliedNodeEnd(parsing, result);
    }

    result.assign = expectAssign(parsing);
    if (result.assign === undefined) return appliedNodeEnd(parsing, result);

    parsing.expect(';', HighlightToken.Operator);
    return appliedNodeEnd(parsing, result);
}

// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
function parseCase(parsing: ParsingState): TriedParse<NodeCase> {
    const rangeStart = parsing.next();

    let expr = undefined;
    if (parsing.next().text === 'case') {
        parsing.confirm(HighlightToken.Keyword);

        expr = expectExpr(parsing);
        if (expr === undefined) return ParseFailure.Pending;
    } else if (parsing.next().text === 'default') {
        parsing.confirm(HighlightToken.Keyword);
    } else {
        return ParseFailure.Mismatch;
    }

    parsing.expect(':', HighlightToken.Operator);

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
        parsing.confirm(HighlightToken.Operator);
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
        parsing.confirm(HighlightToken.Operator);
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
    const cast = parseCast(parsing);
    if (cast === ParseFailure.Pending) return ParseFailure.Pending;
    if (cast !== ParseFailure.Mismatch) return cast;

    if (parsing.next().text === '(') {
        parsing.confirm(HighlightToken.Operator);

        const assign = expectAssign(parsing);
        if (assign === undefined) return ParseFailure.Pending;

        parsing.expect(')', HighlightToken.Operator);
        return assign;
    }

    const literal = parseLiteral(parsing);
    if (literal !== undefined) return literal;

    const lambda = parseLambda(parsing);
    if (lambda === ParseFailure.Pending) return ParseFailure.Pending;
    if (lambda !== ParseFailure.Mismatch) return lambda;

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
        parsing.confirm(HighlightToken.Operator);
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
    parsing.confirm(HighlightToken.Operator);

    const funcCall = parseFuncCall(parsing);
    if (funcCall !== undefined)
        return {
            nodeName: NodeName.ExprPostOp,
            nodeRange: {start: rangeStart, end: parsing.prev()},
            postOp: 1,
            member: funcCall,
        };

    const identifier = expectIdentifier(parsing, HighlightToken.Variable);
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
    parsing.confirm(HighlightToken.Operator);

    const indexerList: ParsedPostIndexer[] = [];
    while (parsing.isEnd() === false) {
        const identifier = parseIdentifierWithColon(parsing);

        const assign = expectAssign(parsing);
        if (assign !== undefined) indexerList.push({identifier: identifier, assign: assign});

        if (expectContinuousOrClose(parsing, ',', ']', indexerList.length > 0) === BreakThrough.Break) break;
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
        parsing.confirm(HighlightToken.Parameter);
        parsing.confirm(HighlightToken.Operator);
        return identifier;
    }
    return undefined;
}

// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
function parseCast(parsing: ParsingState): TriedParse<NodeCast> {
    if (parsing.next().text !== 'cast') return ParseFailure.Mismatch;
    const rangeStart = parsing.next();
    parsing.confirm(HighlightToken.Keyword);

    if (parsing.expect('<', HighlightToken.Operator) === false) return ParseFailure.Pending;

    const type = expectType(parsing);
    if (type === undefined) return ParseFailure.Pending;

    if (parsing.expect('>', HighlightToken.Operator) === false) return ParseFailure.Pending;
    if (parsing.expect('(', HighlightToken.Operator) === false) return ParseFailure.Pending;

    const assign = expectAssign(parsing);
    if (assign === undefined) return ParseFailure.Pending;

    parsing.expect(')', HighlightToken.Operator);

    return {
        nodeName: NodeName.Cast,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        type: type,
        assign: assign
    };
}

// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
const parseLambda = (parsing: ParsingState): TriedParse<NodeLambda> => {
    // ラムダ式の判定は、呼び出し末尾の「(」の後に「{」があるかどうかで判定する
    if (canParseLambda(parsing) === false) return ParseFailure.Mismatch;

    const rangeStart = parsing.next();
    parsing.confirm(HighlightToken.Builtin);

    parsing.expect('(', HighlightToken.Operator);

    const result: NodeLambda = {
        nodeName: NodeName.Lambda,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        paramList: [],
        statBlock: undefined
    };

    while (parsing.isEnd() === false) {
        if (expectCommaOrParensClose(parsing, result.paramList.length > 0) === BreakThrough.Break) break;

        if (parsing.next(0).kind === TokenKind.Identifier && isCommaOrParensClose(parsing.next(1).text)) {
            result.paramList.push({type: undefined, typeMod: undefined, identifier: parsing.next()});
            parsing.confirm(HighlightToken.Parameter);
            continue;
        }

        const type = parseType(parsing);
        const typeMod = type !== undefined ? parseTypeMod(parsing) : undefined;
        const identifier: ParsingToken | undefined = parseIdentifier(parsing, HighlightToken.Parameter);
        result.paramList.push({type: type, typeMod: typeMod, identifier: identifier});
    }

    result.statBlock = expectStatBlock(parsing);
    return appliedNodeEnd(parsing, result);
};

function canParseLambda(parsing: ParsingState): boolean {
    if (parsing.next().text !== 'function') return false;
    if (parsing.next(1).text !== '(') return false;
    let i = 2;
    while (parsing.isEnd() === false) {
        if (parsing.next(i).text === ')') {
            return parsing.next(i + 1).text === '{';
        }
        i++;
    }
    return false;
}

// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
function parseLiteral(parsing: ParsingState): NodeLiteral | undefined {
    const next = parsing.next();
    if (next.kind === TokenKind.Number) {
        parsing.confirm(HighlightToken.Number);
        return {nodeName: NodeName.Literal, nodeRange: {start: next, end: next}, value: next};
    }
    if (next.kind === TokenKind.String) {
        parsing.confirm(HighlightToken.String);
        return {nodeName: NodeName.Literal, nodeRange: {start: next, end: next}, value: next};
    }
    if (next.text === 'true' || next.text === 'false' || next.text === 'null') {
        parsing.confirm(HighlightToken.Builtin);
        return {nodeName: NodeName.Literal, nodeRange: {start: next, end: next}, value: next};
    }
    return undefined;
}

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
function parseFuncCall(parsing: ParsingState): NodeFuncCall | undefined {
    const rangeStart = parsing.next();
    const scope = parseScope(parsing);

    const identifier = parseIdentifier(parsing, HighlightToken.Function);
    if (identifier === undefined) {
        parsing.backtrack(rangeStart);
        return undefined;
    }

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
    const isBuiltin: boolean = scope === undefined && next.text === 'this';
    parsing.confirm(isBuiltin ? HighlightToken.Builtin : HighlightToken.Variable);

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
    parsing.confirm(HighlightToken.Operator);

    const argList: ParsedArgument[] = [];
    while (parsing.isEnd() === false) {
        if (expectCommaOrParensClose(parsing, argList.length > 0) === BreakThrough.Break) break;

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

    const operator = parseAssignOp(parsing);

    const result: NodeAssign = {
        nodeName: NodeName.Assign,
        nodeRange: {start: rangeStart, end: parsing.prev()},
        condition: condition,
        tail: undefined
    };

    if (operator === undefined) return result;

    const assign = parseAssign(parsing);
    if (assign === undefined) return result;

    result.tail = {operator: operator, assign: assign};
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
        parsing.confirm(HighlightToken.Operator);

        const trueAssign = expectAssign(parsing);
        if (trueAssign === undefined) return result;

        parsing.expect(':', HighlightToken.Operator);

        const falseAssign = expectAssign(parsing);
        if (falseAssign === undefined) return result;

        result.ternary = {trueAssign: trueAssign, falseAssign: falseAssign};
    }

    result.nodeRange.end = parsing.prev();
    return result;
}

// EXPROP        ::= MATHOP | COMPOP | LOGICOP | BITOP
function parseExprOp(parsing: ParsingState) {
    const next = getNextLinkedGreaterThan(parsing);
    if (next.kind !== TokenKind.Reserved) return undefined;
    if (next.property.isExprOp === false) return parseNotIsOperator(parsing);
    parsing.confirm(next.text === 'is' ? HighlightToken.Builtin : HighlightToken.Operator);
    return next;
}

const uniqueNotIsToken = createVirtualToken(TokenKind.Reserved, '!is');

// '!is' requires special handling. | '!is' は特殊処理
function parseNotIsOperator(parsing: ParsingState) {
    if (isTokensLinkedBy(parsing.next(), ['!', 'is']) === false) return undefined;

    const location = getLocationBetween(parsing.next(0), parsing.next(1));
    parsing.confirm(HighlightToken.Builtin);
    parsing.confirm(HighlightToken.Builtin);

    return {...uniqueNotIsToken, location: location} satisfies ParsingToken;
}

// BITOP         ::= '&' | '|' | '^' | '<<' | '>>' | '>>>'

// MATHOP        ::= '+' | '-' | '*' | '/' | '%' | '**'

// COMPOP        ::= '==' | '!=' | '<' | '<=' | '>' | '>=' | 'is' | '!is'

// LOGICOP       ::= '&&' | '||' | '^^' | 'and' | 'or' | 'xor'

// ASSIGNOP      ::= '=' | '+=' | '-=' | '*=' | '/=' | '|=' | '&=' | '^=' | '%=' | '**=' | '<<=' | '>>=' | '>>>='
function parseAssignOp(parsing: ParsingState) {
    const next = getNextLinkedGreaterThan(parsing);
    if (next.kind !== TokenKind.Reserved || next.property.isAssignOp === false) return undefined;
    parsing.confirm(HighlightToken.Operator);
    return next;
}

const uniqueGreaterThanTokenOrEqualToken = createVirtualToken(TokenKind.Reserved, '>=');
const uniqueBitShiftRightToken = createVirtualToken(TokenKind.Reserved, '>>');
const uniqueBitShiftRightAssignToken = createVirtualToken(TokenKind.Reserved, '>>=');
const uniqueBitShiftRightArithmeticToken = createVirtualToken(TokenKind.Reserved, '>>>');
const uniqueBitShiftRightArithmeticAssignToken = createVirtualToken(TokenKind.Reserved, '>>>=');

function getNextLinkedGreaterThan(parsing: ParsingState) {
    if (parsing.next().text !== '>') return parsing.next();

    const check = (targets: string[], uniqueToken: ParsingToken) => {
        if (isTokensLinkedBy(parsing.next(1), targets) === false) return undefined;
        const location = getLocationBetween(parsing.next(0), parsing.next(targets.length));
        for (let i = 0; i < targets.length; ++i) parsing.confirm(HighlightToken.Operator);
        return {...uniqueToken, location: location} satisfies ParsingToken;
    };

    // '>='
    const greaterThanTokenOrEqualToken = check(['='], uniqueGreaterThanTokenOrEqualToken);
    if (greaterThanTokenOrEqualToken !== undefined) return greaterThanTokenOrEqualToken;

    // '>>>='
    const bitShiftRightArithmeticAssignToken = check(['>', '>', '='], uniqueBitShiftRightArithmeticAssignToken);
    if (bitShiftRightArithmeticAssignToken !== undefined) return bitShiftRightArithmeticAssignToken;

    // '>>>'
    const bitShiftRightArithmeticToken = check(['>', '>'], uniqueBitShiftRightArithmeticToken);
    if (bitShiftRightArithmeticToken !== undefined) return bitShiftRightArithmeticToken;

    // '>>='
    const bitShiftRightAssignToken = check(['>', '='], uniqueBitShiftRightAssignToken);
    if (bitShiftRightAssignToken !== undefined) return bitShiftRightAssignToken;

    // '>>'
    const bitShiftRightToken = check(['>'], uniqueBitShiftRightToken);
    if (bitShiftRightToken !== undefined) return bitShiftRightToken;

    return parsing.next();
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

// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_script_bnf.html

import {
    AccessModifier,
    EntityAttribute,
    FuncHead,
    funcHeadConstructor,
    funcHeadDestructor,
    FunctionAttribute,
    isFuncHeadReturnValue,
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
    NodeExprVoid,
    NodeFor,
    NodeForEach,
    NodeForEachVar,
    NodeFunc,
    NodeFuncCall,
    NodeFuncDef,
    NodeIf,
    NodeImport,
    NodeInitList,
    NodeInterface,
    NodeIntfMethod,
    NodeLambda,
    NodeListOp,
    NodeListPattern,
    NodeListValidOperators,
    NodeLiteral,
    NodeMixin,
    NodeName,
    NodeNamespace,
    NodeParamList,
    NodeReturn,
    NodeBase,
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
    ParsedPostIndexing,
    ParsedVariableInitializer,
    ReferenceModifier,
    TypeModifier, NodeUsing, ClassBasePart
} from "./nodes";
import {HighlightForToken} from "../core/highlight";
import {TokenKind, TokenObject, TokenReserved} from "../compiler_tokenizer/tokenObject";
import {BreakOrThrough, ParseFailure, ParseResult, ParserState} from "./parserState";
import {ParserCacheKind} from "./parserCache";
import {areTokensJoinedBy} from "../compiler_tokenizer/tokenUtils";
import {Mutable} from "../utils/utilities";
import {TokenRange} from "../compiler_tokenizer/tokenRange";
import {getGlobalSettings} from '../core/settings';

// BNF: SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | USING | ';'}
function parseScript(parser: ParserState): NodeScript {
    const script: NodeScript = [];
    while (parser.isEnd() === false) {
        if (parser.next().text === ';') {
            parser.commit(HighlightForToken.Operator);
            continue;
        }

        const parsedImport = parseImport(parser);
        if (parsedImport === ParseFailure.Pending) continue;
        if (parsedImport !== ParseFailure.Mismatch) {
            script.push(parsedImport);
            continue;
        }

        const parsedTypeDef = parseTypeDef(parser);
        if (parsedTypeDef === ParseFailure.Pending) continue;
        if (parsedTypeDef !== ParseFailure.Mismatch) {
            script.push(parsedTypeDef);
            continue;
        }

        const parsedMixin = parseMixin(parser);
        if (parsedMixin === ParseFailure.Pending) continue;
        if (parsedMixin !== ParseFailure.Mismatch) {
            script.push(parsedMixin);
            continue;
        }

        const parsedNamespace = parseNamespace(parser);
        if (parsedNamespace === ParseFailure.Pending) continue;
        if (parsedNamespace !== ParseFailure.Mismatch) {
            script.push(parsedNamespace);
            continue;
        }

        const parsedUsing = parseUsing(parser);
        if (parsedUsing === ParseFailure.Pending) continue;
        if (parsedUsing !== ParseFailure.Mismatch) {
            script.push(parsedUsing);
            continue;
        }

        const parsedClass = parseClass(parser);
        if (parsedClass === ParseFailure.Pending) continue;
        if (parsedClass !== ParseFailure.Mismatch) {
            script.push(parsedClass);
            continue;
        }

        const parsedInterface = parseInterface(parser);
        if (parsedInterface === ParseFailure.Pending) continue;
        if (parsedInterface !== ParseFailure.Mismatch) {
            script.push(parsedInterface);
            continue;
        }

        const parsedEnum = parseEnum(parser);
        if (parsedEnum === ParseFailure.Pending) continue;
        if (parsedEnum !== ParseFailure.Mismatch) {
            script.push(parsedEnum);
            continue;
        }

        const parsedFuncDef = parseFuncDef(parser);
        if (parsedFuncDef === ParseFailure.Pending) continue;
        if (parsedFuncDef !== ParseFailure.Mismatch) {
            script.push(parsedFuncDef);
            continue;
        }

        const parsedFunc = parseFunc(parser);
        if (parsedFunc !== undefined) {
            script.push(parsedFunc);
            continue;
        }

        const parsedVirtualProp = parseVirtualProp(parser);
        if (parsedVirtualProp !== undefined) {
            script.push(parsedVirtualProp);
            continue;
        }

        parseMetadata(parser);
        const parsedVar = parseVar(parser);
        if (parsedVar !== undefined) {
            script.push(parsedVar);
            continue;
        }

        break;
    }

    return script;
}

// BNF: USING         ::= 'using' 'namespace' IDENTIFIER ('::' IDENTIFIER)* ';'
function parseUsing(parser: ParserState): ParseResult<NodeUsing> {
    if (parser.next().text !== 'using') {
        return ParseFailure.Mismatch;
    }

    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Builtin);

    parser.expect('namespace', HighlightForToken.Builtin);

    const namespaceList: TokenObject[] = [];
    while (parser.isEnd() === false) {
        const loopStart = parser.next();

        const identifier = expectIdentifier(parser, HighlightForToken.Namespace);
        if (identifier !== undefined) {
            namespaceList.push(identifier);
        }

        if (expectSeparatorOrClose(parser, '::', ';', true) === BreakOrThrough.Break) {
            break;
        }

        if (parser.next() === loopStart) {
            parser.step();
        }
    }

    if (namespaceList.length === 0) {
        return ParseFailure.Pending;
    }

    return {
        nodeName: NodeName.Using,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        namespaceList: namespaceList
    };
}

// BNF: NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
function parseNamespace(parser: ParserState): ParseResult<NodeNamespace> {
    if (parser.next().text !== 'namespace') return ParseFailure.Mismatch;
    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Builtin);

    const namespaceList: TokenObject[] = [];
    while (parser.isEnd() === false) {
        const loopStart = parser.next();

        const identifier = expectIdentifier(parser, HighlightForToken.Namespace);
        if (identifier !== undefined) namespaceList.push(identifier);

        if (expectSeparatorOrClose(parser, '::', '{', true) === BreakOrThrough.Break) break;

        if (parser.next() === loopStart) parser.step();
    }

    if (namespaceList.length === 0) {
        return ParseFailure.Pending;
    }

    const script = parseScript(parser);

    parser.expect('}', HighlightForToken.Operator);

    return {
        nodeName: NodeName.Namespace,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        namespaceList: namespaceList,
        script: script
    };
}

function parseIdentifier(parser: ParserState, kind: HighlightForToken): TokenObject | undefined {
    const identifier = parser.next();
    if (identifier.kind !== TokenKind.Identifier) return undefined;
    parser.commit(kind);
    return identifier;
}

function expectIdentifier(parser: ParserState, kind: HighlightForToken): TokenObject | undefined {
    const identifier = parseIdentifier(parser, kind);
    if (identifier === undefined) {
        parser.error("Expected identifier.");
    }
    return identifier;
}

function expectContextualKeyword(parser: ParserState, keyword: string): boolean {
    if (parser.next().text !== keyword) {
        parser.error(`Expected '${keyword}'.`);
        return false;
    }
    parser.commit(HighlightForToken.Keyword);
    return true;
}

// BNF: ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER [ ':' ('int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64') ] (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
function parseEnum(parser: ParserState): ParseResult<NodeEnum> {
    const rangeStart = parser.next();

    const entity = parseEntityAttribute(parser);

    if (parser.next().text !== 'enum') {
        parser.backtrack(rangeStart);
        return ParseFailure.Mismatch;
    }
    parser.commit(HighlightForToken.Builtin);

    const identifier = expectIdentifier(parser, HighlightForToken.Enum);
    if (identifier === undefined) return ParseFailure.Pending;

    let enumType: TokenReserved | undefined;
    if (getGlobalSettings().supportsTypedEnumerations && parser.next().text === ':') {
        parser.commit(HighlightForToken.Operator);
        const typeIdentifier = parsePrimeType(parser);

        if (typeIdentifier === undefined) {
            parser.backtrack(rangeStart);
            return ParseFailure.Mismatch;
        }

        enumType = typeIdentifier;
    }

    let memberList: ParsedEnumMember[] = [];
    const scopeStart = parser.next();

    if (parser.next().text === ';') {
        parser.commit(HighlightForToken.Operator);
    } else {
        memberList = expectEnumMembers(parser);
    }

    return {
        nodeName: NodeName.Enum,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        scopeRange: new TokenRange(scopeStart, parser.prev()),
        entity: entity,
        identifier: identifier,
        memberList: memberList,
        enumType: enumType
    };
}

// '{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} [','] '}'
function expectEnumMembers(parser: ParserState): ParsedEnumMember[] {
    const members: ParsedEnumMember[] = [];
    parser.expect('{', HighlightForToken.Operator);
    while (parser.isEnd() === false) {
        if (expectSeparatorOrClose(parser, ',', '}', members.length > 0) === BreakOrThrough.Break) break;

        if (parser.next().text === '}') {
            parser.commit(HighlightForToken.Operator);
            break;
        }

        const identifier = expectIdentifier(parser, HighlightForToken.EnumMember);
        if (identifier === undefined) break;

        let expr: NodeExpr | undefined = undefined;
        if (parser.next().text === '=') {
            parser.commit(HighlightForToken.Operator);
            expr = expectExpr(parser);
        }

        members.push({identifier: identifier, expr: expr});
    }

    return members;

}

// {'shared' | 'abstract' | 'final' | 'external'}
function parseEntityAttribute(parser: ParserState): EntityAttribute | undefined {
    const cache = parser.cache(ParserCacheKind.EntityAttribute);
    if (cache.restore !== undefined) return cache.restore();

    let attribute: EntityAttribute | undefined = undefined;
    while (parser.isEnd() === false) {
        const next = parser.next().text;

        const isEntityToken = next === 'shared' || next === 'external' || next === 'abstract' || next === 'final';
        if (isEntityToken === false) break;

        attribute = attribute ?? {
            isShared: false,
            isExternal: false,
            isAbstract: false,
            isFinal: false
        };

        setEntityAttribute(attribute, next);
        parser.commit(HighlightForToken.Builtin);
    }

    cache.store(attribute);
    return attribute;
}

function setEntityAttribute(attribute: Mutable<EntityAttribute>, token: 'shared' | 'external' | 'abstract' | 'final') {
    if (token === 'shared') attribute.isShared = true;
    else if (token === 'external') attribute.isExternal = true;
    else if (token === 'abstract') attribute.isAbstract = true;
    else if (token === 'final') attribute.isFinal = true;
}

// BNF: CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
function parseClass(parser: ParserState): ParseResult<NodeClass> {
    const rangeStart = parser.next();

    const metadata = parseMetadata(parser);

    const entity = parseEntityAttribute(parser);

    if (parser.next().text !== 'class') {
        parser.backtrack(rangeStart);
        return ParseFailure.Mismatch;
    }

    parser.commit(HighlightForToken.Builtin);

    const identifier = expectIdentifier(parser, HighlightForToken.Class);
    if (identifier === undefined) return ParseFailure.Pending;

    const typeTemplates = parseTypeTemplates(parser);

    const baseList: ClassBasePart[] = [];
    if (parser.next().text === ':') {
        parser.commit(HighlightForToken.Operator);
        while (parser.isEnd() === false) {
            const loopStart = parser.next();

            const scope = parseScope(parser);

            const identifier = expectIdentifier(parser, HighlightForToken.Type);

            baseList.push({scope, identifier});

            if (expectSeparatorOrClose(parser, ',', '{', true) === BreakOrThrough.Break) {
                break;
            }

            if (parser.next() === loopStart) {
                parser.step();
            }
        }
    } else {
        parser.expect('{', HighlightForToken.Operator);
    }

    const scopeStart = parser.next();
    const members = expectClassMembers(parser);
    const scopeEnd = parser.prev();

    return {
        nodeName: NodeName.Class,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        scopeRange: new TokenRange(scopeStart, scopeEnd),
        metadata: metadata,
        entity: entity,
        identifier: identifier,
        typeTemplates: typeTemplates,
        baseList: baseList,
        memberList: members
    };
}

// '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'
function expectClassMembers(parser: ParserState) {
    // parser.expect('{', HighlightTokenKind.Operator);
    const members: (NodeVirtualProp | NodeVar | NodeFunc | NodeFuncDef)[] = [];
    while (parser.isEnd() === false) {
        if (parseCloseOperator(parser, '}') === BreakOrThrough.Break) break;

        const parsedFuncDef = parseFuncDef(parser);
        if (parsedFuncDef === ParseFailure.Pending) continue;
        if (parsedFuncDef !== ParseFailure.Mismatch) {
            members.push(parsedFuncDef);
            continue;
        }

        const parsedFunc = parseFunc(parser);
        if (parsedFunc !== undefined) {
            members.push(parsedFunc);
            continue;
        }

        const parsedVirtualProp = parseVirtualProp(parser);
        if (parsedVirtualProp !== undefined) {
            members.push(parsedVirtualProp);
            continue;
        }

        const parsedVar = parseVar(parser);
        if (parsedVar !== undefined) {
            members.push(parsedVar);
            continue;
        }

        parser.error("Expected class member.");
        parser.step();
    }

    return members;
}

// TYPE IDENTIFIER
function parseForEachVar(parser: ParserState): NodeForEachVar | undefined {
    const rangeStart = parser.next();
    const type = expectType(parser);

    if (type === undefined)
        return undefined;

    const identifier = expectIdentifier(parser, HighlightForToken.Variable);

    if (identifier === undefined)
        return undefined;

    return {
        nodeName: NodeName.ForEachVar,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        type: type,
        identifier: identifier
    };
}

// BNF: TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'
function parseTypeDef(parser: ParserState): ParseResult<NodeTypeDef> {
    if (parser.next().text !== 'typedef') return ParseFailure.Mismatch;
    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Builtin);

    const primeType = parsePrimeType(parser);
    if (primeType === undefined) {
        parser.error("Expected primitive type.");
        return ParseFailure.Pending;
    }

    const identifier = parser.next();
    parser.commit(HighlightForToken.Type);

    parser.expect(';', HighlightForToken.Operator);

    return {
        nodeName: NodeName.TypeDef,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        type: primeType,
        identifier: identifier
    };
}

// BNF: LISTENTRY     ::= (('repeat' | 'repeat_same') (('{' LISTENTRY '}') | TYPE)) | (TYPE {',' TYPE})
function parseListEntry(parser: ParserState, operators: NodeListValidOperators[]): boolean {
    let listDepth = 0;

    while (!parser.isEnd()) {
        if (parser.next().text === '{') {
            parser.commit(HighlightForToken.Operator);

            operators.push({
                operator: NodeListOp.StartList
            });
            listDepth++;
        } else if (parser.next().text === '}') {

            if (!listDepth) {
                break;
            } else {
                parser.commit(HighlightForToken.Operator);
                listDepth--;

                operators.push({
                    operator: NodeListOp.EndList
                });
            }
        } else if (parser.next().text === 'repeat' || parser.next().text === 'repeat_same') {
            parser.commit(HighlightForToken.Keyword);

            operators.push({
                operator: parser.next().text === 'repeat' ? NodeListOp.Repeat : NodeListOp.RepeatSame
            });
        } else if (parser.next().text === ',') {
            parser.commit(HighlightForToken.Operator);
        } else {
            const type = parseType(parser);

            if (type === undefined) {
                return false;
            }

            operators.push({
                operator: NodeListOp.Type,
                type: type
            });
        }
    }

    return listDepth === 0;
}

// BNF: LISTPATTERN   ::= '{' LISTENTRY {',' LISTENTRY} '}'
function parseListPattern(parser: ParserState): NodeListPattern | undefined {
    if (parser.isPredefinedFile === false) return undefined;

    const rangeStart = parser.next();

    if (parser.next().text !== '{') {
        return undefined;
    }

    parser.commit(HighlightForToken.Operator);

    const listOperations: NodeListValidOperators[] = [];

    // parse list entries
    while (!parser.isEnd()) {
        if (parser.next().text === '}') {
            break;
        }

        const entry = parseListEntry(parser, listOperations);

        if (entry === false) {
            parser.backtrack(rangeStart);
            return undefined;
        }
    }

    if (parser.next().text !== '}' || listOperations.length === 0) {
        parser.backtrack(rangeStart);
        return undefined;
    }

    parser.commit(HighlightForToken.Operator);
}

// BNF: FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST [LISTPATTERN] ['const'] FUNCATTR (';' | STATBLOCK)
function parseFunc(parser: ParserState): NodeFunc | undefined {
    const rangeStart = parser.next();

    parseMetadata(parser);

    const entityAttribute = parseEntityAttribute(parser);

    const accessor = parseAccessModifier(parser);

    let head: FuncHead;
    if (parser.next().text === '~') {
        parser.commit(HighlightForToken.Operator);
        head = funcHeadDestructor;
    } else if (parser.next(0).kind === TokenKind.Identifier && parser.next(1).text === '(') {
        head = funcHeadConstructor;
    } else {
        const returnType = parseType(parser);
        if (returnType === undefined) {
            parser.backtrack(rangeStart);
            return undefined;
        }

        const isRef = parseRef(parser);

        head = {returnType: returnType, isRef: isRef};
    }
    const identifier = parser.next();
    parser.commit(isFuncHeadReturnValue(head) ? HighlightForToken.Function : HighlightForToken.Type);

    const typeTemplates = parseTypeTemplates(parser) ?? [];

    if (parser.isPredefinedFile === false) {
        // Function declaration is not allowed outside 'as.predefined'
        if (lookaheadTokenAfterParentheses(parser)?.text === ';') {
            // This node can be a variable calling a constructor, not a function declaration.
            parser.backtrack(rangeStart);
            return undefined;
        }
    }

    const paramList = parseParamList(parser);
    if (paramList === undefined) {
        parser.backtrack(rangeStart);
        return undefined;
    }

    const listPattern: NodeListPattern | undefined = parseListPattern(parser);

    let statBlock: NodeStatBlock | undefined = undefined;
    let funcAttr: FunctionAttribute | undefined = undefined;
    let isConst = false;

    if (listPattern === undefined) {
        isConst = parseConst(parser);

        funcAttr = parseFuncAttr(parser);

        if (parser.next().text === ';') {
            parser.commit(HighlightForToken.Operator);
        } else {
            statBlock = expectStatBlock(parser);
        }
    } else {
        if (parser.next().text !== ';') {
            parser.backtrack(rangeStart);
            return undefined;
        }

        parser.commit(HighlightForToken.Operator);
    }

    statBlock = statBlock ?? {
        nodeName: NodeName.StatBlock,
        nodeRange: new TokenRange(parser.next(), parser.next()),
        statementList: []
    };

    return {
        nodeName: NodeName.Func,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        entity: entityAttribute,
        accessor: accessor,
        head: head,
        identifier: identifier,
        paramList: paramList,
        isConst: isConst,
        funcAttr: funcAttr,
        statBlock: statBlock,
        typeTemplates: typeTemplates,
        listPattern: listPattern
    };
}

function parseConst(parser: ParserState): boolean {
    if (parser.next().text !== 'const') return false;
    parser.commit(HighlightForToken.Keyword);
    return true;
}

function parseRef(parser: ParserState) {
    const isRef = parser.next().text === '&';
    if (isRef) parser.commit(HighlightForToken.Builtin);
    return isRef;
}

function lookaheadTokenAfterParentheses(parser: ParserState) {
    let level = 0;
    let i = 0;
    while (parser.isEnd() === false) {
        const token = parser.next(i);
        if (token.text === '(') {
            level++;
        } else if (token.text === ')') {
            level--;
            if (level < 0) {
                return token;
            }
        } else if (level === 0) {
            return token;
        }

        i++;
    }

    return undefined;
}

// Metadata declarations in the same place and the only other rule is the matching count of '[' and ']'
// e.g., '[Hello[]]' is ok but '[Hello[]' is not.
function parseMetadata(parser: ParserState): TokenObject[][] {
    const rangeStart = parser.next();
    if (parser.next().text !== '[') return [];

    let level = 0;

    const metadata: TokenObject[][] = [[]];
    while (parser.isEnd() === false) {
        if (parser.next().text === '[') {
            if (level > 0) metadata.at(-1)!.push(parser.next());

            level++;
            parser.commit(HighlightForToken.Operator);
        } else if (parser.next().text === ']') {
            level--;
            parser.commit(HighlightForToken.Operator);

            if (level === 0) {
                // Since AngelScript supports multiple metadata declarations in subsequent pairs of '[' and ']', we recursively parse those declarations here.
                // e.g., '[Hello][World]' is valid, as is
                // [Hello]
                // [World]
                if (parser.next().text === '[') {
                    metadata.push([]);
                    continue;
                }

                return metadata;
            } else metadata.at(-1)!.push(parser.next());
        } else {
            metadata.at(-1)!.push(parser.next());
            parser.commit(HighlightForToken.Decorator);
        }
    }

    // when level !== 0
    parser.backtrack(rangeStart);
    return [];
}

// ['private' | 'protected']
function parseAccessModifier(parser: ParserState): AccessModifier | undefined {
    const next = parser.next().text;
    if (next === 'private' || next === 'protected') {
        parser.commit(HighlightForToken.Builtin);
        return next === 'private' ? AccessModifier.Private : AccessModifier.Protected;
    }
    return undefined;
}

// BNF: INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))
function parseInterface(parser: ParserState): ParseResult<NodeInterface> {
    const rangeStart = parser.next();

    const entity = parseEntityAttribute(parser);

    if (parser.next().text !== 'interface') {
        parser.backtrack(rangeStart);
        return ParseFailure.Mismatch;
    }
    parser.commit(HighlightForToken.Builtin);

    const identifier = expectIdentifier(parser, HighlightForToken.Interface);
    if (identifier === undefined) return ParseFailure.Pending;

    const result: Mutable<NodeInterface> = {
        nodeName: NodeName.Interface,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        entity: entity,
        identifier: identifier,
        baseList: [],
        memberList: []
    };

    if (parser.next().text === ';') {
        parser.commit(HighlightForToken.Operator);
        return result;
    }

    if (parser.next().text === ':') {
        parser.commit(HighlightForToken.Operator);
        while (parser.isEnd() === false) {
            const loopStart = parser.next();

            const scope = parseScope(parser);

            const identifier = expectIdentifier(parser, HighlightForToken.Type);

            result.baseList.push({scope, identifier});

            if (expectSeparatorOrClose(parser, ',', '{', true) === BreakOrThrough.Break) {
                break;
            }

            if (parser.next() === loopStart) {
                parser.step();
            }
        }
    } else {
        parser.expect('{', HighlightForToken.Operator);
    }

    result.memberList = expectInterfaceMembers(parser);

    return result;
}

// '{' {VIRTPROP | INTFMTHD} '}'
function expectInterfaceMembers(parser: ParserState): (NodeIntfMethod | NodeVirtualProp)[] {
    // parser.expect('{', HighlightTokenKind.Operator);

    const members: (NodeIntfMethod | NodeVirtualProp)[] = [];
    while (parser.isEnd() === false) {
        if (parseCloseOperator(parser, '}') === BreakOrThrough.Break) break;

        const intfMethod = parseIntfMethod(parser);
        if (intfMethod !== undefined) {
            members.push(intfMethod);
            continue;
        }

        const virtualProp = parseVirtualProp(parser);
        if (virtualProp !== undefined) {
            members.push(virtualProp);
            continue;
        }

        parser.error("Expected interface member.");
        parser.step();
    }

    return members;
}

// BNF: VAR           ::= ['private' | 'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
function parseVar(parser: ParserState): NodeVar | undefined {
    const rangeStart = parser.next();

    parseMetadata(parser);

    const accessor = parseAccessModifier(parser);

    const type = parseType(parser);
    if (type === undefined) {
        parser.backtrack(rangeStart);
        return undefined;
    }

    if (parser.next().kind !== TokenKind.Identifier) {
        parser.backtrack(rangeStart);
        return undefined;
    }

    const variables: ParsedVariableInitializer[] = [];
    while (parser.isEnd() === false) {
        const identifier = expectIdentifier(parser, HighlightForToken.Variable);
        if (identifier === undefined) break;

        if (parser.next().text === '=') {
            parser.commit(HighlightForToken.Operator);

            const initListOrExpr = expectInitListOrExpr(parser);
            variables.push({identifier: identifier, initializer: initListOrExpr});
        } else {
            const argList = parseArgList(parser);
            variables.push({identifier: identifier, initializer: argList});
        }

        if (expectSeparatorOrClose(parser, ',', ';', true) === BreakOrThrough.Break) break;
    }

    return {
        nodeName: NodeName.Var,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        accessor: accessor,
        type: type,
        variables: variables
    };
}

function expectInitListOrExpr(parser: ParserState) {
    const initList = parseInitList(parser);
    if (initList !== undefined) {
        return initList;
    }

    const expr = expectAssign(parser);
    if (expr !== undefined) {
        return expr;
    }

    parser.error("Expected initializer list or assignment.");
}

// BNF: IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
function parseImport(parser: ParserState): ParseResult<NodeImport> {
    const rangeStart = parser.next();

    if (parser.next().text !== 'import') return ParseFailure.Mismatch;
    parser.commit(HighlightForToken.Keyword);

    const type = expectType(parser);
    if (type === undefined) return ParseFailure.Pending;

    const isRef = parseRef(parser);

    const identifier = expectIdentifier(parser, HighlightForToken.Variable);
    if (identifier === undefined) return ParseFailure.Pending;

    const paramList = expectParamList(parser);
    if (paramList === undefined) return ParseFailure.Pending;

    const funcAttr = parseFuncAttr(parser);

    if (expectContextualKeyword(parser, 'from') === false) return ParseFailure.Pending;

    const path = parser.next();
    if (path.kind !== TokenKind.String) {
        parser.error("Expected string path.");
        return ParseFailure.Pending;
    }
    parser.commit(HighlightForToken.String);

    parser.expect(';', HighlightForToken.Operator);

    return {
        nodeName: NodeName.Import,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        type: type,
        isRef: isRef,
        identifier: identifier,
        paramList: paramList,
        funcAttr: funcAttr,
        path: path
    };
}

// BNF: FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
function parseFuncDef(parser: ParserState): ParseResult<NodeFuncDef> {
    const rangeStart = parser.next();

    const entity = parseEntityAttribute(parser);

    if (parser.next().text !== 'funcdef') {
        parser.backtrack(rangeStart);
        return ParseFailure.Mismatch;
    }

    parser.commit(HighlightForToken.Builtin);

    const returnType = expectType(parser);
    if (returnType === undefined) return ParseFailure.Pending;

    const isRef = parseRef(parser);

    const identifier = parser.next();
    parser.commit(HighlightForToken.Function);

    const paramList = expectParamList(parser);
    if (paramList === undefined) return ParseFailure.Pending;

    parser.expect(';', HighlightForToken.Operator);

    return {
        nodeName: NodeName.FuncDef,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        entity: entity,
        returnType: returnType,
        isRef: isRef,
        identifier: identifier,
        paramList: paramList
    };
}

// BNF: VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
function parseVirtualProp(parser: ParserState): NodeVirtualProp | undefined {
    const rangeStart = parser.next();

    parseMetadata(parser);

    const accessor = parseAccessModifier(parser);

    const type = parseType(parser);
    if (type === undefined) {
        parser.backtrack(rangeStart);
        return undefined;
    }

    const isRef = parseRef(parser);

    const identifier = parseIdentifier(parser, HighlightForToken.Variable);
    if (identifier === undefined) {
        parser.backtrack(rangeStart);
        return undefined;
    }

    if (parser.next().text !== '{') {
        parser.backtrack(rangeStart);
        return undefined;
    }
    parser.commit(HighlightForToken.Operator);

    let getter: ParsedGetterSetter | undefined = undefined;
    let setter: ParsedGetterSetter | undefined = undefined;
    while (parser.isEnd() === false) {
        const next = parser.next().text;

        if (parseCloseOperator(parser, '}') === BreakOrThrough.Break) break;
        else if (next === 'get') getter = expectGetterSetter(parser);
        else if (next === 'set') setter = expectGetterSetter(parser);
        else {
            parser.error("Expected getter or setter.");
            parser.step();
        }
    }

    return {
        nodeName: NodeName.VirtualProp,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        accessor: accessor,
        type: type,
        isRef: isRef,
        identifier: identifier,
        getter: getter,
        setter: setter
    };
}

// ('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')
function expectGetterSetter(parser: ParserState): ParsedGetterSetter {
    parser.commit(HighlightForToken.Builtin);

    const isConst = parseConst(parser);
    const funcAttr = parseFuncAttr(parser);
    const statBlock = expectStatBlock(parser);

    return {
        isConst: isConst,
        funcAttr: funcAttr,
        statBlock: statBlock
    };
}

// BNF: MIXIN         ::= 'mixin' CLASS
function parseMixin(parser: ParserState): ParseResult<NodeMixin> {
    if (parser.next().text !== 'mixin') return ParseFailure.Mismatch;
    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Builtin);

    const parsedClass = parseClass(parser);
    if (parsedClass === ParseFailure.Pending) return ParseFailure.Pending;
    if (parsedClass === ParseFailure.Mismatch) {
        parser.error("Expected class definition.");
        return ParseFailure.Pending;
    }

    return {
        nodeName: NodeName.Mixin,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        mixinClass: parsedClass
    };
}

// BNF: INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] FUNCATTR ';'
function parseIntfMethod(parser: ParserState): NodeIntfMethod | undefined {
    const rangeStart = parser.next();

    const returnType = expectType(parser);
    if (returnType === undefined) return undefined;

    const isRef = parseRef(parser);

    const identifier = parseIdentifier(parser, HighlightForToken.Function);
    if (identifier === undefined) return undefined;

    const paramList = parseParamList(parser);
    if (paramList === undefined) return undefined;

    const isConst = parseConst(parser);

    const funcAttr = parseFuncAttr(parser);

    parser.expect(';', HighlightForToken.Operator);

    return {
        nodeName: NodeName.IntfMethod,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        returnType: returnType,
        isRef: isRef,
        identifier: identifier,
        paramList: paramList,
        funcAttr: funcAttr,
        isConst: isConst
    };
}

// BNF: STATBLOCK     ::= '{' {VAR | STATEMENT | USING} '}'
function parseStatBlock(parser: ParserState): NodeStatBlock | undefined {
    if (parser.next().text !== '{') return undefined;
    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Operator);

    const statementList: (NodeVar | NodeStatement | NodeUsing)[] = [];
    while (parser.isEnd() === false) {
        if (parseCloseOperator(parser, '}') === BreakOrThrough.Break) break;

        const parsedVar = parseVar(parser);
        if (parsedVar !== undefined) {
            statementList.push(parsedVar);
            continue;
        }

        const using = parseUsing(parser);
        if (using === ParseFailure.Pending) continue;
        if (using !== ParseFailure.Mismatch) {
            statementList.push(using);
            continue;
        }

        const statement = parseStatement(parser);
        if (statement === ParseFailure.Pending) continue;
        if (statement !== ParseFailure.Mismatch) {
            statementList.push(statement);
            continue;
        }

        parser.error("Expected statement.");
        parser.step();
    }

    return {
        nodeName: NodeName.StatBlock,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        statementList: statementList
    };
}

function expectStatBlock(parser: ParserState): NodeStatBlock | undefined {
    const statBlock = parseStatBlock(parser);
    if (statBlock === undefined) {
        parser.error("Expected statement block.");
    }
    return statBlock;
}

// BNF: PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' [EXPR | 'void']] {',' TYPE TYPEMOD [IDENTIFIER] ['...' | ('=' [EXPR | 'void'])]})] ')'
function parseParamList(parser: ParserState): NodeParamList | undefined {
    if (parser.next().text !== '(') return undefined;
    parser.commit(HighlightForToken.Operator);

    if (parser.next().text === 'void') {
        parser.commit(HighlightForToken.Builtin);
        parser.expect(')', HighlightForToken.Operator);
        return [];
    }

    const paramList: NodeParamList = [];
    let isVariadic = false;

    while (parser.isEnd() === false) {
        if (expectCommaOrParensClose(parser, paramList.length > 0) === BreakOrThrough.Break) break;

        if (isVariadic) {
            parser.error('Variadic ellipses must be the last parameter.');
        }

        // if it's not a type, it's probably a variable
        // calling a constructor.
        const type = parseType(parser);
        if (type === undefined) {
            // if it's not a valid identifier, it's not
            // ever going to be a valid constructor.
            if (parser.next().kind === TokenKind.String || parser.next().kind === TokenKind.Number) {
                return undefined;
            }

            parser.step();
            continue;
        }

        const typeMod = parseTypeMod(parser);

        let identifier: TokenObject | undefined = undefined;
        if (parser.next().text === '...') {
            parser.commit(HighlightForToken.Operator);
            isVariadic = true;
        } else if (parser.next().kind === TokenKind.Identifier) {
            identifier = parser.next();
            parser.commit(HighlightForToken.Variable);
        }

        let defaultExpr: NodeExpr | NodeExprVoid | undefined = undefined;
        if (parser.next().text === '=') {
            if (isVariadic) {
                parser.error('Variadic functions cannot have a default expression.');
            }

            parser.commit(HighlightForToken.Operator);
            defaultExpr = expectExprOrVoid(parser);
        }

        paramList.push({
            type: type,
            modifier: typeMod,
            identifier: identifier,
            defaultExpr: defaultExpr,
            isVariadic: isVariadic
        });
    }

    return paramList;
}

function expectParamList(parser: ParserState): NodeParamList | undefined {
    const paramList = parseParamList(parser);
    if (paramList === undefined) {
        parser.error("Expected parameter list.");
    }
    return paramList;
}

function expectCommaOrParensClose(parser: ParserState, canColon: boolean): BreakOrThrough {
    return expectSeparatorOrClose(parser, ',', ')', canColon);
}

function isCommaOrParensClose(character: string): boolean {
    return character === ',' || character === ')';
}

function parseSeparatorOrClose(
    parser: ParserState, separatorOp: string, closeOp: string, canSeparator: boolean, allowTrailing: boolean = false
): BreakOrThrough | undefined {
    const next = parser.next().text;
    if (next === closeOp) {
        parser.commit(HighlightForToken.Operator);
        return BreakOrThrough.Break;
    } else if (canSeparator) {
        if (next !== separatorOp) return undefined;
        parser.commit(HighlightForToken.Operator);

        if (allowTrailing) {
            if (parser.next().text == closeOp) {
                parser.commit(HighlightForToken.Operator);
                return BreakOrThrough.Break;
            }
        }
    }

    return BreakOrThrough.Through;
}

function expectSeparatorOrClose(
    parser: ParserState, separatorOp: string, closeOp: string, canSeparator: boolean, allowTrailing: boolean = false
): BreakOrThrough {
    const parsed = parseSeparatorOrClose(parser, separatorOp, closeOp, canSeparator, allowTrailing);
    if (parsed !== undefined) return parsed;

    parser.error(`Expected '${separatorOp}' or '${closeOp}'.`);
    return BreakOrThrough.Break;
}

function parseCloseOperator(parser: ParserState, closeOp: string): BreakOrThrough {
    const next = parser.next().text;
    if (next === closeOp) {
        parser.commit(HighlightForToken.Operator);
        return BreakOrThrough.Break;
    }
    return BreakOrThrough.Through;
}

// BNF: TYPEMOD       ::= ['&' ['in' | 'out' | 'inout'] ['+'] ['if_handle_then_const']]
function parseTypeMod(parser: ParserState): TypeModifier | undefined {
    let mod: TypeModifier | undefined = undefined;

    if (parser.next().text === '&') {
        parser.commit(HighlightForToken.Builtin);

        const next = parser.next().text;
        if (next === 'in' || next === 'out' || next === 'inout') {
            parser.commit(HighlightForToken.Builtin);
            if (next === 'in') mod = TypeModifier.In;
            else if (next === 'out') mod = TypeModifier.Out;
            else mod = TypeModifier.InOut;
        }
    }

    // TODO: this should only be allowed on non-nocount handles
    if (parser.next().text === '+') {
        parser.commit(HighlightForToken.Builtin);
    }

    // TODO: this should only be allowed on handles of
    // template parameter types
    if (parser.next().text === 'if_handle_then_const') {
        parser.commit(HighlightForToken.Builtin);
    }

    return mod;
}

// BNF: TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
function parseType(parser: ParserState): NodeType | undefined {
    const rangeStart = parser.next();

    const isConst = parseConst(parser);

    const scope = parseScope(parser);

    const datatype = parseDatatype(parser);
    if (datatype === undefined) {
        parser.backtrack(rangeStart);
        return undefined;
    }

    const typeTemplates = parseTypeTemplates(parser) ?? [];

    const {isArray, refModifier} = parseTypeTail(parser);

    return {
        nodeName: NodeName.Type,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        isConst: isConst,
        scope: scope,
        dataType: datatype,
        typeTemplates: typeTemplates,
        isArray: isArray,
        refModifier: refModifier
    };
}

function parseTypeTail(parser: ParserState) {
    let isArray = false;
    let refModifier: ReferenceModifier | undefined = undefined;
    while (parser.isEnd() === false) {
        if (parser.next(0).text === '[' && parser.next(1).text === ']') {
            parser.commit(HighlightForToken.Operator);
            parser.commit(HighlightForToken.Operator);
            isArray = true;
            continue;
        } else if (parser.next().text === '@') {
            parser.commit(HighlightForToken.Builtin);

            // auto-handle
            if (parser.next().text === '+') {
                parser.commit(HighlightForToken.Builtin);
            }

            if (parser.next().text === 'const') {
                parser.commit(HighlightForToken.Builtin);
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

function expectType(parser: ParserState): NodeType | undefined {
    const type = parseType(parser);
    if (type === undefined) {
        parser.error("Expected type.");
    }

    return type;
}

// '<' TYPE {',' TYPE} '>'
function parseTypeTemplates(parser: ParserState): NodeType[] | undefined {
    const cache = parser.cache(ParserCacheKind.TypeTemplates);
    if (cache.restore !== undefined) return cache.restore();

    const rangeStart = parser.next();
    if (parser.next().text !== '<') return undefined;
    parser.commit(HighlightForToken.Operator);

    const typeTemplates: NodeType[] = [];
    while (parser.isEnd() === false) {
        const type = parseType(parser);
        if (type === undefined) {
            parser.backtrack(rangeStart);
            return undefined;
        }

        typeTemplates.push(type);

        const breakOrThrough = parseSeparatorOrClose(parser, ',', '>', typeTemplates.length > 0);
        if (breakOrThrough === BreakOrThrough.Break) {
            break;
        } else if (breakOrThrough === undefined) {
            parser.backtrack(rangeStart);
            cache.store(undefined);
            return undefined;
        }
    }

    cache.store(typeTemplates);
    return typeTemplates;
}

// BNF: INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
function parseInitList(parser: ParserState): NodeInitList | undefined {
    if (parser.next().text !== '{') return undefined;
    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Operator);

    const initList: (NodeAssign | NodeInitList)[] = [];
    while (parser.isEnd() === false) {
        if (expectSeparatorOrClose(parser, ',', '}', initList.length > 0, true) === BreakOrThrough.Break) break;

        const assign = parseAssign(parser);
        if (assign !== undefined) {
            initList.push(assign);
            continue;
        }

        const parsedInits = parseInitList(parser);
        if (parsedInits !== undefined) {
            initList.push(parsedInits);
            continue;
        }

        parser.error("Expected assignment or initializer list.");
        parser.step();
    }
    return {
        nodeName: NodeName.InitList,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        initList: initList
    };
}

// BNF: SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
function parseScope(parser: ParserState): NodeScope | undefined {
    const cache = parser.cache(ParserCacheKind.Scope);
    if (cache.restore !== undefined) return cache.restore();

    const rangeStart = parser.next();

    let isGlobal = false;
    if (parser.next().text === '::') {
        parser.commit(HighlightForToken.Operator);
        isGlobal = true;
    }

    const scopeList: TokenObject[] = [];
    let typeTemplates: NodeType[] | undefined = undefined;
    while (parser.isEnd() === false) {
        const identifier = parser.next(0);
        if (identifier.kind !== TokenKind.Identifier) {
            break;
        }

        if (parser.next(1).text === '::') {
            parser.commit(HighlightForToken.Namespace);
            parser.commit(HighlightForToken.Operator);
            scopeList.push(identifier);
            continue;
        } else if (parser.next(1).text === '<') {
            const typesStart = parser.next();
            parser.commit(HighlightForToken.Class);

            typeTemplates = parseTypeTemplates(parser);
            if (typeTemplates === undefined || parser.next().text !== '::') {
                parser.backtrack(typesStart);
            } else {
                parser.commit(HighlightForToken.Operator);
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
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        isGlobal: isGlobal,
        scopeList: scopeList,
        typeTemplates: typeTemplates ?? []
    };
    cache.store(nodeScope);
    return nodeScope;
}

// BNF: DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
function parseDatatype(parser: ParserState): NodeDataType | undefined {
    const next = parser.next();
    if (next.kind === TokenKind.Identifier) {
        parser.commit(HighlightForToken.Type);
        return {
            nodeName: NodeName.DataType,
            nodeRange: new TokenRange(next, next),
            identifier: next
        };
    }

    if (next.text === '?' || next.text === 'auto') {
        parser.commit(HighlightForToken.Builtin);
        return {
            nodeName: NodeName.DataType,
            nodeRange: new TokenRange(next, next),
            identifier: next
        };
    }

    const primType = parsePrimeType(parser);
    if (primType !== undefined) return {
        nodeName: NodeName.DataType,
        nodeRange: new TokenRange(next, next),
        identifier: primType
    };

    return undefined;
}

// BNF: PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
function parsePrimeType(parser: ParserState) {
    const next = parser.next();
    if (next.isReservedToken() === false || next.property.isPrimeType === false) return undefined;
    parser.commit(HighlightForToken.Builtin);
    return next;
}

// BNF: FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property' | 'delete' | 'nodiscard'}
function parseFuncAttr(parser: ParserState): FunctionAttribute | undefined {
    let attribute: FunctionAttribute | undefined = undefined;
    while (parser.isEnd() === false) {
        const next = parser.next().text;

        const isFuncAttrToken = next === 'override' || next === 'final' || next === 'explicit' || next === 'property' ||
            next === 'delete' || next === 'nodiscard';
        if (isFuncAttrToken === false) break;

        attribute = attribute ?? {
            isOverride: false,
            isFinal: false,
            isExplicit: false,
            isProperty: false,
            isDeleted: false,
            isNoDiscard: false
        };

        setFunctionAttribute(attribute, next);
        parser.commit(HighlightForToken.Builtin);
    }
    return attribute;
}

function setFunctionAttribute(attribute: Mutable<FunctionAttribute>, token: 'override' | 'final' | 'explicit' | 'property' | 'delete' | 'nodiscard') {
    if (token === 'override') attribute.isOverride = true;
    else if (token === 'final') attribute.isFinal = true;
    else if (token === 'explicit') attribute.isExplicit = true;
    else if (token === 'property') attribute.isProperty = true;
    // TODO: implement in analyzer
    else if (token === 'delete') attribute.isDeleted = true;
    // TODO: implement in analyzer
    else if (token === 'nodiscard') attribute.isNoDiscard = true;
}

// BNF: STATEMENT     ::= (IF | FOR | FOREACH | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
function parseStatement(parser: ParserState): ParseResult<NodeStatement> {
    const parsedIf = parseIf(parser);
    if (parsedIf === ParseFailure.Pending) return ParseFailure.Pending;
    if (parsedIf !== ParseFailure.Mismatch) return parsedIf;

    const parsedFor = parseFor(parser);
    if (parsedFor === ParseFailure.Pending) return ParseFailure.Pending;
    if (parsedFor !== ParseFailure.Mismatch) return parsedFor;

    if (getGlobalSettings().supportsForEach) {
        const parsedForEach = parseForEach(parser);
        if (parsedForEach === ParseFailure.Pending) return ParseFailure.Pending;
        if (parsedForEach !== ParseFailure.Mismatch) return parsedForEach;
    }

    const parsedWhile = parseWhile(parser);
    if (parsedWhile === ParseFailure.Pending) return ParseFailure.Pending;
    if (parsedWhile !== ParseFailure.Mismatch) return parsedWhile;

    const parsedReturn = parseReturn(parser);
    if (parsedReturn === ParseFailure.Pending) return ParseFailure.Pending;
    if (parsedReturn !== ParseFailure.Mismatch) return parsedReturn;

    const statBlock = parseStatBlock(parser);
    if (statBlock !== undefined) return statBlock;

    const parsedBreak = parseBreak(parser);
    if (parsedBreak !== undefined) return parsedBreak;

    const parsedContinue = parseContinue(parser);
    if (parsedContinue !== undefined) return parsedContinue;

    const doWhile = parseDoWhile(parser);
    if (doWhile === ParseFailure.Pending) return ParseFailure.Pending;
    if (doWhile !== ParseFailure.Mismatch) return doWhile;

    const parsedSwitch = parseSwitch(parser);
    if (parsedSwitch === ParseFailure.Pending) return ParseFailure.Pending;
    if (parsedSwitch !== ParseFailure.Mismatch) return parsedSwitch;

    const parsedTry = parseTry(parser);
    if (parsedTry === ParseFailure.Pending) return ParseFailure.Pending;
    if (parsedTry !== ParseFailure.Mismatch) return parsedTry;

    const exprStat = parseExprStat(parser);
    if (exprStat !== undefined) return exprStat;

    return ParseFailure.Mismatch;
}

function expectStatement(parser: ParserState): NodeStatement | undefined {
    const statement = parseStatement(parser);
    if (statement === ParseFailure.Pending) return undefined;
    if (statement === ParseFailure.Mismatch) {
        parser.error("Expected statement.");
        return undefined;
    }
    return statement;
}

// BNF: SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
function parseSwitch(parser: ParserState): ParseResult<NodeSwitch> {
    if (parser.next().text !== 'switch') return ParseFailure.Mismatch;
    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Keyword);

    parser.expect('(', HighlightForToken.Operator);

    const assign = expectAssign(parser);
    if (assign === undefined) return ParseFailure.Pending;

    parser.expect(')', HighlightForToken.Operator);
    parser.expect('{', HighlightForToken.Operator);

    const cases: NodeCase[] = [];
    while (parser.isEnd() === false) {
        if (parseCloseOperator(parser, '}') === BreakOrThrough.Break) break;

        const parsedCase = parseCase(parser);
        if (parsedCase === ParseFailure.Mismatch) {
            parser.error("Expected case statement.");
            parser.step();
            continue;
        }

        if (parsedCase === ParseFailure.Pending) continue;

        cases.push(parsedCase);
    }

    return {
        nodeName: NodeName.Switch,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        assign: assign,
        caseList: cases
    };
}

// BNF: BREAK         ::= 'break' ';'
function parseBreak(parser: ParserState): NodeBreak | undefined {
    if (parser.next().text !== 'break') return undefined;
    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Keyword);

    parser.expect(';', HighlightForToken.Operator);
    return {nodeName: NodeName.Break, nodeRange: new TokenRange(rangeStart, parser.prev())};
}

// BNF: FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
function parseFor(parser: ParserState): ParseResult<NodeFor> {
    if (parser.next().text !== 'for') return ParseFailure.Mismatch;
    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Keyword);

    if (parser.expect('(', HighlightForToken.Operator) === false) return ParseFailure.Pending;

    const initial: NodeExprStat | NodeVar | undefined = parseVar(parser) ?? parseExprStat(parser);
    if (initial === undefined) {
        parser.error("Expected initial expression statement or variable declaration.");
        return ParseFailure.Pending;
    }

    const result: Mutable<NodeFor> = {
        nodeName: NodeName.For,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        initial: initial,
        condition: undefined,
        incrementList: [],
        statement: undefined
    };

    result.condition = expectExprStat(parser);
    if (result.condition === undefined) return appliedNodeEnd(parser, result);

    while (parser.isEnd() === false) {
        if (expectSeparatorOrClose(parser, ',', ')', result.incrementList.length > 0) === BreakOrThrough.Break) break;

        const assign = expectAssign(parser);
        if (assign === undefined) break;

        result.incrementList.push(assign);
    }

    result.statement = expectStatement(parser);
    return appliedNodeEnd(parser, result);
}

// BNF: FOREACH       ::= 'foreach' '(' TYPE IDENTIFIER {',' TYPE INDENTIFIER} ':' ASSIGN ')' STATEMENT
function parseForEach(parser: ParserState): ParseResult<NodeForEach> {
    if (parser.next().text !== 'foreach') return ParseFailure.Mismatch;
    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Keyword);

    if (parser.expect('(', HighlightForToken.Operator) === false) return ParseFailure.Pending;

    const result: Mutable<NodeForEach> = {
        nodeName: NodeName.ForEach,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        variables: [],
        statement: undefined,
        assign: undefined
    };

    while (parser.isEnd() === false) {
        if (expectSeparatorOrClose(parser, ',', ':', result.variables.length > 0) === BreakOrThrough.Break) break;

        const variable = parseForEachVar(parser);

        if (variable === undefined) {
            parser.error("Invalid variable declaration.");
            return ParseFailure.Pending;
        }

        result.variables.push(variable);
    }

    result.assign = expectAssign(parser);

    if (parser.expect(')', HighlightForToken.Operator) === false) return appliedNodeEnd(parser, result);

    result.statement = expectStatement(parser);

    return appliedNodeEnd(parser, result);
}

// BNF: WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
function parseWhile(parser: ParserState): ParseResult<NodeWhile> {
    if (parser.next().text !== 'while') return ParseFailure.Mismatch;
    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Keyword);

    if (parser.expect('(', HighlightForToken.Operator) === false) return ParseFailure.Pending;

    const assign = expectAssign(parser);
    if (assign === undefined) return ParseFailure.Pending;

    const result: Mutable<NodeWhile> = {
        nodeName: NodeName.While,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        assign: assign,
        statement: undefined
    };

    if (parser.expect(')', HighlightForToken.Operator) === false) return appliedNodeEnd(parser, result);

    result.statement = expectStatement(parser);
    return appliedNodeEnd(parser, result);
}

// BNF: DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
function parseDoWhile(parser: ParserState): ParseResult<NodeDoWhile> {
    if (parser.next().text !== 'do') return ParseFailure.Mismatch;
    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Keyword);

    const statement = expectStatement(parser);
    if (statement === undefined) return ParseFailure.Pending;

    const result: Mutable<NodeDoWhile> = {
        nodeName: NodeName.DoWhile,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        statement: statement,
        assign: undefined
    };

    if (parser.expect('while', HighlightForToken.Keyword) === false) return appliedNodeEnd(parser, result);
    if (parser.expect('(', HighlightForToken.Operator) === false) return appliedNodeEnd(parser, result);

    result.assign = expectAssign(parser);
    if (result.assign === undefined) return appliedNodeEnd(parser, result);

    if (parser.expect(')', HighlightForToken.Operator) === false) return appliedNodeEnd(parser, result);

    parser.expect(';', HighlightForToken.Operator);
    return appliedNodeEnd(parser, result);
}

// BNF: IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
function parseIf(parser: ParserState): ParseResult<NodeIf> {
    if (parser.next().text !== 'if') return ParseFailure.Mismatch;
    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Keyword);

    if (parser.expect('(', HighlightForToken.Operator) === false) return ParseFailure.Pending;

    const assign = expectAssign(parser);
    if (assign === undefined) return ParseFailure.Pending;

    const result: Mutable<NodeIf> = {
        nodeName: NodeName.If,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        condition: assign,
        thenStat: undefined,
        elseStat: undefined
    };

    if (parser.expect(')', HighlightForToken.Operator) === false) return appliedNodeEnd(parser, result);

    result.thenStat = expectStatement(parser);
    if (result.thenStat === undefined) return appliedNodeEnd(parser, result);

    if (parser.next().text === 'else') {
        parser.commit(HighlightForToken.Keyword);

        result.elseStat = expectStatement(parser);
    }

    return appliedNodeEnd(parser, result);
}

function appliedNodeEnd<T extends NodeBase>(parser: ParserState, node: Mutable<T>): T {
    node.nodeRange = new TokenRange(node.nodeRange.start, parser.prev());
    return node;
}

// BNF: CONTINUE      ::= 'continue' ';'
function parseContinue(parser: ParserState): NodeContinue | undefined {
    if (parser.next().text !== 'continue') return undefined;
    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Keyword);
    parser.expect(';', HighlightForToken.Operator);
    return {nodeName: NodeName.Continue, nodeRange: new TokenRange(rangeStart, parser.prev())};
}

// BNF: EXPRSTAT      ::= [ASSIGN] ';'
function parseExprStat(parser: ParserState): NodeExprStat | undefined {
    const rangeStart = parser.next();
    if (parser.next().text === ';') {
        parser.commit(HighlightForToken.Operator);
        return {
            nodeName: NodeName.ExprStat,
            nodeRange: new TokenRange(rangeStart, parser.prev()),
            assign: undefined
        };
    }

    const assign = parseAssign(parser);
    if (assign === undefined) return undefined;

    parser.expect(';', HighlightForToken.Operator);

    return {
        nodeName: NodeName.ExprStat,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        assign: assign
    };
}

function expectExprStat(parser: ParserState): NodeExprStat | undefined {
    const exprStat = parseExprStat(parser);
    if (exprStat === undefined) {
        parser.error("Expected expression statement.");
    }
    return exprStat;
}

// BNF: TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK
function parseTry(parser: ParserState): ParseResult<NodeTry> {
    if (parser.next().text !== 'try') return ParseFailure.Mismatch;
    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Keyword);

    const tryBlock = expectStatBlock(parser);
    if (tryBlock === undefined) return ParseFailure.Pending;

    const result: Mutable<NodeTry> = {
        nodeName: NodeName.Try,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        tryBlock: tryBlock,
        catchBlock: undefined
    };

    if (parser.expect('catch', HighlightForToken.Keyword) === false) return appliedNodeEnd(parser, result);

    result.catchBlock = expectStatBlock(parser);
    return appliedNodeEnd(parser, result);
}

// BNF: RETURN        ::= 'return' [ASSIGN] ';'
function parseReturn(parser: ParserState): ParseResult<NodeReturn> {
    if (parser.next().text !== 'return') return ParseFailure.Mismatch;
    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Keyword);

    const result: Mutable<NodeReturn> = {
        nodeName: NodeName.Return,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        assign: undefined
    };

    if (parser.next().text === ';') {
        parser.commit(HighlightForToken.Operator);
        return appliedNodeEnd(parser, result);
    }

    result.assign = expectAssign(parser);
    if (result.assign === undefined) return appliedNodeEnd(parser, result);

    parser.expect(';', HighlightForToken.Operator);
    return appliedNodeEnd(parser, result);
}

// BNF: CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
function parseCase(parser: ParserState): ParseResult<NodeCase> {
    const rangeStart = parser.next();

    let expr = undefined;
    if (parser.next().text === 'case') {
        parser.commit(HighlightForToken.Keyword);

        expr = expectExpr(parser);
        if (expr === undefined) return ParseFailure.Pending;
    } else if (parser.next().text === 'default') {
        parser.commit(HighlightForToken.Keyword);
    } else {
        return ParseFailure.Mismatch;
    }

    parser.expect(':', HighlightForToken.Operator);

    const statements: NodeStatement[] = [];
    while (parser.isEnd() === false) {
        const statement = parseStatement(parser);
        if (statement === ParseFailure.Mismatch) break;
        if (statement === ParseFailure.Pending) continue;

        statements.push(statement);
    }

    return {
        nodeName: NodeName.Case,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        expr: expr,
        statementList: statements
    };
}

// BNF: EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
function parseExpr(parser: ParserState): NodeExpr | undefined {
    const rangeStart = parser.next();

    const exprTerm = parseExprTerm(parser);
    if (exprTerm === undefined) return undefined;

    const exprOp = parseExprOp(parser);
    if (exprOp === undefined) return {
        nodeName: NodeName.Expr,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        head: exprTerm,
        tail: undefined
    };

    const tail = expectExpr(parser);
    if (tail === undefined) return {
        nodeName: NodeName.Expr,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        head: exprTerm,
        tail: undefined
    };

    return {
        nodeName: NodeName.Expr,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        head: exprTerm,
        tail: {
            operator: exprOp,
            expression: tail
        }
    };
}

function expectExpr(parser: ParserState): NodeExpr | undefined {
    const expr = parseExpr(parser);
    if (expr === undefined) {
        parser.error("Expected expression.");
    }
    return expr;
}

// for optional parameters
function expectExprOrVoid(parser: ParserState): NodeExpr | NodeExprVoid | undefined {
    if (parser.next().text === 'void') {
        const rangeStart = parser.next();
        parser.commit(HighlightForToken.Keyword);
        return {
            nodeName: NodeName.ExprVoid,
            nodeRange: new TokenRange(rangeStart, parser.prev())
        };
    }

    const expr = parseExpr(parser);
    if (expr === undefined) {
        parser.error("Expected expression.");
    }
    return expr;
}

// BNF: EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function parseExprTerm(parser: ParserState) {
    const exprTerm1 = parseExprTerm1(parser);
    if (exprTerm1 !== undefined) return exprTerm1;

    const exprTerm2 = parseExprTerm2(parser);
    if (exprTerm2 !== undefined) return exprTerm2;

    return undefined;
}

// ([TYPE '='] INITLIST)
function parseExprTerm1(parser: ParserState): NodeExprTerm1 | undefined {
    const rangeStart = parser.next();

    const type = parseType(parser);
    if (type !== undefined) {
        if (parser.next().text !== '=') {
            parser.backtrack(rangeStart);
            return undefined;
        }
        parser.commit(HighlightForToken.Operator);
    }

    const initList = parseInitList(parser);
    if (initList === undefined) {
        parser.backtrack(rangeStart);
        return undefined;
    }

    return {
        nodeName: NodeName.ExprTerm,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        exprTerm: 1,
        type: type,
        initList: initList
    };
}

// ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function parseExprTerm2(parser: ParserState): NodeExprTerm2 | undefined {
    const rangeStart = parser.next();

    const preOps: TokenObject[] = [];
    while (parser.isEnd() === false) {
        const next = parser.next();
        if (next.isReservedToken() === false || next.property.isExprPreOp === false) break;

        preOps.push(parser.next());
        parser.commit(HighlightForToken.Operator);
    }

    const exprValue = parseExprValue(parser);
    if (exprValue === ParseFailure.Mismatch) parser.backtrack(rangeStart);
    if (exprValue === ParseFailure.Mismatch || exprValue === ParseFailure.Pending) {
        return undefined;
    }

    const postOps: NodeExprPostOp[] = [];
    while (parser.isEnd() === false) {
        const parsed = parseExprPostOp(parser);
        if (parsed === undefined) break;

        postOps.push(parsed);
    }

    return {
        nodeName: NodeName.ExprTerm,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        exprTerm: 2,
        preOps: preOps,
        value: exprValue,
        postOps: postOps
    };
}

// BNF: EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
function parseExprValue(parser: ParserState): ParseResult<NodeExprValue> {
    const cast = parseCast(parser);
    if (cast === ParseFailure.Pending) return ParseFailure.Pending;
    if (cast !== ParseFailure.Mismatch) return cast;

    if (parser.next().text === '(') {
        parser.commit(HighlightForToken.Operator);

        const assign = expectAssign(parser);
        if (assign === undefined) return ParseFailure.Pending;

        parser.expect(')', HighlightForToken.Operator);
        return assign;
    }

    const literal = parseLiteral(parser);
    if (literal !== undefined) return literal;

    const lambda = parseLambda(parser);
    if (lambda === ParseFailure.Pending) return ParseFailure.Pending;
    if (lambda !== ParseFailure.Mismatch) return lambda;

    const funcCall = parseFuncCall(parser);
    if (funcCall !== undefined) return funcCall;

    const constructCall = parseConstructCall(parser);
    if (constructCall !== undefined) return constructCall;

    const varAccess = parseVarAccess(parser);
    if (varAccess !== undefined) return varAccess;

    return ParseFailure.Mismatch;
}

// BNF: CONSTRUCTCALL ::= TYPE ARGLIST
function parseConstructCall(parser: ParserState): NodeConstructCall | undefined {
    const rangeStart = parser.next();
    const type = parseType(parser);
    if (type === undefined) return undefined;

    const argList = parseArgList(parser);
    if (argList === undefined) {
        parser.backtrack(rangeStart);
        return undefined;
    }

    return {
        nodeName: NodeName.ConstructCall,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        type: type,
        argList: argList
    };
}

// BNF: EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// BNF: EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ']') | ARGLIST | '++' | '--'
function parseExprPostOp(parser: ParserState): NodeExprPostOp | undefined {
    const rangeStart = parser.next();

    const exprPostOp1 = parseExprPostOp1(parser);
    if (exprPostOp1 !== undefined) return exprPostOp1;

    const exprPostOp2 = parseExprPostOp2(parser);
    if (exprPostOp2 !== undefined) return exprPostOp2;

    const argList = parseArgList(parser);
    if (argList !== undefined)
        return {
            nodeName: NodeName.ExprPostOp,
            nodeRange: new TokenRange(rangeStart, parser.prev()),
            postOp: 3,
            args: argList
        };

    const maybeOperator = parser.next().text;
    if (maybeOperator === '++' || maybeOperator === '--') {
        parser.commit(HighlightForToken.Operator);
        return {
            nodeName: NodeName.ExprPostOp,
            nodeRange: new TokenRange(rangeStart, parser.prev()),
            postOp: 4,
            operator: maybeOperator
        };
    }

    return undefined;
}

// ('.' (FUNCCALL | IDENTIFIER))
function parseExprPostOp1(parser: ParserState): NodeExprPostOp1 | undefined {
    if (parser.next().text !== '.') return undefined;
    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Operator);

    const funcCall = parseFuncCall(parser);
    if (funcCall !== undefined)
        return {
            nodeName: NodeName.ExprPostOp,
            nodeRange: new TokenRange(rangeStart, parser.prev()),
            postOp: 1,
            member: funcCall,
        };

    const identifier = expectIdentifier(parser, HighlightForToken.Variable);
    return {
        nodeName: NodeName.ExprPostOp,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        postOp: 1,
        member: identifier
    };
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
function parseExprPostOp2(parser: ParserState): NodeExprPostOp2 | undefined {
    if (parser.next().text !== '[') return undefined;
    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Operator);

    const indexerList: ParsedPostIndexing[] = [];
    while (parser.isEnd() === false) {
        const loopStart = parser.next();

        const identifier = parseIdentifierWithColon(parser);

        const assign = expectAssign(parser);
        if (assign !== undefined) indexerList.push({identifier: identifier, assign: assign});

        if (expectSeparatorOrClose(parser, ',', ']', indexerList.length > 0) === BreakOrThrough.Break) break;

        if (parser.next() === loopStart) parser.step();
    }

    return {
        nodeName: NodeName.ExprPostOp,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        postOp: 2,
        indexingList: indexerList
    };
}

// [IDENTIFIER ':']
function parseIdentifierWithColon(parser: ParserState): TokenObject | undefined {
    if (parser.next(0).kind === TokenKind.Identifier && parser.next(1).text === ':') {
        const identifier = parser.next();
        parser.commit(HighlightForToken.Parameter);
        parser.commit(HighlightForToken.Operator);
        return identifier;
    }
    return undefined;
}

// BNF: CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
function parseCast(parser: ParserState): ParseResult<NodeCast> {
    if (parser.next().text !== 'cast') return ParseFailure.Mismatch;
    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Keyword);

    if (parser.expect('<', HighlightForToken.Operator) === false) return ParseFailure.Pending;

    const type = expectType(parser);
    if (type === undefined) return ParseFailure.Pending;

    if (parser.expect('>', HighlightForToken.Operator) === false) return ParseFailure.Pending;
    if (parser.expect('(', HighlightForToken.Operator) === false) return ParseFailure.Pending;

    const assign = expectAssign(parser);
    if (assign === undefined) return ParseFailure.Pending;

    parser.expect(')', HighlightForToken.Operator);

    return {
        nodeName: NodeName.Cast,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        type: type,
        assign: assign
    };
}

// BNF: LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
const parseLambda = (parser: ParserState): ParseResult<NodeLambda> => {
    // A lambda expression is determined by checking whether a '{' appears after the '(' at the end of a function call.
    if (canParseLambda(parser) === false) return ParseFailure.Mismatch;

    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Builtin);

    parser.expect('(', HighlightForToken.Operator);

    const result: Mutable<NodeLambda> = {
        nodeName: NodeName.Lambda,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        paramList: [],
        statBlock: undefined
    };

    while (parser.isEnd() === false) {
        if (expectCommaOrParensClose(parser, result.paramList.length > 0) === BreakOrThrough.Break) break;

        if (parser.next(0).kind === TokenKind.Identifier && isCommaOrParensClose(parser.next(1).text)) {
            result.paramList.push({type: undefined, typeMod: undefined, identifier: parser.next()});
            parser.commit(HighlightForToken.Parameter);
            continue;
        }

        const type = parseType(parser);

        const typeMod = type !== undefined ? parseTypeMod(parser) : undefined;

        const identifier: TokenObject | undefined = parseIdentifier(parser, HighlightForToken.Parameter);

        result.paramList.push({type: type, typeMod: typeMod, identifier: identifier});
    }

    result.statBlock = expectStatBlock(parser);
    return appliedNodeEnd(parser, result);
};

function canParseLambda(parser: ParserState): boolean {
    if (parser.next(0).text !== 'function') return false;

    if (parser.next(1).text !== '(') return false;

    let i = 2;
    while (parser.hasNext(i)) {
        if (parser.next(i).text === ')') {
            return parser.next(i + 1).text === '{';
        }

        i++;
    }

    return false;
}

// BNF: LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
function parseLiteral(parser: ParserState): NodeLiteral | undefined {
    const next = parser.next();
    if (next.kind === TokenKind.Number) {
        parser.commit(HighlightForToken.Number);
        return {nodeName: NodeName.Literal, nodeRange: new TokenRange(next, next), value: next};
    }
    if (next.kind === TokenKind.String) {
        parser.commit(HighlightForToken.String);
        return {nodeName: NodeName.Literal, nodeRange: new TokenRange(next, next), value: next};
    }
    if (next.text === 'true' || next.text === 'false' || next.text === 'null') {
        parser.commit(HighlightForToken.Builtin);
        return {nodeName: NodeName.Literal, nodeRange: new TokenRange(next, next), value: next};
    }
    return undefined;
}

// BNF: FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
function parseFuncCall(parser: ParserState): NodeFuncCall | undefined {
    const rangeStart = parser.next();
    const scope = parseScope(parser);

    const identifier = parseIdentifier(parser, HighlightForToken.Function);
    if (identifier === undefined) {
        parser.backtrack(rangeStart);
        return undefined;
    }

    const typeTemplates = parseTypeTemplates(parser) ?? [];

    const argList = parseArgList(parser);
    if (argList === undefined) {
        parser.backtrack(rangeStart);
        return undefined;
    }

    return {
        nodeName: NodeName.FuncCall,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        scope: scope,
        identifier: identifier,
        argList: argList,
        typeTemplates: typeTemplates
    };
}

// BNF: VARACCESS     ::= SCOPE IDENTIFIER
function parseVarAccess(parser: ParserState): NodeVarAccess | undefined {
    const rangeStart = parser.next();
    const scope = parseScope(parser);

    const next = parser.next();
    if (next.kind !== TokenKind.Identifier) {
        if (scope === undefined) return undefined;
        parser.error("Expected identifier.");
        return {
            nodeName: NodeName.VarAccess,
            nodeRange: new TokenRange(rangeStart, parser.prev()),
            scope: scope,
            identifier: undefined
        };
    }
    const isBuiltin: boolean = scope === undefined && next.text === 'this';
    parser.commit(isBuiltin ? HighlightForToken.Builtin : HighlightForToken.Variable);

    return {
        nodeName: NodeName.VarAccess,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        scope: scope,
        identifier: next
    };
}

// BNF: ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
function parseArgList(parser: ParserState): NodeArgList | undefined {
    if (parser.next().text !== '(') return undefined;
    const rangeStart = parser.next();
    parser.commit(HighlightForToken.Operator);

    const argList: ParsedArgument[] = [];
    while (parser.isEnd() === false) {
        if (expectCommaOrParensClose(parser, argList.length > 0) === BreakOrThrough.Break) break;

        const identifier = parseIdentifierWithColon(parser);

        const assign = expectAssign(parser);
        if (assign === undefined) break;

        argList.push({identifier: identifier, assign: assign});
    }

    return {
        nodeName: NodeName.ArgList,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        argList: argList
    };
}

// BNF: ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
function parseAssign(parser: ParserState): NodeAssign | undefined {
    const rangeStart = parser.next();

    const condition = parseCondition(parser);
    if (condition === undefined) return undefined;

    const operator = parseAssignOp(parser);

    const result: Mutable<NodeAssign> = {
        nodeName: NodeName.Assign,
        nodeRange: new TokenRange(rangeStart, parser.prev()),
        condition: condition,
        tail: undefined
    };

    if (operator === undefined) return result;

    const assign = parseAssign(parser);
    if (assign === undefined) return result;

    result.tail = {operator: operator, assign: assign};
    result.nodeRange = new TokenRange(rangeStart, parser.prev());

    return result;
}

function expectAssign(parser: ParserState): NodeAssign | undefined {
    const assign = parseAssign(parser);
    if (assign === undefined) {
        parser.error("Expected assignment.");
    }

    return assign;
}

// BNF: CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
function parseCondition(parser: ParserState): NodeCondition | undefined {
    const rangeStart = parser.next();

    const expr = parseExpr(parser);
    if (expr === undefined) return undefined;

    const result: Mutable<NodeCondition> = {
        nodeName: NodeName.Condition,
        nodeRange: new TokenRange(rangeStart, rangeStart),
        expr: expr,
        ternary: undefined
    };

    if (parser.next().text === '?') {
        parser.commit(HighlightForToken.Operator);

        const trueAssign = expectAssign(parser);
        if (trueAssign === undefined) return result;

        parser.expect(':', HighlightForToken.Operator);

        const falseAssign = expectAssign(parser);
        if (falseAssign === undefined) return result;

        result.ternary = {trueAssign: trueAssign, falseAssign: falseAssign};
    }

    result.nodeRange = new TokenRange(rangeStart, parser.prev());
    return result;
}

// BNF: EXPROP        ::= MATHOP | COMPOP | LOGICOP | BITOP
function parseExprOp(parser: ParserState) {
    const rangeStart = parser.next();

    const next = handleGreaterThanAndGetNext(parser);
    if (next.isReservedToken() === false) {
        parser.backtrack(rangeStart);
        return undefined;
    }

    if (next.property.isExprOp === false) {
        parser.backtrack(rangeStart);
        return parseNotIsOperator(parser);
    }

    parser.commit(next.text === 'is' ? HighlightForToken.Builtin : HighlightForToken.Operator);
    return next;
}

// '!is' requires special handling.
function parseNotIsOperator(parser: ParserState) {
    if (areTokensJoinedBy(parser.next(), ['!', 'is']) === false) return undefined;

    const coveredRange = new TokenRange(parser.next(), parser.next(1));
    parser.commit(HighlightForToken.Builtin);
    parser.commit(HighlightForToken.Builtin);

    return TokenReserved.createVirtual('!is', coveredRange);
}

// BNF: BITOP         ::= '&' | '|' | '^' | '<<' | '>>' | '>>>'

// BNF: MATHOP        ::= '+' | '-' | '*' | '/' | '%' | '**'

// BNF: COMPOP        ::= '==' | '!=' | '<' | '<=' | '>' | '>=' | 'is' | '!is'

// BNF: LOGICOP       ::= '&&' | '||' | '^^' | 'and' | 'or' | 'xor'

// BNF: ASSIGNOP      ::= '=' | '+=' | '-=' | '*=' | '/=' | '|=' | '&=' | '^=' | '%=' | '**=' | '<<=' | '>>=' | '>>>='
function parseAssignOp(parser: ParserState) {
    const rangeStart = parser.next();

    const next = handleGreaterThanAndGetNext(parser);
    if (next.isReservedToken() === false || next.property.isAssignOp === false) {
        parser.backtrack(rangeStart);
        return undefined;
    }

    parser.commit(HighlightForToken.Operator);
    return next;
}

function handleGreaterThanAndGetNext(parser: ParserState) {
    if (parser.next().text !== '>') {
        return parser.next();
    }

    // -----------------------------------------------
    // We need to combine the tokens starting with '>' with the next token
    // because they are separated at the time of tokenization.

    const check = (expected: string[], combinedText: string) => {
        if (areTokensJoinedBy(parser.next(1), expected) === false) {
            return undefined;
        }

        const coveredRange = new TokenRange(parser.next(0), parser.next(expected.length));

        for (let i = 0; i < expected.length; ++i) {
            parser.commit(HighlightForToken.Operator);
        }

        return TokenReserved.createVirtual(combinedText, coveredRange);
    };

    // '>='
    const greaterThanTokenOrEqualToken = check(['='], '>=');
    if (greaterThanTokenOrEqualToken !== undefined) return greaterThanTokenOrEqualToken;

    // '>>>='
    const bitShiftRightArithmeticAssignToken = check(['>', '>', '='], '>>>=');
    if (bitShiftRightArithmeticAssignToken !== undefined) return bitShiftRightArithmeticAssignToken;

    // '>>>'
    const bitShiftRightArithmeticToken = check(['>', '>'], '>>>');
    if (bitShiftRightArithmeticToken !== undefined) return bitShiftRightArithmeticToken;

    // '>>='
    const bitShiftRightAssignToken = check(['>', '='], '>>=');
    if (bitShiftRightAssignToken !== undefined) return bitShiftRightAssignToken;

    // '>>'
    const bitShiftRightToken = check(['>'], '>>');
    if (bitShiftRightToken !== undefined) return bitShiftRightToken;

    return parser.next();
}

export function parseAfterPreprocessed(tokens: TokenObject[]): NodeScript {
    const parser = new ParserState(tokens);

    const script: NodeScript = [];
    while (parser.isEnd() === false) {
        script.push(...parseScript(parser));

        if (parser.isEnd() === false) {
            parser.error("Unexpected token.");
            parser.step();
        }
    }

    return script;
}

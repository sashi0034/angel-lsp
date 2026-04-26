// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_script_bnf.html

import {
    AccessModifierToken,
    ConstModifierToken,
    EntityAttributeToken,
    FunctionAttributeToken,
    GetterOrSetter,
    HandleAndConstTokenPair,
    HandleModifierToken,
    IdentifierAndInitializer,
    IdentifierAndOptionalExpr,
    InOutModifierToken,
    MixinAttributeToken,
    Node_ArgList,
    Node_Assign,
    Node_Break,
    Node_Case,
    Node_Cast,
    Node_Class,
    Node_Condition,
    Node_ConstructorCall,
    Node_Continue,
    Node_DataType,
    Node_DoWhile,
    Node_Enum,
    Node_Expr,
    Node_ExprPostOp,
    Node_ExprPostOp1,
    Node_ExprPostOp2,
    Node_ExprStat,
    Node_ExprTerm1,
    Node_ExprTerm2,
    Node_ExprValue,
    Node_For,
    Node_ForEach,
    Node_Func,
    Node_FuncCall,
    Node_FuncDef,
    Node_If,
    Node_Import,
    Node_InitList,
    Node_Interface,
    Node_InterfaceMethod,
    Node_Lambda,
    Node_LambdaParam,
    Node_ListEntry,
    Node_ListPattern,
    Node_Literal,
    Node_Namespace,
    Node_Parameter,
    Node_ParamList,
    Node_Return,
    Node_Scope,
    Node_Script,
    Node_StatBlock,
    Node_Statement,
    Node_Switch,
    Node_Try,
    Node_Type,
    Node_TypeDef,
    Node_Using,
    Node_Var,
    Node_VarAccess,
    Node_VirtualProp,
    Node_While,
    NodeBase,
    NodeName,
    OptionalIdentifierAndAssign,
    RefModifierToken,
    RepeatModifierToken,
    ScopeAndIdentifier,
    VariableInForEach,
    VoidParameter,
    voidParameter
} from './nodeObject';
import {TokenHighlight} from '../core/highlight';
import {ReservedToken, TokenKind, TokenObject} from '../compiler_tokenizer/tokenObject';
import {BreakOrThrough, ParseFailure, ParseResult, ParserState} from './parserState';
import {areTokensJoinedBy} from '../compiler_tokenizer/tokenUtils';
import {Mutable} from '../utils/utilities';
import {TokenRange} from '../compiler_tokenizer/tokenRange';
import {getGlobalSettings} from '../core/settings';

// **BNF** SCRIPT ::= {IMPORT | ENUM | TYPEDEF | CLASS | INTERFACE | FUNCDEF | VIRTUALPROP | VAR | FUNC | NAMESPACE | USING | ';'}
function parseScript(parser: ParserState, stopKeyword?: string | undefined): Node_Script {
    const script: Node_Script = [];
    while (parser.isEnd() === false) {
        if (parser.peek().text === stopKeyword) {
            break;
        }

        if (parser.peek().text === ';') {
            parser.consume(TokenHighlight.Operator);
            continue;
        }

        const parsedImport = parseImport(parser);
        if (parsedImport === ParseFailure.Pending) {
            continue;
        }

        if (parsedImport !== ParseFailure.Mismatch) {
            script.push(parsedImport);
            continue;
        }

        const parsedTypeDef = parseTypeDef(parser);
        if (parsedTypeDef === ParseFailure.Pending) {
            continue;
        }

        if (parsedTypeDef !== ParseFailure.Mismatch) {
            script.push(parsedTypeDef);
            continue;
        }

        const parsedNamespace = parseNamespace(parser);
        if (parsedNamespace === ParseFailure.Pending) {
            continue;
        }

        if (parsedNamespace !== ParseFailure.Mismatch) {
            script.push(parsedNamespace);
            continue;
        }

        const parsedUsing = parseUsing(parser);
        if (parsedUsing === ParseFailure.Pending) {
            continue;
        }

        if (parsedUsing !== ParseFailure.Mismatch) {
            script.push(parsedUsing);
            continue;
        }

        const parsedClass = parseClass(parser);
        if (parsedClass === ParseFailure.Pending) {
            continue;
        }

        if (parsedClass !== ParseFailure.Mismatch) {
            script.push(parsedClass);
            continue;
        }

        const parsedInterface = parseInterface(parser);
        if (parsedInterface === ParseFailure.Pending) {
            continue;
        }

        if (parsedInterface !== ParseFailure.Mismatch) {
            script.push(parsedInterface);
            continue;
        }

        const parsedEnum = parseEnum(parser);
        if (parsedEnum === ParseFailure.Pending) {
            continue;
        }

        if (parsedEnum !== ParseFailure.Mismatch) {
            script.push(parsedEnum);
            continue;
        }

        const parsedFuncDef = parseFuncDef(parser);
        if (parsedFuncDef === ParseFailure.Pending) {
            continue;
        }

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

        if (parser.hasErrorAhead() === false) {
            parser.error('Unexpected token.');
        }

        parser.advance();
    }

    return script;
}

// **BNF** NAMESPACE ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
function parseNamespace(parser: ParserState): ParseResult<Node_Namespace> {
    if (parser.peek().text !== 'namespace') {
        return ParseFailure.Mismatch;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.Keyword);

    const namespaceList: TokenObject[] = [];
    while (parser.isEnd() === false) {
        const loopStart = parser.peek();

        const identifier = expectIdentifier(parser, TokenHighlight.Namespace);
        if (identifier !== undefined) {
            namespaceList.push(identifier);
        }

        if (expectSeparatorOrClose(parser, '::', '{', true) === BreakOrThrough.Break) {
            break;
        }

        if (parser.peek() === loopStart) {
            parser.advance();
        }
    }

    if (namespaceList.length === 0) {
        return ParseFailure.Pending;
    }

    const script = parseScript(parser, '}');

    parser.expect('}', TokenHighlight.Operator);

    return {
        nodeName: NodeName.Namespace,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        namespaceList: namespaceList,
        script: script
    };
}

// **BNF** USING ::= 'using' 'namespace' IDENTIFIER ('::' IDENTIFIER)* ';'
function parseUsing(parser: ParserState): ParseResult<Node_Using> {
    if (parser.peek().text !== 'using') {
        return ParseFailure.Mismatch;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.Keyword);

    if (parser.expect('namespace', TokenHighlight.Keyword) === false) {
        return ParseFailure.Pending;
    }

    const namespaceList: TokenObject[] = [];
    while (parser.isEnd() === false) {
        const loopStart = parser.peek();

        const identifier = expectIdentifier(parser, TokenHighlight.Namespace);
        if (identifier !== undefined) {
            namespaceList.push(identifier);
        }

        if (expectSeparatorOrClose(parser, '::', ';', true) === BreakOrThrough.Break) {
            break;
        }

        if (parser.peek() === loopStart) {
            parser.advance();
        }
    }

    if (namespaceList.length === 0) {
        return ParseFailure.Pending;
    }

    return {
        nodeName: NodeName.Using,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        namespaceList: namespaceList
    };
}

function parseIdentifier(parser: ParserState, kind: TokenHighlight): TokenObject | undefined {
    const identifier = parser.peek();
    if (identifier.kind !== TokenKind.Identifier) {
        return undefined;
    }

    parser.consume(kind);
    return identifier;
}

function expectIdentifier(parser: ParserState, kind: TokenHighlight): TokenObject | undefined {
    const identifier = parseIdentifier(parser, kind);
    if (identifier === undefined) {
        parser.error('Expected identifier.');
    }

    return identifier;
}

function expectContextualKeyword(parser: ParserState, keyword: string): boolean {
    if (parser.peek().text !== keyword) {
        parser.error(`Expected '${keyword}'.`);
        return false;
    }

    parser.consume(TokenHighlight.Keyword);
    return true;
}

// **BNF** ENUM ::= {'shared' | 'external'} 'enum' IDENTIFIER [ ':' ('int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64') ] (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))
function parseEnum(parser: ParserState): ParseResult<Node_Enum> {
    const rangeStart = parser.peek();

    const metadata = parseMetadata(parser);

    const entityTokens = parseEntityAttributes(parser);

    if (parser.peek().text !== 'enum') {
        parser.rewindTo(rangeStart);
        return ParseFailure.Mismatch;
    }

    parser.consume(TokenHighlight.Keyword);

    const identifier = expectIdentifier(parser, TokenHighlight.Enum);
    if (identifier === undefined) {
        return ParseFailure.Pending;
    }

    let enumType: ReservedToken | undefined;
    if (getGlobalSettings().supportsTypedEnumerations && parser.peek().text === ':') {
        parser.consume(TokenHighlight.Operator);
        const typeIdentifier = parsePrimitiveType(parser);

        if (typeIdentifier === undefined) {
            parser.error('Expected primitive type.');
        }

        enumType = typeIdentifier;
    }

    let memberList: IdentifierAndOptionalExpr[] = [];
    const scopeStart = parser.peek();

    if (parser.peek().text === ';') {
        parser.consume(TokenHighlight.Operator);
    } else {
        memberList = expectEnumMembers(parser);
    }

    return {
        nodeName: NodeName.Enum,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        scopeRange: new TokenRange(scopeStart, parser.previous()),
        metadata,
        entityTokens: entityTokens,
        identifier: identifier,
        memberList: memberList,
        enumType: enumType
    };
}

// '{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} [','] '}'
function expectEnumMembers(parser: ParserState): IdentifierAndOptionalExpr[] {
    const members: IdentifierAndOptionalExpr[] = [];
    parser.expect('{', TokenHighlight.Operator);
    while (parser.isEnd() === false) {
        if (expectSeparatorOrClose(parser, ',', '}', members.length > 0) === BreakOrThrough.Break) {
            break;
        }

        if (parser.peek().text === '}') {
            parser.consume(TokenHighlight.Operator);
            break;
        }

        const identifier = expectIdentifier(parser, TokenHighlight.EnumMember);
        if (identifier === undefined) {
            break;
        }

        let expr: Node_Expr | undefined = undefined;
        if (parser.peek().text === '=') {
            parser.consume(TokenHighlight.Operator);
            expr = expectExpr(parser);
        }

        members.push({identifier: identifier, expr: expr});
    }

    return members;
}

// {'shared' | 'abstract' | 'final' | 'external'}
function parseEntityAttributes(parser: ParserState): EntityAttributeToken[] | undefined {
    let attributes: EntityAttributeToken[] | undefined = undefined;
    while (parser.isEnd() === false) {
        const next = parser.peek().text;

        const isEntityToken = next === 'shared' || next === 'external' || next === 'abstract' || next === 'final';
        if (isEntityToken === false) {
            break;
        }

        attributes = attributes ?? [];
        attributes.push(parser.peek() as EntityAttributeToken);
        parser.consume(TokenHighlight.Keyword);
    }

    return attributes;
}

// **BNF** CLASS ::= ['mixin'] {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTUALPROP | FUNC | VAR | FUNCDEF} '}'))
function parseClass(parser: ParserState): ParseResult<Node_Class> {
    const rangeStart = parser.peek();

    const metadata = parseMetadata(parser);

    let mixinToken: MixinAttributeToken | undefined;
    if (parser.peek().text === 'mixin') {
        parser.consume(TokenHighlight.Keyword);
        mixinToken = parser.previous() as MixinAttributeToken;
    }

    const entityTokens = parseEntityAttributes(parser);

    if (parser.peek().text !== 'class') {
        parser.rewindTo(rangeStart);
        return ParseFailure.Mismatch;
    }

    parser.consume(TokenHighlight.Keyword);

    const identifier = expectIdentifier(parser, TokenHighlight.Class);
    if (identifier === undefined) {
        return ParseFailure.Pending;
    }

    const typeParameters = parseTemplateTypes(parser);

    const baseList: ScopeAndIdentifier[] = [];
    if (parser.peek().text === ':') {
        parser.consume(TokenHighlight.Operator);
        while (parser.isEnd() === false) {
            const loopStart = parser.peek();

            const scope = parseScope(parser);

            const identifier = expectIdentifier(parser, TokenHighlight.Type);

            baseList.push({scope, identifier});

            if (expectSeparatorOrClose(parser, ',', '{', true) === BreakOrThrough.Break) {
                break;
            }

            if (parser.peek() === loopStart) {
                parser.advance();
            }
        }
    } else {
        parser.expect('{', TokenHighlight.Operator);
    }

    const scopeStart = parser.peek();
    const members = expectClassMembers(parser);
    const scopeEnd = parser.previous();

    return {
        nodeName: NodeName.Class,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        scopeRange: new TokenRange(scopeStart, scopeEnd),
        metadata: metadata,
        mixinToken: mixinToken,
        entityTokens: entityTokens,
        identifier: identifier,
        typeParameters: typeParameters,
        baseList: baseList,
        memberList: members
    };
}

// '{' {VIRTUALPROP | FUNC | VAR | FUNCDEF} '}'
function expectClassMembers(parser: ParserState) {
    // parser.expect('{', HighlightTokenKind.Operator);
    const members: (Node_VirtualProp | Node_Var | Node_Func | Node_FuncDef)[] = [];
    while (parser.isEnd() === false) {
        if (parseCloseOperator(parser, '}') === BreakOrThrough.Break) {
            break;
        }

        const parsedFuncDef = parseFuncDef(parser);
        if (parsedFuncDef === ParseFailure.Pending) {
            continue;
        }

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

        parser.error('Expected class member.');
        parser.advance();
    }

    return members;
}

// TYPE IDENTIFIER
function parseVariableInForEach(parser: ParserState): VariableInForEach | undefined {
    const type = expectType(parser);

    if (type === undefined) {
        return undefined;
    }

    const identifier = expectIdentifier(parser, TokenHighlight.Variable);

    if (identifier === undefined) {
        return undefined;
    }

    return {
        type: type,
        identifier: identifier
    };
}

// **BNF** TYPEDEF ::= 'typedef' PRIMITIVETYPE IDENTIFIER ';'
function parseTypeDef(parser: ParserState): ParseResult<Node_TypeDef> {
    if (parser.peek().text !== 'typedef') {
        return ParseFailure.Mismatch;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.Keyword);

    const primitiveType = parsePrimitiveType(parser);
    if (primitiveType === undefined) {
        parser.error('Expected primitive type.');
        return ParseFailure.Pending;
    }

    const identifier = expectIdentifier(parser, TokenHighlight.Type);
    if (identifier === undefined) {
        return ParseFailure.Pending;
    }

    parser.expect(';', TokenHighlight.Operator);

    return {
        nodeName: NodeName.TypeDef,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        type: primitiveType,
        identifier: identifier
    };
}

// **BNF** FUNC ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER ['<' TYPE {',' TYPE} '>'] PARAMLIST [LISTPATTERN] ['const'] FUNCATTR (';' | STATBLOCK)
function parseFunc(parser: ParserState): Node_Func | undefined {
    const rangeStart = parser.peek();

    parseMetadata(parser);

    const entityTokens = parseEntityAttributes(parser);

    const accessor = parseAccessModifier(parser);

    let head: Node_Func['head'];
    if (parser.peek().text === '~') {
        parser.consume(TokenHighlight.Operator);
        head = {tag: 'destructor'};
    } else if (parser.peek(0).kind === TokenKind.Identifier && parser.peek(1).text === '(') {
        head = {tag: 'constructor'};
    } else {
        const returnType = parseType(parser);
        if (returnType === undefined) {
            parser.rewindTo(rangeStart);
            return undefined;
        }

        const refToken = parseRef(parser);

        head = {tag: 'function', returnType: returnType, refToken: refToken};
    }

    const identifier = parseIdentifier(parser, TokenHighlight.Function);
    if (identifier === undefined) {
        parser.rewindTo(rangeStart);
        return undefined;
    }

    const typeParameters = parseTemplateTypes(parser) ?? [];

    if (parser.isPredefinedFile === false) {
        // Function declarations are not allowed outside `as.predefined`.
        if (lookaheadTokenAfterParentheses(parser)?.text === ';') {
            // This may be a variable initialized by a constructor call, not a function declaration.
            parser.rewindTo(rangeStart);
            return undefined;
        }
    }

    const paramList = parseParamList(parser);
    if (paramList === undefined) {
        parser.rewindTo(rangeStart);
        return undefined;
    }

    const listPattern: Node_ListPattern | undefined = parseListPattern(parser);

    let statBlock: Node_StatBlock | undefined = undefined;
    let funcAttrTokens: FunctionAttributeToken[] | undefined = undefined;
    let postfixConstToken: ConstModifierToken | undefined = undefined;

    if (listPattern === undefined) {
        postfixConstToken = parseConst(parser);

        funcAttrTokens = parseFuncAttr(parser);

        if (parser.peek().text === ';') {
            parser.consume(TokenHighlight.Operator);
        } else {
            statBlock = expectStatBlock(parser);
        }
    } else {
        if (parser.peek().text !== ';') {
            parser.rewindTo(rangeStart);
            return undefined;
        }

        parser.consume(TokenHighlight.Operator);
    }

    return {
        nodeName: NodeName.Func,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        entityTokens: entityTokens,
        accessor: accessor,
        head: head,
        identifier: identifier,
        paramList: paramList,
        postfixConstToken: postfixConstToken,
        funcAttrTokens: funcAttrTokens,
        statBlock: statBlock,
        typeParameters: typeParameters,
        listPattern: listPattern
    };
}

function parseConst(parser: ParserState): ConstModifierToken | undefined {
    const next = parser.peek();
    if (next.text !== 'const') {
        return undefined;
    }

    parser.consume(TokenHighlight.Keyword);
    return next as ConstModifierToken;
}

function parseRef(parser: ParserState): RefModifierToken | undefined {
    const next = parser.peek();
    if (next.text !== '&') {
        return undefined;
    }

    parser.consume(TokenHighlight.Keyword);
    return next as RefModifierToken;
}

function lookaheadTokenAfterParentheses(parser: ParserState) {
    let level = 0;
    let i = 0;
    while (parser.canPeek(i)) {
        const token = parser.peek(i);
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

// Metadata declarations can appear in sequence, and the only structural rule here
// is that `[` and `]` must be balanced.
// e.g., `[Hello[]]` is valid but `[Hello[]` is not.
function parseMetadata(parser: ParserState): TokenObject[][] {
    const rangeStart = parser.peek();
    if (parser.peek().text !== '[') {
        return [];
    }

    let level = 0;

    const metadata: TokenObject[][] = [[]];
    while (parser.isEnd() === false) {
        if (parser.peek().text === '[') {
            if (level > 0) {
                metadata.at(-1)!.push(parser.peek());
            }

            level++;
            parser.consume(TokenHighlight.Operator);
        } else if (parser.peek().text === ']') {
            level--;
            parser.consume(TokenHighlight.Operator);

            if (level === 0) {
                // AngelScript allows multiple metadata declarations in consecutive `[` `]` pairs,
                // so continue parsing them here.
                // e `[Hello][World]` is valid, as are
                // [Hello]
                // [World]
                if (parser.peek().text === '[') {
                    metadata.push([]);
                    continue;
                }

                return metadata;
            } else {
                metadata.at(-1)!.push(parser.peek());
            }
        } else {
            metadata.at(-1)!.push(parser.peek());

            if (parser.peek().kind === TokenKind.Identifier) {
                parser.consume(TokenHighlight.Type);
            } else {
                parser.advance();
            }
        }
    }

    // This happens when `level !== 0`.
    parser.rewindTo(rangeStart);
    return [];
}

// ['private' | 'protected']
function parseAccessModifier(parser: ParserState): AccessModifierToken | undefined {
    const next = parser.peek();
    if (next.text === 'private' || next.text === 'protected') {
        parser.consume(TokenHighlight.Keyword);
        return next as AccessModifierToken;
    }

    return undefined;
}

// **BNF** LISTPATTERN ::= '{' LISTENTRY {',' LISTENTRY} '}'
function parseListPattern(parser: ParserState): Node_ListPattern | undefined {
    if (parser.isPredefinedFile === false) {
        return undefined;
    }

    const rangeStart = parser.peek();

    if (parser.peek().text !== '{') {
        return undefined;
    }

    parser.consume(TokenHighlight.Operator);

    const entries: Node_ListEntry[] = [];

    while (!parser.isEnd()) {
        if (parser.peek().text === '}') {
            break;
        }

        if (entries.length > 0) {
            if (parser.peek().text !== ',') {
                parser.rewindTo(rangeStart);
                return undefined;
            }

            parser.consume(TokenHighlight.Operator);
        }

        const entry = parseListEntry(parser);
        if (entry === undefined) {
            parser.rewindTo(rangeStart);
            return undefined;
        }

        entries.push(entry);
    }

    if (parser.peek().text !== '}' || entries.length === 0) {
        parser.rewindTo(rangeStart);
        return undefined;
    }

    parser.consume(TokenHighlight.Operator);

    return {
        nodeName: NodeName.ListPattern,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        entries: entries
    };
}

// **BNF** LISTENTRY ::= (('repeat' | 'repeat_same') (('{' LISTENTRY '}') | TYPE)) | (TYPE {',' TYPE})
function parseListEntry(parser: ParserState): Node_ListEntry | undefined {
    const rangeStart = parser.peek();

    const repeatToken = parseRepeatModifier(parser);
    if (repeatToken !== undefined) {
        let entry: Node_ListEntry | undefined;
        let type: Node_Type | undefined;
        if (parser.peek().text === '{') {
            parser.consume(TokenHighlight.Operator);
            entry = parseListEntry(parser);
            if (entry === undefined || parser.peek().text !== '}') {
                parser.rewindTo(rangeStart);
                return undefined;
            }

            parser.consume(TokenHighlight.Operator);
        } else {
            type = parseListEntryType(parser);
            if (type === undefined) {
                parser.rewindTo(rangeStart);
                return undefined;
            }
        }

        return {
            nodeName: NodeName.ListEntry,
            nodeRange: new TokenRange(rangeStart, parser.previous()),
            entryPattern: 1,
            repeatToken: repeatToken,
            entry: entry ?? type
        };
    }

    const typeList: Node_Type[] = [];
    while (parser.isEnd() === false) {
        const type = parseType(parser);
        if (type === undefined) {
            break;
        }

        typeList.push(type);

        if (parser.peek().text !== ',') {
            break;
        }

        const comma = parser.peek();
        parser.consume(TokenHighlight.Operator);

        const nextTypeStart = parser.peek();
        const nextType = parseType(parser);
        parser.rewindTo(nextTypeStart);
        if (nextType === undefined) {
            parser.rewindTo(comma);
            break;
        }
    }

    if (typeList.length === 0) {
        parser.rewindTo(rangeStart);
        return undefined;
    }

    return {
        nodeName: NodeName.ListEntry,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        entryPattern: 2,
        typeList: typeList
    };
}

function parseListEntryType(parser: ParserState): Node_Type | undefined {
    if (parser.peek().text === 'repeat' || parser.peek().text === 'repeat_same') {
        return undefined;
    }

    return parseType(parser);
}

function parseRepeatModifier(parser: ParserState): RepeatModifierToken | undefined {
    const next = parser.peek();
    if (next.text !== 'repeat' && next.text !== 'repeat_same') {
        return undefined;
    }

    parser.consume(TokenHighlight.Keyword);
    return next as RepeatModifierToken;
}

// **BNF** INTERFACE ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {VIRTUALPROP | INTERFACEMETHOD} '}'))
function parseInterface(parser: ParserState): ParseResult<Node_Interface> {
    const rangeStart = parser.peek();

    const entityTokens = parseEntityAttributes(parser);

    if (parser.peek().text !== 'interface') {
        parser.rewindTo(rangeStart);
        return ParseFailure.Mismatch;
    }

    parser.consume(TokenHighlight.Keyword);

    const identifier = expectIdentifier(parser, TokenHighlight.Interface);
    if (identifier === undefined) {
        return ParseFailure.Pending;
    }

    const result: Mutable<Node_Interface> = {
        nodeName: NodeName.Interface,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        entityTokens: entityTokens,
        identifier: identifier,
        baseList: [],
        memberList: []
    };

    if (parser.peek().text === ';') {
        parser.consume(TokenHighlight.Operator);
        return result;
    }

    if (parser.peek().text === ':') {
        parser.consume(TokenHighlight.Operator);
        while (parser.isEnd() === false) {
            const loopStart = parser.peek();

            const scope = parseScope(parser);

            const identifier = expectIdentifier(parser, TokenHighlight.Type);

            result.baseList.push({scope, identifier});

            if (expectSeparatorOrClose(parser, ',', '{', true) === BreakOrThrough.Break) {
                break;
            }

            if (parser.peek() === loopStart) {
                parser.advance();
            }
        }
    } else {
        parser.expect('{', TokenHighlight.Operator);
    }

    result.memberList = expectInterfaceMembers(parser);

    return result;
}

// '{' {VIRTUALPROP | INTERFACEMETHOD} '}'
function expectInterfaceMembers(parser: ParserState): (Node_InterfaceMethod | Node_VirtualProp)[] {
    // parser.expect('{', HighlightTokenKind.Operator);

    const members: (Node_InterfaceMethod | Node_VirtualProp)[] = [];
    while (parser.isEnd() === false) {
        if (parseCloseOperator(parser, '}') === BreakOrThrough.Break) {
            break;
        }

        const interfaceMethod = parseInterfaceMethod(parser);
        if (interfaceMethod !== undefined) {
            members.push(interfaceMethod);
            continue;
        }

        const virtualProp = parseVirtualProp(parser);
        if (virtualProp !== undefined) {
            members.push(virtualProp);
            continue;
        }

        parser.error('Expected interface member.');
        parser.advance();
    }

    return members;
}

// **BNF** VAR ::= ['private' | 'protected'] TYPE IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]} ';'
function parseVar(parser: ParserState): Node_Var | undefined {
    const rangeStart = parser.peek();

    parseMetadata(parser);

    const accessor = parseAccessModifier(parser);

    const type = parseType(parser);
    if (type === undefined) {
        parser.rewindTo(rangeStart);
        return undefined;
    }

    if (parser.peek().kind !== TokenKind.Identifier) {
        parser.rewindTo(rangeStart);
        return undefined;
    }

    const variables: IdentifierAndInitializer[] = [];
    while (parser.isEnd() === false) {
        const identifier = expectIdentifier(parser, TokenHighlight.Variable);
        if (identifier === undefined) {
            break;
        }

        if (parser.peek().text === '=') {
            parser.consume(TokenHighlight.Operator);

            const initListOrExpr = expectInitListOrExpr(parser);
            variables.push({identifier: identifier, initializer: initListOrExpr});
        } else {
            const argList = parseArgList(parser);
            variables.push({identifier: identifier, initializer: argList});
        }

        if (expectSeparatorOrClose(parser, ',', ';', true) === BreakOrThrough.Break) {
            break;
        }
    }

    return {
        nodeName: NodeName.Var,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
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

    parser.error('Expected initializer list or assignment.');
}

// **BNF** IMPORT ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
function parseImport(parser: ParserState): ParseResult<Node_Import> {
    const rangeStart = parser.peek();

    if (parser.peek().text !== 'import') {
        return ParseFailure.Mismatch;
    }

    parser.consume(TokenHighlight.Keyword);

    const type = expectType(parser);
    if (type === undefined) {
        return ParseFailure.Pending;
    }

    const refToken = parseRef(parser);

    const identifier = expectIdentifier(parser, TokenHighlight.Variable);
    if (identifier === undefined) {
        return ParseFailure.Pending;
    }

    const paramList = expectParamList(parser);
    if (paramList === undefined) {
        return ParseFailure.Pending;
    }

    const funcAttrTokens = parseFuncAttr(parser);

    if (expectContextualKeyword(parser, 'from') === false) {
        return ParseFailure.Pending;
    }

    const path = parser.peek();
    if (path.kind !== TokenKind.String) {
        parser.error('Expected string path.');
        return ParseFailure.Pending;
    }

    parser.consume(TokenHighlight.String);

    parser.expect(';', TokenHighlight.Operator);

    return {
        nodeName: NodeName.Import,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        type: type,
        refToken: refToken,
        identifier: identifier,
        paramList: paramList,
        funcAttrTokens: funcAttrTokens,
        path: path
    };
}

// **BNF** FUNCDEF ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
function parseFuncDef(parser: ParserState): ParseResult<Node_FuncDef> {
    const rangeStart = parser.peek();

    const entityTokens = parseEntityAttributes(parser);

    if (parser.peek().text !== 'funcdef') {
        parser.rewindTo(rangeStart);
        return ParseFailure.Mismatch;
    }

    parser.consume(TokenHighlight.Keyword);

    const returnType = expectType(parser);
    if (returnType === undefined) {
        return ParseFailure.Pending;
    }

    const refToken = parseRef(parser);

    const identifier = expectIdentifier(parser, TokenHighlight.Function);
    if (identifier === undefined) {
        return ParseFailure.Pending;
    }

    const paramList = expectParamList(parser);
    if (paramList === undefined) {
        return ParseFailure.Pending;
    }

    parser.expect(';', TokenHighlight.Operator);

    return {
        nodeName: NodeName.FuncDef,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        entityTokens: entityTokens,
        returnType: returnType,
        refToken: refToken,
        identifier: identifier,
        paramList: paramList
    };
}

// **BNF** VIRTUALPROP ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
function parseVirtualProp(parser: ParserState): Node_VirtualProp | undefined {
    const rangeStart = parser.peek();

    parseMetadata(parser);

    const accessor = parseAccessModifier(parser);

    const type = parseType(parser);
    if (type === undefined) {
        parser.rewindTo(rangeStart);
        return undefined;
    }

    const refToken = parseRef(parser);

    const identifier = parseIdentifier(parser, TokenHighlight.Variable);
    if (identifier === undefined) {
        parser.rewindTo(rangeStart);
        return undefined;
    }

    if (parser.peek().text !== '{') {
        parser.rewindTo(rangeStart);
        return undefined;
    }

    parser.consume(TokenHighlight.Operator);

    let getter: GetterOrSetter | undefined = undefined;
    let setter: GetterOrSetter | undefined = undefined;
    while (parser.isEnd() === false) {
        const next = parser.peek().text;

        if (parseCloseOperator(parser, '}') === BreakOrThrough.Break) {
            break;
        } else if (next === 'get') {
            getter = expectGetterSetter(parser);
        } else if (next === 'set') {
            setter = expectGetterSetter(parser);
        } else {
            parser.error('Expected getter or setter.');
            parser.advance();
        }
    }

    return {
        nodeName: NodeName.VirtualProp,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        accessor: accessor,
        type: type,
        refToken: refToken,
        identifier: identifier,
        getter: getter,
        setter: setter
    };
}

// ('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')
function expectGetterSetter(parser: ParserState): GetterOrSetter {
    parser.consume(TokenHighlight.Keyword);

    const constToken = parseConst(parser);
    const funcAttrTokens = parseFuncAttr(parser);
    let statBlock: Node_StatBlock | undefined = undefined;
    if (parser.peek().text === ';') {
        parser.consume(TokenHighlight.Operator);
    } else {
        statBlock = expectStatBlock(parser);
    }

    return {
        constToken: constToken,
        funcAttrTokens: funcAttrTokens,
        statBlock: statBlock
    };
}

// **BNF** INTERFACEMETHOD ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] FUNCATTR ';'
function parseInterfaceMethod(parser: ParserState): Node_InterfaceMethod | undefined {
    const rangeStart = parser.peek();

    const returnType = parseType(parser);
    if (returnType === undefined) {
        parser.rewindTo(rangeStart);
        return undefined;
    }

    const refToken = parseRef(parser);

    const identifier = parseIdentifier(parser, TokenHighlight.Function);
    if (identifier === undefined) {
        parser.rewindTo(rangeStart);
        return undefined;
    }

    const paramList = parseParamList(parser);
    if (paramList === undefined) {
        parser.rewindTo(rangeStart);
        return undefined;
    }

    const constToken = parseConst(parser);

    const funcAttr = parseFuncAttr(parser);

    parser.expect(';', TokenHighlight.Operator);

    return {
        nodeName: NodeName.InterfaceMethod,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        returnType: returnType,
        refToken: refToken,
        identifier: identifier,
        paramList: paramList,
        funcAttrTokens: funcAttr,
        postfixConstToken: constToken
    };
}

// **BNF** STATBLOCK ::= '{' {VAR | STATEMENT | USING} '}'
function parseStatBlock(parser: ParserState): Node_StatBlock | undefined {
    if (parser.peek().text !== '{') {
        return undefined;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.Operator);

    const statementList: (Node_Var | Node_Statement | Node_Using)[] = [];
    while (parser.isEnd() === false) {
        if (parseCloseOperator(parser, '}') === BreakOrThrough.Break) {
            break;
        }

        const parsedVar = parseVar(parser);
        if (parsedVar !== undefined) {
            statementList.push(parsedVar);
            continue;
        }

        const using = parseUsing(parser);
        if (using === ParseFailure.Pending) {
            continue;
        }

        if (using !== ParseFailure.Mismatch) {
            statementList.push(using);
            continue;
        }

        const statement = parseStatement(parser);
        if (statement === ParseFailure.Pending) {
            continue;
        }

        if (statement !== ParseFailure.Mismatch) {
            statementList.push(statement);
            continue;
        }

        parser.error('Expected statement.');
        parser.advance();
    }

    return {
        nodeName: NodeName.StatBlock,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        statementList: statementList
    };
}

function expectStatBlock(parser: ParserState): Node_StatBlock | undefined {
    const statBlock = parseStatBlock(parser);
    if (statBlock === undefined) {
        parser.error('Expected statement block.');
    }

    return statBlock;
}

// **BNF** PARAMLIST ::= '(' ['void' | (PARAMETER {',' PARAMETER})] ')'
function parseParamList(parser: ParserState): Node_ParamList | undefined {
    const rangeStart = parser.peek();
    if (rangeStart.text !== '(') {
        return undefined;
    }

    parser.consume(TokenHighlight.Operator);

    if (parser.peek().text === 'void') {
        parser.consume(TokenHighlight.Keyword);
        parser.expect(')', TokenHighlight.Operator);
        return {
            nodeName: NodeName.ParamList,
            nodeRange: new TokenRange(rangeStart, parser.previous()),
            params: []
        };
    }

    let isVariadic = false;
    const parameters: Node_Parameter[] = [];

    while (parser.isEnd() === false) {
        if (expectCommaOrParensClose(parser, parameters.length > 0) === BreakOrThrough.Break) {
            break;
        }

        if (isVariadic) {
            parser.error('Variadic ellipses must be the last parameter.');
        }

        const param = parseParameter(parser, isVariadic);
        if (param === undefined) {
            // If this is not a valid identifier, it can never become a valid constructor call.
            if (parser.peek().kind === TokenKind.String || parser.peek().kind === TokenKind.Number) {
                return undefined;
            }

            // If this is not a type, it is probably a variable followed by a constructor call.
            parser.advance();
            continue;
        }

        isVariadic = isVariadic || param.isVariadic;
        parameters.push(param);
    }

    return {
        nodeName: NodeName.ParamList,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        params: parameters
    };
}

function expectParamList(parser: ParserState): Node_ParamList | undefined {
    const paramList = parseParamList(parser);
    if (paramList === undefined) {
        parser.error('Expected parameter list.');
    }

    return paramList;
}

function expectCommaOrParensClose(parser: ParserState, canSeparator: boolean): BreakOrThrough {
    return expectSeparatorOrClose(parser, ',', ')', canSeparator);
}

function isCommaOrParensClose(character: string): boolean {
    return character === ',' || character === ')';
}

function parseSeparatorOrClose(
    parser: ParserState,
    separatorOp: string,
    closeOp: string,
    canSeparator: boolean,
    allowTrailing: boolean = false
): BreakOrThrough | undefined {
    const next = parser.peek().text;
    if (next === closeOp) {
        parser.consume(TokenHighlight.Operator);
        return BreakOrThrough.Break;
    } else if (canSeparator) {
        if (next !== separatorOp) {
            return undefined;
        }

        parser.consume(TokenHighlight.Operator);

        if (allowTrailing) {
            if (parser.peek().text == closeOp) {
                parser.consume(TokenHighlight.Operator);
                return BreakOrThrough.Break;
            }
        }
    }

    return BreakOrThrough.Through;
}

function expectSeparatorOrClose(
    parser: ParserState,
    separatorOp: string,
    closeOp: string,
    canSeparator: boolean,
    allowTrailing: boolean = false
): BreakOrThrough {
    const parsed = parseSeparatorOrClose(parser, separatorOp, closeOp, canSeparator, allowTrailing);
    if (parsed !== undefined) {
        return parsed;
    }

    parser.error(`Expected '${separatorOp}' or '${closeOp}'.`);
    return BreakOrThrough.Break;
}

function parseCloseOperator(parser: ParserState, closeOp: string): BreakOrThrough {
    const next = parser.peek().text;
    if (next === closeOp) {
        parser.consume(TokenHighlight.Operator);
        return BreakOrThrough.Break;
    }

    return BreakOrThrough.Through;
}

// **BNF** PARAMETER ::= TYPE TYPEMODIFIER [IDENTIFIER] ['...' | ('=' (EXPR | 'void'))]
function parseParameter(parser: ParserState, isPreviousParameterVariadic: boolean): Node_Parameter | undefined {
    const rangeStart = parser.peek();

    const type = parseType(parser);
    if (type === undefined) {
        return undefined;
    }

    const inOutToken = parseTypeModifier(parser);

    let identifier: TokenObject | undefined = undefined;
    if (parser.peek().kind === TokenKind.Identifier) {
        identifier = parser.peek();
        parser.consume(TokenHighlight.Variable);
    }

    let isVariadic = false;
    if (parser.peek().text === '...') {
        parser.consume(TokenHighlight.Operator);
        isVariadic = true;
    }

    let defaultExpr: Node_Expr | VoidParameter | undefined = undefined;
    if (parser.peek().text === '=') {
        if (isPreviousParameterVariadic || isVariadic) {
            parser.error('Variadic functions cannot have a default expression.');
        }

        parser.consume(TokenHighlight.Operator);
        defaultExpr = expectExprOrVoid(parser);
    }

    return {
        nodeName: NodeName.Parameter,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        type: type,
        inOutToken: inOutToken,
        identifier: identifier,
        defaultExpr: defaultExpr,
        isVariadic: isVariadic
    };
}

// **BNF** TYPEMODIFIER ::= ['&' ['in' | 'out' | 'inout'] ['+'] ['if_handle_then_const']]
function parseTypeModifier(parser: ParserState): InOutModifierToken | undefined {
    let modifier: InOutModifierToken | undefined = undefined;

    if (parser.peek().text === '&') {
        parser.consume(TokenHighlight.Keyword);

        const next = parser.peek();
        if (next.text === 'in' || next.text === 'out' || next.text === 'inout') {
            parser.consume(TokenHighlight.Keyword);
            modifier = next as InOutModifierToken;
        }
    }

    // TODO: this should only be allowed on non-nocount handles
    if (parser.peek().text === '+') {
        parser.consume(TokenHighlight.Keyword);
    }

    // TODO: this should only be allowed on handles of
    // template parameter types
    if (parser.peek().text === 'if_handle_then_const') {
        parser.consume(TokenHighlight.Keyword);
    }

    return modifier;
}

// **BNF** TYPE ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
function parseType(parser: ParserState): Node_Type | undefined {
    const rangeStart = parser.peek();

    const constToken = parseConst(parser);

    const scope = parseScope(parser);

    const datatype = parseDatatype(parser);
    if (datatype === undefined) {
        parser.rewindTo(rangeStart);
        return undefined;
    }

    const typeArguments = parseTemplateTypes(parser) ?? [];

    const {isArray, handle} = parseTypeTail(parser);

    return {
        nodeName: NodeName.Type,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        constToken: constToken,
        scope: scope,
        dataType: datatype,
        typeArguments: typeArguments,
        isArray: isArray,
        handle: handle
    };
}

function parseTypeTail(parser: ParserState) {
    let isArray = false;
    let handleTokens: HandleAndConstTokenPair | undefined = undefined;
    while (parser.isEnd() === false) {
        if (parser.peek(0).text === '[' && parser.peek(1).text === ']') {
            parser.consume(TokenHighlight.Operator);
            parser.consume(TokenHighlight.Operator);
            isArray = true;
            continue;
        } else if (parser.peek().text === '@') {
            const handleToken = parser.peek() as HandleModifierToken;
            parser.consume(TokenHighlight.Keyword);

            // auto-handle
            if (parser.peek().text === '+') {
                parser.consume(TokenHighlight.Keyword);
            }

            const constToken = parseConst(parser);
            if (constToken !== undefined) {
                handleTokens = {handleToken: handleToken, constToken: constToken};
            } else {
                handleTokens = {handleToken: handleToken, constToken: undefined};
            }

            continue;
        }

        break;
    }

    return {isArray, handle: handleTokens};
}

function expectType(parser: ParserState): Node_Type | undefined {
    const type = parseType(parser);
    if (type === undefined) {
        parser.error('Expected type.');
    }

    return type;
}

// '<' TYPE {',' TYPE} '>'
function parseTemplateTypes(parser: ParserState): Node_Type[] | undefined {
    const rangeStart = parser.peek();
    if (parser.peek().text !== '<') {
        return undefined;
    }

    parser.consume(TokenHighlight.Operator);

    const typeList: Node_Type[] = [];
    while (parser.isEnd() === false) {
        const type = parseType(parser);
        if (type === undefined) {
            parser.rewindTo(rangeStart);
            return undefined;
        }

        typeList.push(type);

        const breakOrThrough = parseSeparatorOrClose(parser, ',', '>', typeList.length > 0);
        if (breakOrThrough === BreakOrThrough.Break) {
            break;
        } else if (breakOrThrough === undefined) {
            parser.rewindTo(rangeStart);
            return undefined;
        }
    }

    return typeList;
}

// **BNF** INITLIST ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
function parseInitList(parser: ParserState): Node_InitList | undefined {
    if (parser.peek().text !== '{') {
        return undefined;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.Operator);

    const initList: (Node_Assign | Node_InitList)[] = [];
    while (parser.isEnd() === false) {
        if (expectSeparatorOrClose(parser, ',', '}', initList.length > 0, true) === BreakOrThrough.Break) {
            break;
        }

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

        parser.error('Expected assignment or initializer list.');
        parser.advance();
    }

    return {
        nodeName: NodeName.InitList,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        initList: initList
    };
}

// **BNF** SCOPE ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
function parseScope(parser: ParserState): Node_Scope | undefined {
    const rangeStart = parser.peek();

    let isGlobal = false;
    if (parser.peek().text === '::') {
        parser.consume(TokenHighlight.Operator);
        isGlobal = true;
    }

    const scopeList: TokenObject[] = [];
    let typeArguments: Node_Type[] | undefined = undefined;
    while (parser.isEnd() === false) {
        const identifier = parser.peek(0);
        if (identifier.kind !== TokenKind.Identifier) {
            break;
        }

        if (parser.peek(1).text === '::') {
            parser.consume(TokenHighlight.Namespace);
            parser.consume(TokenHighlight.Operator);
            scopeList.push(identifier);
            continue;
        } else if (parser.peek(1).text === '<') {
            const typesStart = parser.peek();
            parser.consume(TokenHighlight.Class);

            typeArguments = parseTemplateTypes(parser);
            if (typeArguments === undefined || parser.peek().text !== '::') {
                parser.rewindTo(typesStart);
            } else {
                parser.consume(TokenHighlight.Operator);
                scopeList.push(identifier);
            }
        }

        break;
    }

    if (isGlobal === false && scopeList.length === 0) {
        return undefined;
    }

    const scopeNode: Node_Scope = {
        nodeName: NodeName.Scope,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        isGlobal: isGlobal,
        scopeList: scopeList,
        typeArguments: typeArguments ?? []
    };
    return scopeNode;
}

// **BNF** DATATYPE ::= (IDENTIFIER | PRIMITIVETYPE | '?' | 'auto')
function parseDatatype(parser: ParserState): Node_DataType | undefined {
    const next = parser.peek();
    if (next.kind === TokenKind.Identifier) {
        parser.consume(TokenHighlight.Type);
        return {
            nodeName: NodeName.DataType,
            nodeRange: new TokenRange(next, next),
            identifier: next
        };
    }

    if (next.text === '?' || next.text === 'auto') {
        parser.consume(TokenHighlight.Keyword);
        return {
            nodeName: NodeName.DataType,
            nodeRange: new TokenRange(next, next),
            identifier: next
        };
    }

    const primitiveType = parsePrimitiveType(parser);
    if (primitiveType !== undefined) {
        return {
            nodeName: NodeName.DataType,
            nodeRange: new TokenRange(next, next),
            identifier: primitiveType
        };
    }

    return undefined;
}

// **BNF** PRIMITIVETYPE ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
function parsePrimitiveType(parser: ParserState) {
    const next = parser.peek();
    if (next.isReservedToken() === false || next.property.isPrimitiveType === false) {
        return undefined;
    }

    parser.consume(TokenHighlight.Keyword);
    return next;
}

// **BNF** FUNCATTR ::= {'override' | 'final' | 'explicit' | 'property' | 'delete' | 'nodiscard'}
function parseFuncAttr(parser: ParserState): FunctionAttributeToken[] | undefined {
    let attributes: FunctionAttributeToken[] | undefined = undefined;
    while (parser.isEnd() === false) {
        const next = parser.peek().text;

        const isFuncAttrToken =
            next === 'override' ||
            next === 'final' ||
            next === 'explicit' ||
            next === 'property' ||
            next === 'delete' ||
            next === 'nodiscard';
        if (isFuncAttrToken === false) {
            break;
        }

        attributes = attributes ?? [];
        attributes.push(parser.peek() as FunctionAttributeToken);
        parser.consume(TokenHighlight.Keyword);
    }

    return attributes;
}

// **BNF** STATEMENT ::= (IF | FOR | FOREACH | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
function parseStatement(parser: ParserState): ParseResult<Node_Statement> {
    const parsedIf = parseIf(parser);
    if (parsedIf === ParseFailure.Pending) {
        return ParseFailure.Pending;
    }

    if (parsedIf !== ParseFailure.Mismatch) {
        return parsedIf;
    }

    const parsedFor = parseFor(parser);
    if (parsedFor === ParseFailure.Pending) {
        return ParseFailure.Pending;
    }

    if (parsedFor !== ParseFailure.Mismatch) {
        return parsedFor;
    }

    if (getGlobalSettings().supportsForEach) {
        const parsedForEach = parseForEach(parser);
        if (parsedForEach === ParseFailure.Pending) {
            return ParseFailure.Pending;
        }

        if (parsedForEach !== ParseFailure.Mismatch) {
            return parsedForEach;
        }
    }

    const parsedWhile = parseWhile(parser);
    if (parsedWhile === ParseFailure.Pending) {
        return ParseFailure.Pending;
    }

    if (parsedWhile !== ParseFailure.Mismatch) {
        return parsedWhile;
    }

    const parsedReturn = parseReturn(parser);
    if (parsedReturn === ParseFailure.Pending) {
        return ParseFailure.Pending;
    }

    if (parsedReturn !== ParseFailure.Mismatch) {
        return parsedReturn;
    }

    const statBlock = parseStatBlock(parser);
    if (statBlock !== undefined) {
        return statBlock;
    }

    const parsedBreak = parseBreak(parser);
    if (parsedBreak !== undefined) {
        return parsedBreak;
    }

    const parsedContinue = parseContinue(parser);
    if (parsedContinue !== undefined) {
        return parsedContinue;
    }

    const doWhile = parseDoWhile(parser);
    if (doWhile === ParseFailure.Pending) {
        return ParseFailure.Pending;
    }

    if (doWhile !== ParseFailure.Mismatch) {
        return doWhile;
    }

    const parsedSwitch = parseSwitch(parser);
    if (parsedSwitch === ParseFailure.Pending) {
        return ParseFailure.Pending;
    }

    if (parsedSwitch !== ParseFailure.Mismatch) {
        return parsedSwitch;
    }

    const parsedTry = parseTry(parser);
    if (parsedTry === ParseFailure.Pending) {
        return ParseFailure.Pending;
    }

    if (parsedTry !== ParseFailure.Mismatch) {
        return parsedTry;
    }

    const exprStat = parseExprStat(parser);
    if (exprStat !== undefined) {
        return exprStat;
    }

    return ParseFailure.Mismatch;
}

function expectStatement(parser: ParserState): Node_Statement | undefined {
    const statement = parseStatement(parser);
    if (statement === ParseFailure.Pending) {
        return undefined;
    }

    if (statement === ParseFailure.Mismatch) {
        parser.error('Expected statement.');
        return undefined;
    }

    return statement;
}

// **BNF** SWITCH ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
function parseSwitch(parser: ParserState): ParseResult<Node_Switch> {
    if (parser.peek().text !== 'switch') {
        return ParseFailure.Mismatch;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.ControlKeyword);

    parser.expect('(', TokenHighlight.Operator);

    const assign = expectAssign(parser);
    if (assign === undefined) {
        return ParseFailure.Pending;
    }

    parser.expect(')', TokenHighlight.Operator);
    parser.expect('{', TokenHighlight.Operator);

    const cases: Node_Case[] = [];
    while (parser.isEnd() === false) {
        if (parseCloseOperator(parser, '}') === BreakOrThrough.Break) {
            break;
        }

        const parsedCase = parseCase(parser);
        if (parsedCase === ParseFailure.Mismatch) {
            parser.error('Expected case statement.');
            parser.advance();
            continue;
        }

        if (parsedCase === ParseFailure.Pending) {
            continue;
        }

        cases.push(parsedCase);
    }

    return {
        nodeName: NodeName.Switch,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        assign: assign,
        caseList: cases
    };
}

// **BNF** BREAK ::= 'break' ';'
function parseBreak(parser: ParserState): Node_Break | undefined {
    if (parser.peek().text !== 'break') {
        return undefined;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.ControlKeyword);

    parser.expect(';', TokenHighlight.Operator);
    return {nodeName: NodeName.Break, nodeRange: new TokenRange(rangeStart, parser.previous())};
}

// **BNF** FOR ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
function parseFor(parser: ParserState): ParseResult<Node_For> {
    if (parser.peek().text !== 'for') {
        return ParseFailure.Mismatch;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.ControlKeyword);

    if (parser.expect('(', TokenHighlight.Operator) === false) {
        return ParseFailure.Pending;
    }

    const initial: Node_ExprStat | Node_Var | undefined = parseVar(parser) ?? parseExprStat(parser);
    if (initial === undefined) {
        parser.error('Expected initial expression statement or variable declaration.');
        return ParseFailure.Pending;
    }

    const result: Mutable<Node_For> = {
        nodeName: NodeName.For,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        initial: initial,
        condition: undefined,
        incrementList: [],
        statement: undefined
    };

    result.condition = expectExprStat(parser);
    if (result.condition === undefined) {
        return appliedNodeEnd(parser, result);
    }

    while (parser.isEnd() === false) {
        if (expectSeparatorOrClose(parser, ',', ')', result.incrementList.length > 0) === BreakOrThrough.Break) {
            break;
        }

        const assign = expectAssign(parser);
        if (assign === undefined) {
            break;
        }

        result.incrementList.push(assign);
    }

    result.statement = expectStatement(parser);
    return appliedNodeEnd(parser, result);
}

// **BNF** FOREACH ::= 'foreach' '(' TYPE IDENTIFIER {',' TYPE INDENTIFIER} ':' ASSIGN ')' STATEMENT
function parseForEach(parser: ParserState): ParseResult<Node_ForEach> {
    if (parser.peek().text !== 'foreach') {
        return ParseFailure.Mismatch;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.ControlKeyword);

    if (parser.expect('(', TokenHighlight.Operator) === false) {
        return ParseFailure.Pending;
    }

    const result: Mutable<Node_ForEach> = {
        nodeName: NodeName.ForEach,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        variables: [],
        statement: undefined,
        assign: undefined
    };

    while (parser.isEnd() === false) {
        if (expectSeparatorOrClose(parser, ',', ':', result.variables.length > 0) === BreakOrThrough.Break) {
            break;
        }

        const variable = parseVariableInForEach(parser);

        if (variable === undefined) {
            parser.error('Invalid variable declaration.');
            return ParseFailure.Pending;
        }

        result.variables.push(variable);
    }

    result.assign = expectAssign(parser);

    if (parser.expect(')', TokenHighlight.Operator) === false) {
        return appliedNodeEnd(parser, result);
    }

    result.statement = expectStatement(parser);

    return appliedNodeEnd(parser, result);
}

// **BNF** WHILE ::= 'while' '(' ASSIGN ')' STATEMENT
function parseWhile(parser: ParserState): ParseResult<Node_While> {
    if (parser.peek().text !== 'while') {
        return ParseFailure.Mismatch;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.ControlKeyword);

    if (parser.expect('(', TokenHighlight.Operator) === false) {
        return ParseFailure.Pending;
    }

    const assign = expectAssign(parser);
    if (assign === undefined) {
        return ParseFailure.Pending;
    }

    const result: Mutable<Node_While> = {
        nodeName: NodeName.While,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        assign: assign,
        statement: undefined
    };

    if (parser.expect(')', TokenHighlight.Operator) === false) {
        return appliedNodeEnd(parser, result);
    }

    result.statement = expectStatement(parser);
    return appliedNodeEnd(parser, result);
}

// **BNF** DOWHILE ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
function parseDoWhile(parser: ParserState): ParseResult<Node_DoWhile> {
    if (parser.peek().text !== 'do') {
        return ParseFailure.Mismatch;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.ControlKeyword);

    const statement = expectStatement(parser);
    if (statement === undefined) {
        return ParseFailure.Pending;
    }

    const result: Mutable<Node_DoWhile> = {
        nodeName: NodeName.DoWhile,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        statement: statement,
        assign: undefined
    };

    if (parser.expect('while', TokenHighlight.ControlKeyword) === false) {
        return appliedNodeEnd(parser, result);
    }

    if (parser.expect('(', TokenHighlight.Operator) === false) {
        return appliedNodeEnd(parser, result);
    }

    result.assign = expectAssign(parser);
    if (result.assign === undefined) {
        return appliedNodeEnd(parser, result);
    }

    if (parser.expect(')', TokenHighlight.Operator) === false) {
        return appliedNodeEnd(parser, result);
    }

    parser.expect(';', TokenHighlight.Operator);
    return appliedNodeEnd(parser, result);
}

// **BNF** IF ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
function parseIf(parser: ParserState): ParseResult<Node_If> {
    if (parser.peek().text !== 'if') {
        return ParseFailure.Mismatch;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.ControlKeyword);

    if (parser.expect('(', TokenHighlight.Operator) === false) {
        return ParseFailure.Pending;
    }

    const assign = expectAssign(parser);
    if (assign === undefined) {
        return ParseFailure.Pending;
    }

    const result: Mutable<Node_If> = {
        nodeName: NodeName.If,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        condition: assign,
        thenStat: undefined,
        elseStat: undefined
    };

    if (parser.expect(')', TokenHighlight.Operator) === false) {
        return appliedNodeEnd(parser, result);
    }

    result.thenStat = expectStatement(parser);
    if (result.thenStat === undefined) {
        return appliedNodeEnd(parser, result);
    }

    if (parser.peek().text === 'else') {
        parser.consume(TokenHighlight.ControlKeyword);

        result.elseStat = expectStatement(parser);
    }

    return appliedNodeEnd(parser, result);
}

function appliedNodeEnd<T extends NodeBase>(parser: ParserState, node: Mutable<T>): T {
    node.nodeRange = new TokenRange(node.nodeRange.start, parser.previous());
    return node;
}

// **BNF** CONTINUE ::= 'continue' ';'
function parseContinue(parser: ParserState): Node_Continue | undefined {
    if (parser.peek().text !== 'continue') {
        return undefined;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.ControlKeyword);
    parser.expect(';', TokenHighlight.Operator);
    return {nodeName: NodeName.Continue, nodeRange: new TokenRange(rangeStart, parser.previous())};
}

// **BNF** EXPRSTAT ::= [ASSIGN] ';'
function parseExprStat(parser: ParserState): Node_ExprStat | undefined {
    const rangeStart = parser.peek();
    if (parser.peek().text === ';') {
        parser.consume(TokenHighlight.Operator);
        return {
            nodeName: NodeName.ExprStat,
            nodeRange: new TokenRange(rangeStart, parser.previous()),
            assign: undefined
        };
    }

    const assign = parseAssign(parser);
    if (assign === undefined) {
        return undefined;
    }

    parser.expect(';', TokenHighlight.Operator);

    return {
        nodeName: NodeName.ExprStat,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        assign: assign
    };
}

function expectExprStat(parser: ParserState): Node_ExprStat | undefined {
    const exprStat = parseExprStat(parser);
    if (exprStat === undefined) {
        parser.error('Expected expression statement.');
    }

    return exprStat;
}

// **BNF** TRY ::= 'try' STATBLOCK 'catch' STATBLOCK
function parseTry(parser: ParserState): ParseResult<Node_Try> {
    if (parser.peek().text !== 'try') {
        return ParseFailure.Mismatch;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.ControlKeyword);

    const tryBlock = expectStatBlock(parser);
    if (tryBlock === undefined) {
        return ParseFailure.Pending;
    }

    const result: Mutable<Node_Try> = {
        nodeName: NodeName.Try,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        tryBlock: tryBlock,
        catchBlock: undefined
    };

    if (parser.expect('catch', TokenHighlight.ControlKeyword) === false) {
        return appliedNodeEnd(parser, result);
    }

    result.catchBlock = expectStatBlock(parser);
    return appliedNodeEnd(parser, result);
}

// **BNF** RETURN ::= 'return' [ASSIGN] ';'
function parseReturn(parser: ParserState): ParseResult<Node_Return> {
    if (parser.peek().text !== 'return') {
        return ParseFailure.Mismatch;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.ControlKeyword);

    const result: Mutable<Node_Return> = {
        nodeName: NodeName.Return,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        assign: undefined
    };

    if (parser.peek().text === ';') {
        parser.consume(TokenHighlight.Operator);
        return appliedNodeEnd(parser, result);
    }

    result.assign = expectAssign(parser);
    if (result.assign === undefined) {
        return appliedNodeEnd(parser, result);
    }

    parser.expect(';', TokenHighlight.Operator);
    return appliedNodeEnd(parser, result);
}

// **BNF** CASE ::= (('case' EXPR) | 'default') ':' {STATEMENT}
function parseCase(parser: ParserState): ParseResult<Node_Case> {
    const rangeStart = parser.peek();

    let expr = undefined;
    if (parser.peek().text === 'case') {
        parser.consume(TokenHighlight.ControlKeyword);

        expr = expectExpr(parser);
        if (expr === undefined) {
            return ParseFailure.Pending;
        }
    } else if (parser.peek().text === 'default') {
        parser.consume(TokenHighlight.ControlKeyword);
    } else {
        return ParseFailure.Mismatch;
    }

    parser.expect(':', TokenHighlight.Operator);

    const statements: Node_Statement[] = [];
    while (parser.isEnd() === false) {
        const statement = parseStatement(parser);
        if (statement === ParseFailure.Mismatch) {
            break;
        }

        if (statement === ParseFailure.Pending) {
            continue;
        }

        statements.push(statement);
    }

    return {
        nodeName: NodeName.Case,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        expr: expr,
        statementList: statements
    };
}

// **BNF** EXPR ::= EXPRTERM {EXPROP EXPRTERM}
function parseExpr(parser: ParserState): Node_Expr | undefined {
    const rangeStart = parser.peek();

    const exprTerm = parseExprTerm(parser);
    if (exprTerm === undefined) {
        return undefined;
    }

    const exprOp = parseExprOp(parser);
    if (exprOp === undefined) {
        return {
            nodeName: NodeName.Expr,
            nodeRange: new TokenRange(rangeStart, parser.previous()),
            head: exprTerm,
            tail: undefined
        };
    }

    const tail = expectExpr(parser);
    if (tail === undefined) {
        return {
            nodeName: NodeName.Expr,
            nodeRange: new TokenRange(rangeStart, parser.previous()),
            head: exprTerm,
            tail: undefined
        };
    }

    return {
        nodeName: NodeName.Expr,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        head: exprTerm,
        tail: {
            operator: exprOp,
            expr: tail
        }
    };
}

function expectExpr(parser: ParserState): Node_Expr | undefined {
    const expr = parseExpr(parser);
    if (expr === undefined) {
        parser.error('Expected expression.');
    }

    return expr;
}

// for optional parameters
function expectExprOrVoid(parser: ParserState): Node_Expr | VoidParameter | undefined {
    if (parser.peek().text === 'void') {
        parser.consume(TokenHighlight.Keyword);
        return voidParameter;
    }

    const expr = parseExpr(parser);
    if (expr === undefined) {
        parser.error('Expected expression.');
    }

    return expr;
}

// **BNF** EXPRTERM ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function parseExprTerm(parser: ParserState) {
    const exprTerm1 = parseExprTerm1(parser);
    if (exprTerm1 !== undefined) {
        return exprTerm1;
    }

    const exprTerm2 = parseExprTerm2(parser);
    if (exprTerm2 !== undefined) {
        return exprTerm2;
    }

    return undefined;
}

// ([TYPE '='] INITLIST)
function parseExprTerm1(parser: ParserState): Node_ExprTerm1 | undefined {
    const rangeStart = parser.peek();

    const type = parseType(parser);
    if (type !== undefined) {
        if (parser.peek().text !== '=') {
            parser.rewindTo(rangeStart);
            return undefined;
        }

        parser.consume(TokenHighlight.Operator);
    }

    const initList = parseInitList(parser);
    if (initList === undefined) {
        parser.rewindTo(rangeStart);
        return undefined;
    }

    return {
        nodeName: NodeName.ExprTerm,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        exprTerm: 1,
        type: type,
        initList: initList
    };
}

// ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function parseExprTerm2(parser: ParserState): Node_ExprTerm2 | undefined {
    const rangeStart = parser.peek();

    const preOps: TokenObject[] = [];
    while (parser.isEnd() === false) {
        const next = parser.peek();
        if (next.isReservedToken() === false || next.property.isExprPreOp === false) {
            break;
        }

        preOps.push(parser.peek());
        parser.consume(TokenHighlight.Operator);
    }

    const exprValue = parseExprValue(parser);
    if (exprValue === ParseFailure.Mismatch) {
        parser.rewindTo(rangeStart);
    }

    if (exprValue === ParseFailure.Mismatch || exprValue === ParseFailure.Pending) {
        return undefined;
    }

    const postOps: Node_ExprPostOp[] = [];
    while (parser.isEnd() === false) {
        const parsed = parseExprPostOp(parser);
        if (parsed === undefined) {
            break;
        }

        postOps.push(parsed);
    }

    return {
        nodeName: NodeName.ExprTerm,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        exprTerm: 2,
        preOps: preOps,
        value: exprValue,
        postOps: postOps
    };
}

// **BNF** EXPRVALUE ::= 'void' | CONSTRUCTORCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
function parseExprValue(parser: ParserState): ParseResult<Node_ExprValue> {
    const cast = parseCast(parser);
    if (cast === ParseFailure.Pending) {
        return ParseFailure.Pending;
    }

    if (cast !== ParseFailure.Mismatch) {
        return cast;
    }

    if (parser.peek().text === '(') {
        parser.consume(TokenHighlight.Operator);

        const assign = expectAssign(parser);
        if (assign === undefined) {
            return ParseFailure.Pending;
        }

        parser.expect(')', TokenHighlight.Operator);
        return assign;
    }

    const literal = parseLiteral(parser);
    if (literal !== undefined) {
        return literal;
    }

    const lambda = parseLambda(parser);
    if (lambda === ParseFailure.Pending) {
        return ParseFailure.Pending;
    }

    if (lambda !== ParseFailure.Mismatch) {
        return lambda;
    }

    const funcCall = parseFuncCall(parser);
    if (funcCall !== undefined) {
        return funcCall;
    }

    const constructCall = parseConstructorCall(parser);
    if (constructCall !== undefined) {
        return constructCall;
    }

    const varAccess = parseVarAccess(parser);
    if (varAccess !== undefined) {
        return varAccess;
    }

    return ParseFailure.Mismatch;
}

// **BNF** CONSTRUCTORCALL ::= TYPE ARGLIST
function parseConstructorCall(parser: ParserState): Node_ConstructorCall | undefined {
    const rangeStart = parser.peek();
    const type = parseType(parser);
    if (type === undefined) {
        return undefined;
    }

    const argList = parseArgList(parser);
    if (argList === undefined) {
        parser.rewindTo(rangeStart);
        return undefined;
    }

    return {
        nodeName: NodeName.ConstructorCall,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        type: type,
        argList: argList
    };
}

// **BNF** EXPRPREOP ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// **BNF** EXPRPOSTOP ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ']') | ARGLIST | '++' | '--'
function parseExprPostOp(parser: ParserState): Node_ExprPostOp | undefined {
    const rangeStart = parser.peek();

    const exprPostOp1 = parseExprPostOp1(parser);
    if (exprPostOp1 !== undefined) {
        return exprPostOp1;
    }

    const exprPostOp2 = parseExprPostOp2(parser);
    if (exprPostOp2 !== undefined) {
        return exprPostOp2;
    }

    const argList = parseArgList(parser);
    if (argList !== undefined) {
        return {
            nodeName: NodeName.ExprPostOp,
            nodeRange: new TokenRange(rangeStart, parser.previous()),
            postOpPattern: 3,
            args: argList
        };
    }

    const maybeOperator = parser.peek().text;
    if (maybeOperator === '++' || maybeOperator === '--') {
        parser.consume(TokenHighlight.Operator);
        return {
            nodeName: NodeName.ExprPostOp,
            nodeRange: new TokenRange(rangeStart, parser.previous()),
            postOpPattern: 4,
            operator: maybeOperator
        };
    }

    return undefined;
}

// ('.' (FUNCCALL | IDENTIFIER))
function parseExprPostOp1(parser: ParserState): Node_ExprPostOp1 | undefined {
    if (parser.peek().text !== '.') {
        return undefined;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.Operator);

    const funcCall = parseFuncCall(parser);
    if (funcCall !== undefined) {
        return {
            nodeName: NodeName.ExprPostOp,
            nodeRange: new TokenRange(rangeStart, parser.previous()),
            postOpPattern: 1,
            member: {access: 'method', node: funcCall}
        };
    }

    const identifier = expectIdentifier(parser, TokenHighlight.Variable);
    return {
        nodeName: NodeName.ExprPostOp,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        postOpPattern: 1,
        member: identifier === undefined ? undefined : {access: 'field', token: identifier}
    };
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
function parseExprPostOp2(parser: ParserState): Node_ExprPostOp2 | undefined {
    if (parser.peek().text !== '[') {
        return undefined;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.Operator);

    const indexingList: OptionalIdentifierAndAssign[] = [];
    while (parser.isEnd() === false) {
        const loopStart = parser.peek();

        const identifier = parseIdentifierWithColon(parser);

        const assign = expectAssign(parser);
        if (assign !== undefined) {
            indexingList.push({identifier: identifier, assign: assign});
        }

        if (expectSeparatorOrClose(parser, ',', ']', indexingList.length > 0) === BreakOrThrough.Break) {
            break;
        }

        if (parser.peek() === loopStart) {
            parser.advance();
        }
    }

    return {
        nodeName: NodeName.ExprPostOp,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        postOpPattern: 2,
        indexingList: indexingList
    };
}

// [IDENTIFIER ':']
function parseIdentifierWithColon(parser: ParserState): TokenObject | undefined {
    if (parser.peek(0).kind === TokenKind.Identifier && parser.peek(1).text === ':') {
        const identifier = parser.peek();
        parser.consume(TokenHighlight.Parameter);
        parser.consume(TokenHighlight.Operator);
        return identifier;
    }

    return undefined;
}

// **BNF** CAST ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
function parseCast(parser: ParserState): ParseResult<Node_Cast> {
    if (parser.peek().text !== 'cast') {
        return ParseFailure.Mismatch;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.Keyword);

    if (parser.expect('<', TokenHighlight.Operator) === false) {
        return ParseFailure.Pending;
    }

    const type = expectType(parser);
    if (type === undefined) {
        return ParseFailure.Pending;
    }

    if (parser.expect('>', TokenHighlight.Operator) === false) {
        return ParseFailure.Pending;
    }

    if (parser.expect('(', TokenHighlight.Operator) === false) {
        return ParseFailure.Pending;
    }

    const assign = expectAssign(parser);
    if (assign === undefined) {
        return ParseFailure.Pending;
    }

    parser.expect(')', TokenHighlight.Operator);

    return {
        nodeName: NodeName.Cast,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        type: type,
        assign: assign
    };
}

// **BNF** LAMBDA ::= 'function' '(' [LAMBDAPARAM {',' LAMBDAPARAM}] ')' STATBLOCK
function parseLambda(parser: ParserState): ParseResult<Node_Lambda> {
    // Detect a lambda by checking whether `{` appears after the closing `)` of the parameter list.
    if (canParseLambda(parser) === false) {
        return ParseFailure.Mismatch;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.Keyword);

    parser.expect('(', TokenHighlight.Operator);

    const result: Mutable<Node_Lambda> = {
        nodeName: NodeName.Lambda,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        paramList: [],
        statBlock: undefined
    };

    while (parser.isEnd() === false) {
        if (expectCommaOrParensClose(parser, result.paramList.length > 0) === BreakOrThrough.Break) {
            break;
        }

        result.paramList.push(parseLambdaParam(parser));
    }

    result.statBlock = expectStatBlock(parser);
    return appliedNodeEnd(parser, result);
}

function canParseLambda(parser: ParserState): boolean {
    if (parser.peek(0).text !== 'function') {
        return false;
    }

    if (parser.peek(1).text !== '(') {
        return false;
    }

    let i = 2;
    while (parser.canPeek(i)) {
        if (parser.peek(i).text === ')') {
            return parser.peek(i + 1).text === '{';
        }

        i++;
    }

    return false;
}

// **BNF** LAMBDAPARAM ::= [TYPE TYPEMODIFIER] [IDENTIFIER]
function parseLambdaParam(parser: ParserState): Node_LambdaParam {
    const rangeStart = parser.peek();

    if (parser.peek(0).kind === TokenKind.Identifier && isCommaOrParensClose(parser.peek(1).text)) {
        const identifier = parser.peek();
        parser.consume(TokenHighlight.Parameter);
        return {
            nodeName: NodeName.LambdaParam,
            nodeRange: new TokenRange(rangeStart, parser.previous()),
            type: undefined,
            typeToken: undefined,
            identifier: identifier
        };
    }

    const type = parseType(parser);
    const typeToken = type !== undefined ? parseTypeModifier(parser) : undefined;
    const identifier = parseIdentifier(parser, TokenHighlight.Parameter);

    return {
        nodeName: NodeName.LambdaParam,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        type: type,
        typeToken: typeToken,
        identifier: identifier
    };
}

// **BNF** LITERAL ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
function parseLiteral(parser: ParserState): Node_Literal | undefined {
    const next = parser.peek();
    if (next.kind === TokenKind.Number) {
        parser.consume(TokenHighlight.Number);
        return {nodeName: NodeName.Literal, nodeRange: new TokenRange(next, next), value: next};
    }

    if (next.kind === TokenKind.String) {
        parser.consume(TokenHighlight.String);
        return {nodeName: NodeName.Literal, nodeRange: new TokenRange(next, next), value: next};
    }

    if (next.text === 'true' || next.text === 'false' || next.text === 'null') {
        parser.consume(TokenHighlight.Keyword);
        return {nodeName: NodeName.Literal, nodeRange: new TokenRange(next, next), value: next};
    }

    return undefined;
}

// **BNF** FUNCCALL ::= SCOPE IDENTIFIER ['<' TYPE {',' TYPE} '>'] ARGLIST
function parseFuncCall(parser: ParserState): Node_FuncCall | undefined {
    const rangeStart = parser.peek();
    const scope = parseScope(parser);

    const identifier = parseIdentifier(parser, TokenHighlight.Function);
    if (identifier === undefined) {
        parser.rewindTo(rangeStart);
        return undefined;
    }

    const typeArguments = parseTemplateTypes(parser) ?? [];

    const argList = parseArgList(parser);
    if (argList === undefined) {
        parser.rewindTo(rangeStart);
        return undefined;
    }

    return {
        nodeName: NodeName.FuncCall,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        scope: scope,
        identifier: identifier,
        argList: argList,
        typeArguments: typeArguments
    };
}

// **BNF** VARACCESS ::= SCOPE IDENTIFIER
function parseVarAccess(parser: ParserState): Node_VarAccess | undefined {
    const rangeStart = parser.peek();
    const scope = parseScope(parser);

    const next = parser.peek();
    if (next.kind !== TokenKind.Identifier) {
        if (scope === undefined) {
            return undefined;
        }

        parser.error('Expected identifier.');
        return {
            nodeName: NodeName.VarAccess,
            nodeRange: new TokenRange(rangeStart, parser.previous()),
            scope: scope,
            identifier: undefined
        };
    }

    const isBuiltin: boolean = scope === undefined && next.text === 'this';
    parser.consume(isBuiltin ? TokenHighlight.Keyword : TokenHighlight.Variable);

    return {
        nodeName: NodeName.VarAccess,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        scope: scope,
        identifier: next
    };
}

// **BNF** ARGLIST ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
function parseArgList(parser: ParserState): Node_ArgList | undefined {
    if (parser.peek().text !== '(') {
        return undefined;
    }

    const rangeStart = parser.peek();
    parser.consume(TokenHighlight.Operator);

    const argList: OptionalIdentifierAndAssign[] = [];
    while (parser.isEnd() === false) {
        if (expectCommaOrParensClose(parser, argList.length > 0) === BreakOrThrough.Break) {
            break;
        }

        const identifier = parseIdentifierWithColon(parser);

        const assign = expectAssign(parser);
        if (assign === undefined) {
            break;
        }

        argList.push({identifier: identifier, assign: assign});
    }

    return {
        nodeName: NodeName.ArgList,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        argList: argList
    };
}

// **BNF** ASSIGN ::= CONDITION [ ASSIGNOP ASSIGN ]
function parseAssign(parser: ParserState): Node_Assign | undefined {
    const rangeStart = parser.peek();

    const condition = parseCondition(parser);
    if (condition === undefined) {
        return undefined;
    }

    const operator = parseAssignOp(parser);

    const result: Mutable<Node_Assign> = {
        nodeName: NodeName.Assign,
        nodeRange: new TokenRange(rangeStart, parser.previous()),
        condition: condition,
        tail: undefined
    };

    if (operator === undefined) {
        return result;
    }

    const assign = expectAssign(parser);
    if (assign === undefined) {
        return result;
    }

    result.tail = {operator: operator, assign: assign};
    result.nodeRange = new TokenRange(rangeStart, parser.previous());

    return result;
}

function expectAssign(parser: ParserState): Node_Assign | undefined {
    const assign = parseAssign(parser);
    if (assign === undefined) {
        parser.error('Expected assignment.');
    }

    return assign;
}

// **BNF** CONDITION ::= EXPR ['?' ASSIGN ':' ASSIGN]
function parseCondition(parser: ParserState): Node_Condition | undefined {
    const rangeStart = parser.peek();

    const expr = parseExpr(parser);
    if (expr === undefined) {
        return undefined;
    }

    const result: Mutable<Node_Condition> = {
        nodeName: NodeName.Condition,
        nodeRange: new TokenRange(rangeStart, rangeStart),
        expr: expr,
        ternary: undefined
    };

    if (parser.peek().text === '?') {
        parser.consume(TokenHighlight.Operator);

        const trueAssign = expectAssign(parser);
        if (trueAssign === undefined) {
            return result;
        }

        parser.expect(':', TokenHighlight.Operator);

        const falseAssign = expectAssign(parser);
        if (falseAssign === undefined) {
            return result;
        }

        result.ternary = {trueAssign: trueAssign, falseAssign: falseAssign};
    }

    result.nodeRange = new TokenRange(rangeStart, parser.previous());
    return result;
}

// **BNF** EXPROP ::= MATHOP | COMPOP | LOGICOP | BITOP
function parseExprOp(parser: ParserState) {
    const rangeStart = parser.peek();

    const next = handleJoinedGreaterThanOperator(parser);
    if (next.isReservedToken() === false) {
        parser.rewindTo(rangeStart);
        return undefined;
    }

    if (next.property.isExprOp === false) {
        parser.rewindTo(rangeStart);
        return parseNotIsOperator(parser);
    }

    parser.consume(next.text === 'is' ? TokenHighlight.Keyword : TokenHighlight.Operator);
    return next;
}

// '!is' requires special handling.
function parseNotIsOperator(parser: ParserState) {
    if (areTokensJoinedBy(parser.peek(), ['!', 'is']) === false) {
        return undefined;
    }

    const coveredRange = new TokenRange(parser.peek(), parser.peek(1));
    parser.consume(TokenHighlight.Keyword);
    parser.consume(TokenHighlight.Keyword);

    return ReservedToken.createVirtual('!is', coveredRange);
}

// **BNF** BITOP ::= '&' | '|' | '^' | '<<' | '>>' | '>>>'

// **BNF** MATHOP ::= '+' | '-' | '*' | '/' | '%' | '**'

// **BNF** COMPOP ::= '==' | '!=' | '<' | '<=' | '>' | '>=' | 'is' | '!is'

// **BNF** LOGICOP ::= '&&' | '||' | '^^' | 'and' | 'or' | 'xor'

// **BNF** ASSIGNOP ::= '=' | '+=' | '-=' | '*=' | '/=' | '|=' | '&=' | '^=' | '%=' | '**=' | '<<=' | '>>=' | '>>>='
function parseAssignOp(parser: ParserState) {
    const rangeStart = parser.peek();

    const next = handleJoinedGreaterThanOperator(parser);
    if (next.isReservedToken() === false || next.property.isAssignOp === false) {
        parser.rewindTo(rangeStart);
        return undefined;
    }

    parser.consume(TokenHighlight.Operator);
    return next;
}

function handleJoinedGreaterThanOperator(parser: ParserState) {
    if (parser.peek().text !== '>') {
        return parser.peek();
    }

    // -----------------------------------------------
    // Tokens that start with `>` need to be merged with the following token
    // because tokenization splits them apart.

    const check = (expected: string[], combinedText: string) => {
        if (areTokensJoinedBy(parser.peek(1), expected) === false) {
            return undefined;
        }

        const coveredRange = new TokenRange(parser.peek(0), parser.peek(expected.length));

        for (let i = 0; i < expected.length; ++i) {
            parser.consume(TokenHighlight.Operator);
        }

        return ReservedToken.createVirtual(combinedText, coveredRange);
    };

    // '>='
    const greaterThanTokenOrEqualToken = check(['='], '>=');
    if (greaterThanTokenOrEqualToken !== undefined) {
        return greaterThanTokenOrEqualToken;
    }

    // '>>>='
    const bitShiftRightArithmeticAssignToken = check(['>', '>', '='], '>>>=');
    if (bitShiftRightArithmeticAssignToken !== undefined) {
        return bitShiftRightArithmeticAssignToken;
    }

    // '>>>'
    const bitShiftRightArithmeticToken = check(['>', '>'], '>>>');
    if (bitShiftRightArithmeticToken !== undefined) {
        return bitShiftRightArithmeticToken;
    }

    // '>>='
    const bitShiftRightAssignToken = check(['>', '='], '>>=');
    if (bitShiftRightAssignToken !== undefined) {
        return bitShiftRightAssignToken;
    }

    // '>>'
    const bitShiftRightToken = check(['>'], '>>');
    if (bitShiftRightToken !== undefined) {
        return bitShiftRightToken;
    }

    return parser.peek();
}

export function parseAfterPreprocess(tokens: TokenObject[]): Node_Script {
    const parser = new ParserState(tokens);
    return parseScript(parser);
}

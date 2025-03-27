import {CodeActionWrapper} from "./utils";
import {SymbolGlobalScope} from "../compiler_analyzer/symbolScope";
import {TextRange} from "../compiler_tokenizer/textLocation";
import {SymbolFunction} from "../compiler_analyzer/symbolObject";
import * as lsp from "vscode-languageserver";
import {FunctionCallInfo} from "../compiler_analyzer/info";

export function codeActionNamedArguments(globalScope: SymbolGlobalScope, range: TextRange): CodeActionWrapper[] {
    for (const info of globalScope.info.functionCall) {
        if (info.callerIdentifier.location.intersects(range)) {
            return [{
                action: {
                    title: 'Convert to named arguments',
                    kind: lsp.CodeActionKind.RefactorRewrite,
                },
                resolver: (action) => {
                    action.edit = {
                        changes: {
                            [info.callerIdentifier.location.path]: executeNamedArgumentsAction(globalScope, info)
                        }
                    };
                }
            }];
        }
    }

    return [];
}

function executeNamedArgumentsAction(globalScope: SymbolGlobalScope, info: FunctionCallInfo) {
    const callerNode = info.callerArgumentsNode;
    if (callerNode === undefined) return [];
    // -----------------------------------------------

    let calleeFunction: SymbolFunction | undefined = undefined;
    for (const reference of globalScope.info.reference) {
        if (reference.toSymbol.isFunction() === false) continue;

        if (reference.fromToken === info.callerIdentifier) {
            calleeFunction = reference.toSymbol;
            break;
        }
    }

    if (calleeFunction === undefined) return [];
    // -----------------------------------------------

    // 'caller' --> '(' --> 'arg[0]' --> ',' ---> 'arg[1]' --> ',' --> ... --> ')'
    // 'caller' --> '(' --> 'name: arg[0]' --> ',' ---> 'name: arg[1]' --> ',' --> ... --> ')'
    const edits: lsp.TextEdit[] = [];
    const calleeeParams = calleeFunction.linkedNode.paramList;
    for (let paramId = 0; paramId < calleeeParams.length; ++paramId) {
        if (calleeeParams[paramId].identifier === undefined) continue;

        if (callerNode.argList.length <= paramId) {
            break;
        }

        if (callerNode.argList[paramId].identifier === undefined) {
            const target = callerNode.argList[paramId].assign.nodeRange.start;
            const name = calleeeParams[paramId].identifier?.text;
            edits.push({
                range: target.location,
                newText: `${name}: ${target.text}`
            });
        }
    }

    // 'caller' --> '(' --> 'name: arg[0]' --> ',' ---> 'name: arg[1]' --> ',' --> ... --> ')'
    // 'caller' --> '(' --> 'name: arg[0]' --> ',' ---> 'name: arg[1]' --> ',' --> ... --> 'name: name, name: name)'
    let tail = '';
    for (let paramId = callerNode.argList.length; paramId < calleeeParams.length; ++paramId) {
        if (calleeeParams[paramId].identifier === undefined) continue;

        if (paramId > 0) {
            tail += ', ';
        }

        const name = calleeeParams[paramId].identifier?.text;
        tail += `${name}: ${name}`;
    }

    if (tail !== '') {
        const closeParentheses = callerNode.nodeRange.end;
        edits.push({
            range: closeParentheses.location,
            newText: tail + closeParentheses.text,
        });
    }

    return edits;
}

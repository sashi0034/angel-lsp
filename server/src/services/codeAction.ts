import {TextLocation} from "../compiler_tokenizer/textLocation";
import {SymbolGlobalScope} from "../compiler_analyzer/symbolScope";
import {ActionHint} from "../compiler_analyzer/actionHint";
import * as languageserver from 'vscode-languageserver';
import * as assert from "node:assert";
import {findScopeContainingPosition} from "./utils";
import {SymbolFunction} from "../compiler_analyzer/symbolObject";
import {ComplementKind} from "../compiler_analyzer/complementHint";
import {NodeArgList} from "../compiler_parser/nodes";

export function provideCodeAction(
    globalScope: SymbolGlobalScope, globalScopeList: SymbolGlobalScope[], location: TextLocation, hint: ActionHint
): languageserver.TextEdit[] {
    switch (hint) {
    case ActionHint.InsertNamedArgument:
        return insertNamedArgument(globalScope, location);
    }

    assert(false);
}

// -----------------------------------------------
function insertNamedArgument(globalScope: SymbolGlobalScope, location: TextLocation) {
    const caretScope = findScopeContainingPosition(globalScope, location.start, location.path);

    let calleeFunction: SymbolFunction | undefined = undefined;
    for (const reference of caretScope.referenceList) {
        if (reference.toSymbol.isFunction() === false) continue;

        if (reference.fromToken.location.intersects(location)) {
            calleeFunction = reference.toSymbol;
            break;
        }
    }

    if (calleeFunction === undefined) return [];
    // -----------------------------------------------

    let callerNode: NodeArgList | undefined;
    for (const completion of globalScope.completionHints) {
        if (completion.complementKind !== ComplementKind.CallerArguments) continue;

        if (completion.boundingLocation.intersects(location) === false) continue;

        callerNode = completion.callerNode;
        break;
    }

    if (callerNode === undefined) return [];
    // -----------------------------------------------

    // 'caller' --> '(' --> 'arg[0]' --> ',' ---> 'arg[1]' --> ',' --> ... --> ')'
    // 'caller' --> '(' --> 'name: arg[0]' --> ',' ---> 'name: arg[1]' --> ',' --> ... --> ')'
    const edits: languageserver.TextEdit[] = [];
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


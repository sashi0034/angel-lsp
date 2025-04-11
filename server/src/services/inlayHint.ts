import {SymbolGlobalScope, SymbolScope} from "../compiler_analyzer/symbolScope";
import {TextLocation} from "../compiler_tokenizer/textLocation";
import {isNodeClassOrInterface} from "../compiler_analyzer/symbolObject";
import * as lsp from "vscode-languageserver/node";
import {NodeName} from '../compiler_parser/nodes';
import {stringifyResolvedType} from "../compiler_analyzer/symbolUtils";

export function provideInlayHint(globalScope: SymbolGlobalScope, location: TextLocation): lsp.InlayHint[] {
    return [
        ...inlayHintOperatorOverloadDefinition(globalScope, location),
        ...inlayHintAutoType(globalScope, location),
        ...inlayHintFunctionCall(globalScope, location)
    ];
}

// -----------------------------------------------

function inlayHintFunctionCall(globalScope: SymbolGlobalScope, location: TextLocation) {
    const result: lsp.InlayHint[] = [];
    for (const info of globalScope.info.functionCall) {
        const callerIdentifier = info.callerIdentifier;
        if (location.intersects(callerIdentifier.location) === false) continue;

        // FIXME: Optimize the search
        const callingReference = globalScope.info.reference.find(reference => reference.fromToken === info.callerIdentifier);
        if (callingReference === undefined) continue;

        const calleeFunction = callingReference.toSymbol;
        if (calleeFunction.isFunction() === false) continue;

        const callerArgs = info.callerArgumentsNode.argList;
        for (let i = 0; i < callerArgs.length; i++) {
            if (callerArgs[i].identifier !== undefined) {
                // Skip if the argument is a named argument
                continue;
            }

            if (callerArgs[i].assign.tail === undefined) {
                const exprHead = callerArgs[i].assign.condition.expr.head;
                if (exprHead.exprTerm === 2 && exprHead.value.nodeName !== NodeName.Literal) {
                    // Skip if the argument may be a variable.
                    continue;
                }
            }

            const paramIdentifier = calleeFunction.linkedNode.paramList[i]?.identifier?.text;
            if (paramIdentifier === undefined) continue;

            result.push({
                position: callerArgs[i].assign.nodeRange.start.location.start,
                label: paramIdentifier + ': '
            });
        }
    }

    return result;
}

// -----------------------------------------------

function inlayHintAutoType(globalScope: SymbolGlobalScope, location: TextLocation) {
    const result: lsp.InlayHint[] = [];
    for (const info of globalScope.info.autoTypeResolution) {
        // TODO: Check with location?

        result.push({
            position: info.autoToken.location.end,
            label: ': ' + stringifyResolvedType(info.resolvedType)
        });
    }

    return result;
}

// -----------------------------------------------

function inlayHintOperatorOverloadDefinition(scope: SymbolScope, location: TextLocation) {
    const result: lsp.InlayHint[] = [];
    if (scope.linkedNode !== undefined && isNodeClassOrInterface(scope.linkedNode)) {
        if (scope.linkedNode.nodeRange.path !== location.path) {
            return [];
        }

        if (scope.linkedNode.nodeRange.getBoundingLocation().intersects(location) === false) {
            // Skip if the class definition is not in the given location
            return [];
        }

        // Iterate over class members in scope
        for (const [key, symbolHolder] of scope.symbolTable) {
            if (symbolHolder.isFunctionHolder() === false) continue;

            const operatorText = operatorOverloads.get(key);
            if (operatorText === undefined) continue;

            for (const symbol of symbolHolder.toList()) {
                if (symbol.linkedNode === undefined) continue;

                if (symbol.linkedNode.nodeRange.getBoundingLocation().intersects(location) === false) {
                    // Skip if the operator overload definition is not in the given location
                    continue;
                }

                // Push the operator overload info, e.g., "int opAdd() 'operator +'"
                const identifier = symbol.linkedNode.identifier;
                result.push({
                    position: identifier.location.end,
                    label: `: ${operatorText} `
                });
            }
        }
    }

    for (const childScope of scope.childScopeTable.values()) {
        if (childScope.isAnonymousScope()) continue;

        result.push(...inlayHintOperatorOverloadDefinition(childScope, location));
    }

    return result;
}

const operatorOverloads = new Map([
    // Prefix unary operators
    ['opNeg', '-'],
    ['opCom', '~'],
    ['opPreInc', '++'],
    ['opPreDec', '--'],

    // Postfix unary operators
    ['opPostInc', '++'],
    ['opPostDec', '--'],

    // Comparison operators
    ['opEquals', '=='], // '==, !=, is, !is'
    ['opCmp', '<=>'], // <, <=, >, >=

    // Assignment operators
    ['opAssign', '='],
    ['opAddAssign', '+='],
    ['opSubAssign', '-='],
    ['opMulAssign', '*='],
    ['opDivAssign', '/='],
    ['opModAssign', '%='],
    ['opPowAssign', '**='],
    ['opAndAssign', '&='],
    ['opOrAssign', '|='],
    ['opXorAssign', '^='],
    ['opShlAssign', '<<='],
    ['opShrAssign', '>>='],
    ['opUShrAssign', '>>>='],

    // Binary operators
    ['opAdd', '+'],
    ['opAdd_r', '+'],
    ['opSub', '-'],
    ['opSub_r', '-'],
    ['opMul', '*'],
    ['opMul_r', '*'],
    ['opDiv', '/'],
    ['opDiv_r', '/'],
    ['opMod', '%'],
    ['opMod_r', '%'],
    ['opPow', '**'],
    ['opPow_r', '**'],
    ['opAnd', '&'],
    ['opAnd_r', '&'],
    ['opOr', '|'],
    ['opOr_r', '|'],
    ['opXor', '^'],
    ['opXor_r', '^'],
    ['opShl', '<<'],
    ['opShl_r', '<<'],
    ['opShr', '>>'],
    ['opShr_r', '>>'],
    ['opUShr', '>>>'],
    ['opUShr_r', '>>>'],

    // Index operators
    ['opIndex', '[-]'],
    ['get_opIndex', '[-]'],
    ['set_opIndex', '[-]'],

    // Functor operator
    ['opCall', '(-)'],

    // Type conversion operators
    ['opConv', 'convert'],
    ['opImplConv', 'convert'],
    ['opCast', 'cast'],
    ['opImplCast', 'cast'],

    // foreach iterator
    ['opForBegin', 'foreach'],
    ['opForNext', 'foreach'],
    ['opForEnd', 'foreach'],
    ['opForValue', 'foreach'],
    ['opForValue0', 'foreach'],
    ['opForValue1', 'foreach'],
    ['opForValue2', 'foreach'],
    ['opForValue3', 'foreach'],
    ['opForValue4', 'foreach'],
    ['opForValue5', 'foreach'],
    ['opForValue6', 'foreach'],
    ['opForValue7', 'foreach'],
    ['opForValue8', 'foreach'],
    ['opForValue9', 'foreach'],
    ['opForValue10', 'foreach'],
    ['opForValue11', 'foreach'],
    ['opForValue12', 'foreach'],
    ['opForValue13', 'foreach'],
    ['opForValue14', 'foreach'],
    ['opForValue15', 'foreach'],
]);

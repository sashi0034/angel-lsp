import {isAnonymousIdentifier, SymbolScope} from "../compiler_analyzer/symbolScope";
import {TextLocation} from "../compiler_tokenizer/textLocation";
import {InlayHint} from "vscode-languageserver-protocol";
import {isNodeClassOrInterface} from "../compiler_analyzer/symbolObject";

export function provideInlineHint(globalScope: SymbolScope, location: TextLocation): InlayHint[] {
    // TODO: Implement more hints

    return hintOperatorOverloadDefinition(globalScope, location);
}

// -----------------------------------------------

function hintOperatorOverloadDefinition(scope: SymbolScope, location: TextLocation) {
    const result: InlayHint[] = [];
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

                // Push the operator overload hint, e.g., "int opAdd() 'operator +'"
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

        result.push(...hintOperatorOverloadDefinition(childScope, location));
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
    ['opEquals', '==, !=, is, !is'],
    ['opCmp', '<, <=, >, >='],

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
    ['opIndex', '[...]'],
    ['get_opIndex', '[...]'],
    ['set_opIndex', '[...]'],

    // Functor operator
    ['opCall', '(...)'],

    // Type conversion operators
    ['opConv', 'convert'],
    ['opImplConv', 'convert'],
    ['opCast', 'cast'],
    ['opImplCast', 'cast'],
]);

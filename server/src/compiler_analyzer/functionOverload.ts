import {NodeName} from '../compiler_parser/nodeObject';
import {analyzerDiagnostic} from './analyzerDiagnostic';
import {FunctionSymbol, FunctionSymbolHolder, isScopePathEquals, SymbolObject} from './symbolObject';
import {SymbolScope} from './symbolScope';
import {normalizeType} from './typeConversion';

function isConversionFunction(symbol: FunctionSymbol): boolean {
    return (
        symbol.identifierText === 'opConv' ||
        symbol.identifierText === 'opImplConv' ||
        symbol.identifierText === 'opCast' ||
        symbol.identifierText === 'opImplCast'
    );
}

function areFunctionsOverloadEquals(lhs: FunctionSymbol, rhs: FunctionSymbol): boolean {
    if (lhs.linkedNode.paramList.params.length !== rhs.linkedNode.paramList.params.length) {
        return false;
    }

    if (lhs.linkedNode.nodeName !== NodeName.FuncDef && rhs.linkedNode.nodeName !== NodeName.FuncDef) {
        if ((lhs.linkedNode.postfixConstToken !== undefined) !== (rhs.linkedNode.postfixConstToken !== undefined)) {
            return false;
        }
    }

    for (let i = 0; i < lhs.linkedNode.paramList.params.length; i++) {
        const lhsParam = lhs.linkedNode.paramList.params[i];
        const rhsParam = rhs.linkedNode.paramList.params[i];
        if (lhsParam.inOutToken?.text !== rhsParam.inOutToken?.text) {
            return false;
        }

        if (lhsParam.isVariadic !== rhsParam.isVariadic) {
            return false;
        }

        if ((lhsParam.type.constToken !== undefined) !== (rhsParam.type.constToken !== undefined)) {
            return false;
        }

        const lhsType = normalizeType(lhs.parameterTypes[i]);
        const rhsType = normalizeType(rhs.parameterTypes[i]);
        if (lhsType === undefined || rhsType === undefined) {
            return false;
        }

        if (lhsType.equals(rhsType) === false) {
            return false;
        }
    }

    if (isConversionFunction(lhs) && isConversionFunction(rhs)) {
        const lhsReturnType = normalizeType(lhs.returnType);
        const rhsReturnType = normalizeType(rhs.returnType);
        if (lhsReturnType === undefined || rhsReturnType === undefined) {
            return false;
        }

        if (lhsReturnType.equals(rhsReturnType) === false) {
            return false;
        }
    }

    return true;
}

function findDuplicateFunctionOverload(
    holder: FunctionSymbolHolder,
    target: FunctionSymbol
): FunctionSymbol | undefined {
    return holder.overloadList.find(candidate => candidate !== target && areFunctionsOverloadEquals(candidate, target));
}

export function checkDuplicateFunctionOverload(scope: SymbolScope, symbol: FunctionSymbol): boolean {
    const holder = scope.lookupSymbol(symbol.identifierText);
    if (!holder?.isFunctionHolder()) {
        return true;
    }

    const duplicate = findDuplicateFunctionOverload(holder, symbol);
    if (duplicate === undefined || isScopePathEquals(duplicate.scopePath, symbol.scopePath) === false) {
        return true;
    }

    analyzerDiagnostic.error(
        symbol.identifierToken.location,
        `Function '${symbol.identifierText}' is already declared with the same signature in this scope.`
    );
    return false;
}

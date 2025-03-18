import {resolveActiveScope, SymbolScope} from "./symbolScope";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {ResolvedType} from "./resolvedType";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {checkTypeCast} from "./typeCast";
import {TokenRange} from "../compiler_tokenizer/tokenRange";
import {SymbolObjectHolder} from "./symbolObject";

export function findConstructorOfType(resolvedType: ResolvedType | undefined): SymbolObjectHolder | undefined {
    if (resolvedType?.scopePath === undefined) {
        return undefined;
    }

    const typeName = resolvedType.typeOrFunc.identifierText;

    // ...
    // |-- class 'TypeName' scope
    //     |-- constructor 'TypeName'

    const classScope = resolveActiveScope(resolvedType.scopePath).lookupScope(typeName);
    return classScope !== undefined ? classScope.lookupSymbol(typeName) : undefined;
}

/**
 * Check if the default constructor call is valid. (e.g., primitive types, enum, Object())
 */
export function checkDefaultConstructorCall(
    callerScope: SymbolScope,
    callerIdentifier: TokenObject,
    callerRange: TokenRange,
    callerArgTypes: (ResolvedType | undefined)[],
    calleeConstructorType: ResolvedType
) {
    const constructorIdentifier = calleeConstructorType.typeOrFunc.identifierToken;
    if (constructorIdentifier?.isVirtual() === false) {
        callerScope.pushReference({toSymbol: calleeConstructorType.typeOrFunc, fromToken: callerIdentifier});
    }

    if (callerArgTypes.length === 0) {
        // Call without arguments
        return calleeConstructorType;
    }

    // -----------------------------------------------

    if (callerArgTypes.length !== 1) {
        analyzerDiagnostic.error(
            callerRange.getBoundingLocation(),
            `Too many initializers for primitive type ${constructorIdentifier.text}`
        );

        return calleeConstructorType;
    }

    // FIXME: Check an object type

    checkTypeCast(callerArgTypes[0], calleeConstructorType, callerRange);
    return calleeConstructorType;
}
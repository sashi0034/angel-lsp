import {resolveActiveScope, SymbolScope} from "./symbolScope";
import {TokenObject} from "../compiler_tokenizer/tokenObject";
import {ResolvedType} from "./resolvedType";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {checkTypeCast} from "./typeCast";
import {TokenRange} from "../compiler_tokenizer/tokenRange";
import {SymbolObjectHolder} from "./symbolObject";
import {stringifyResolvedType} from "./symbolUtils";

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

    // -----------------------------------------------

    const calleeSymbol = calleeConstructorType.typeOrFunc;
    if (calleeSymbol.isType() && calleeSymbol.isPrimitiveOrEnum()) {
        // A primitive type constructor only accepts one argument.
        if (callerArgTypes.length !== 1) {
            const message = callerArgTypes.length === 0
                ? `Primitive type '${constructorIdentifier.text}' requires an argument`
                : `Too many arguments for type '${constructorIdentifier.text}'`;

            analyzerDiagnostic.error(callerRange.getBoundingLocation(), message);
        } else {
            checkTypeCast(callerArgTypes[0], calleeConstructorType, callerRange);
        }

        return calleeConstructorType;
    } else {
        // An object default constructor only accepts zero arguments.
        if (callerArgTypes.length !== 0) {
            const firstArgument = () => stringifyResolvedType(callerArgTypes[0]);
            const message = callerArgTypes.length === 1
                ? `Type '${constructorIdentifier.text}' does not have a constructor that accepts the argument '${firstArgument()}'`
                : `Too many arguments for type '${constructorIdentifier.text}'`;

            analyzerDiagnostic.error(callerRange.getBoundingLocation(), message);
        }

        return calleeConstructorType;
    }
}
import {getActiveGlobalScope, resolveActiveScope, SymbolScope} from './symbolScope';
import {TokenObject} from '../compiler_tokenizer/tokenObject';
import {ResolvedType} from './resolvedType';
import {analyzerDiagnostic} from './analyzerDiagnostic';
import {assertTypeCast} from './typeCast';
import {ConversionMode} from './typeConversion';
import {TokenRange} from '../compiler_tokenizer/tokenRange';
import {SymbolObjectHolder} from './symbolObject';
import {Node_FuncCall, NodeName} from '../compiler_parser/nodeObject';
import {stringifyResolvedType} from './symbolStringifier';
import * as assert from 'node:assert';

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
    callerIdentifier: TokenObject,
    callerRange: TokenRange,
    callerArgTypes: (ResolvedType | undefined)[],
    calleeConstructorType: ResolvedType
) {
    const constructorIdentifier = calleeConstructorType.typeOrFunc.identifierToken;
    if (constructorIdentifier?.isVirtual() === false) {
        getActiveGlobalScope().pushReference({
            toSymbol: calleeConstructorType.typeOrFunc,
            fromToken: callerIdentifier
        });
    }

    // -----------------------------------------------

    const calleeSymbol = calleeConstructorType.typeOrFunc;
    if (calleeSymbol.isType() && calleeSymbol.isPrimitiveOrEnum()) {
        // A primitive type constructor only accepts one argument.
        if (callerArgTypes.length !== 1) {
            const message =
                callerArgTypes.length === 0
                    ? `Primitive type '${constructorIdentifier.text}' requires an argument.`
                    : `Too many arguments for type '${constructorIdentifier.text}'`;

            analyzerDiagnostic.error(callerRange.getBoundingLocation(), message);
        } else {
            assertTypeCast(callerArgTypes[0], calleeConstructorType, callerRange, ConversionMode.FunctionalCast);
        }

        return calleeConstructorType;
    } else {
        // An object type call with one argument can be an explicit value cast, e.g., `Target(source)`.
        if (callerArgTypes.length === 1) {
            assertTypeCast(callerArgTypes[0], calleeConstructorType, callerRange, ConversionMode.FunctionalCast);
        } else if (callerArgTypes.length !== 0) {
            analyzerDiagnostic.error(
                callerRange.getBoundingLocation(),
                `Too many arguments for type '${constructorIdentifier.text}'`
            );
        }

        return calleeConstructorType;
    }
}

export function assertDefaultSuperConstructorCall(scope: SymbolScope, funcCall: Node_FuncCall) {
    assert(funcCall.identifier.text === 'super');

    const callerRange = funcCall.nodeRange;

    const functionScope = scope.takeParentByNode([NodeName.Func]);
    const classScope = functionScope?.takeParentByNode([NodeName.Class]);
    const isInConstructor =
        functionScope?.linkedNode?.nodeName === NodeName.Func && functionScope.linkedNode.head.tag === 'constructor';
    if (functionScope === undefined || classScope === undefined || isInConstructor === false) {
        analyzerDiagnostic.error(
            callerRange.getBoundingLocation(),
            `Cannot call 'super()' in a non-constructor method.`
        );
        return;
    }

    const classSymbol = classScope.parentScope?.lookupSymbol(classScope.key);
    if (!classSymbol?.isType()) {
        analyzerDiagnostic.error(callerRange.getBoundingLocation(), `Class '${classScope.key}' does not exist.`);
        return;
    }

    if (classSymbol.baseList === undefined || classSymbol.baseList.length === 0) {
        analyzerDiagnostic.error(
            callerRange.getBoundingLocation(),
            `Class '${classScope.key}' does not have a base class.`
        );
        return;
    }

    // Succeed in calling the default super constructor.
}

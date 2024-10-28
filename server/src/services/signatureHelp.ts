import {SymbolScope} from "../compile/symbols";
import {Position, SignatureHelp, URI} from "vscode-languageserver";
import {findScopeContainingPosition} from "./serviceHelper";
import {ParameterInformation, SignatureInformation} from "vscode-languageserver-types";
import {isPositionInRange} from "../compile/tokenUtils";
import {ComplementKind} from "../compile/symbolComplement";
import {stringifyDeducedType} from "../compile/symbolUtils";

export function serveSignatureHelp(
    diagnosedScope: SymbolScope, caret: Position, uri: URI
): SignatureHelp {
    const targetScope = findScopeContainingPosition(diagnosedScope, caret, uri);

    const signatures: SignatureInformation[] = [];

    for (const hint of targetScope.completionHints) {
        if (hint.complementKind !== ComplementKind.Arguments) continue;

        // Check if the caller location is at the cursor position in the scope.
        const location = hint.complementLocation;
        if (isPositionInRange(caret, location)) {
            // Return the completion target to be prioritized.
            const expectedCallee = hint.expectedCallee;

            const parameters: ParameterInformation[] = [];

            let signatureLabel = expectedCallee.sourceNode.identifier.text + '(';
            for (let i = 0; i < expectedCallee.sourceNode.paramList.length; i++) {
                const paramIdentifier = expectedCallee.sourceNode.paramList[i];
                const paramType = expectedCallee.parameterTypes[i];

                let label = stringifyDeducedType(paramType);
                if (paramIdentifier.identifier !== undefined) label += ' ' + paramIdentifier.identifier?.text;
                const parameter: ParameterInformation = {label: label};

                if (i > 0) signatureLabel += ', ';
                signatureLabel += label;

                parameters.push(parameter);
            }

            signatureLabel += ')';

            const signature: SignatureInformation = {
                label: signatureLabel,
                parameters: parameters,
                activeParameter: 1
            };

            signatures.push(signature);
        }
    }

    // Return the completion candidates for the symbols in the scope itself and its parent scope.
    // e.g. Defined classes or functions in the scope.
    // for (const scope of [...collectParentScopes(targetScope), targetScope]) {
    //     items.push(...getCompletionSymbolsInScope(scope));
    // }

    return {
        signatures: signatures,
        activeSignature: 0,
        activeParameter: 0 // TODO
    };
}

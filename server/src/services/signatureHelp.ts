import {SymbolFunction, SymbolScope} from "../compile/symbols";
import {Position, SignatureHelp, URI} from "vscode-languageserver";
import {findScopeContainingPosition} from "./serviceHelper";
import {ParameterInformation, SignatureInformation} from "vscode-languageserver-types";
import {isAheadPosition, isPositionInRange} from "../compile/tokenUtils";
import {ComplementKind, CompletionArgument} from "../compile/symbolComplement";
import {stringifyDeducedType} from "../compile/symbolUtils";

export function serveSignatureHelp(
    diagnosedScope: SymbolScope, caret: Position, uri: URI
): SignatureHelp {
    const targetScope = findScopeContainingPosition(diagnosedScope, caret, uri);

    const signatures: SignatureInformation[] = [];

    for (let i = targetScope.completionHints.length - 1; i >= 0; i--) {
        const hint = targetScope.completionHints[i];
        if (hint.complementKind !== ComplementKind.Arguments) continue;

        // Check if the caller location is at the cursor position in the scope.
        const location = hint.complementLocation;
        if (isPositionInRange(caret, location)) {
            let callee = hint.expectedCallee;
            for (; ;) {
                signatures.push(getFunctionSignature(hint, callee, caret));

                if (callee.nextOverload === undefined) break;

                callee = callee.nextOverload;
            }

            break;
        }
    }

    return {
        signatures: signatures,
        // activeSignature: 0,
    };
}

function getFunctionSignature(hint: CompletionArgument, expectedCallee: SymbolFunction, caret: Position) {
    const parameters: ParameterInformation[] = [];

    let activeIndex = 0;

    let signatureLabel = expectedCallee.sourceNode.identifier.text + '(';
    for (let i = 0; i < expectedCallee.sourceNode.paramList.length; i++) {
        const paramIdentifier = expectedCallee.sourceNode.paramList[i];
        const paramType = expectedCallee.parameterTypes[i];

        let label = stringifyDeducedType(paramType);
        if (paramIdentifier.identifier !== undefined) label += ' ' + paramIdentifier.identifier?.text;
        const parameter: ParameterInformation = {label: label};

        if (i > 0) signatureLabel += ', ';
        signatureLabel += label;

        if (i < hint.passingRanges.length && isAheadPosition(caret, hint.passingRanges[i].start.location.start) === false) {
            activeIndex = i;
            if (hint.passingRanges[i].end.next?.text === ',') activeIndex++;
        }

        parameters.push(parameter);
    }

    signatureLabel += ')';

    const signature: SignatureInformation = {
        label: signatureLabel,
        parameters: parameters,
        activeParameter: activeIndex
    };

    return signature;
}
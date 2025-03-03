import {SymbolFunction} from "../compiler_analyzer/symbolObject";
import {Position, SignatureHelp, URI} from "vscode-languageserver";
import {findScopeContainingPosition} from "./serviceHelper";
import {ParameterInformation, SignatureInformation} from "vscode-languageserver-types";
import {ComplementKind, CompletionCallerArgument} from "../compiler_analyzer/symbolComplement";
import {resolveTemplateType, stringifyResolvedType} from "../compiler_analyzer/symbolUtils";
import {SymbolScope} from "../compiler_analyzer/symbolScope";
import {TextPosition} from "../compiler_tokenizer/textLocation";

export function serveSignatureHelp(
    diagnosedScope: SymbolScope, caret: Position, uri: URI
): SignatureHelp {
    const targetScope = findScopeContainingPosition(diagnosedScope, caret, uri);

    const signatures: SignatureInformation[] = [];

    for (let i = 0; i < targetScope.completionHints.length; i++) {
        const hint = targetScope.completionHints[i];
        if (hint.complementKind !== ComplementKind.CallerArguments) continue;

        // Check if the caller location is at the cursor position in the scope.
        const location = hint.complementLocation;
        if (location.positionInRange(caret)) {
            const expectedCallee =
                targetScope.lookupSymbolWithParent(hint.expectedCallee.defToken.text);
            if (expectedCallee?.isFunctionHolder() === false) continue;

            for (const callee of expectedCallee.overloadList) {
                signatures.push(getFunctionSignature(hint, callee, new TextPosition(caret.line, caret.character)));
            }

            break;
        }
    }

    return {
        signatures: signatures,
        // activeSignature: 0,
    };
}

function getFunctionSignature(hint: CompletionCallerArgument, expectedCallee: SymbolFunction, caret: TextPosition) {
    const parameters: ParameterInformation[] = [];

    let activeIndex = 0;

    let signatureLabel = expectedCallee.defNode.identifier.text + '(';
    for (let i = 0; i < expectedCallee.defNode.paramList.length; i++) {
        const paramIdentifier = expectedCallee.defNode.paramList[i];
        const paramType = expectedCallee.parameterTypes[i];

        let label = stringifyResolvedType(resolveTemplateType(hint.templateTranslate, paramType));
        if (paramIdentifier.identifier !== undefined) label += ' ' + paramIdentifier.identifier?.text;
        const parameter: ParameterInformation = {label: label};

        if (i > 0) signatureLabel += ', ';
        signatureLabel += label;

        if (i < hint.passingRanges.length && caret.isAheadOf(hint.passingRanges[i].start.location.start) === false) {
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
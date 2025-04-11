import {ResolvedType} from "./resolvedType";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {TokenRange} from "../compiler_tokenizer/tokenRange";
import {resolveActiveScope} from "./symbolScope";

export function checkForEachIterator(
    iteratorType: ResolvedType | undefined,
    nodeRange: TokenRange
): (ResolvedType | undefined)[] | undefined {
    if (iteratorType === undefined) return undefined;

    if (iteratorType.typeOrFunc.isFunction()) {
        analyzerDiagnostic.error(
            nodeRange.getBoundingLocation(),
            "The iterator type cannot be a function",
        );
        return undefined;
    }

    if (iteratorType.typeOrFunc.membersScopePath === undefined) {
        analyzerDiagnostic.error(
            nodeRange.getBoundingLocation(),
            "Invalid iterator type",
        );
        return undefined;
    }

    const memberScope = resolveActiveScope(iteratorType.typeOrFunc.membersScopePath);

    const opForBegin = memberScope.lookupSymbol('opForBegin');
    const opForEnd = memberScope.lookupSymbol('opForEnd');
    const opForNext = memberScope.lookupSymbol('opForNext');
    if (opForBegin === undefined || opForEnd === undefined || opForNext === undefined) {
        const missing: string[] = [];
        if (opForBegin === undefined) missing.push("'opForBegin'");
        if (opForEnd === undefined) missing.push("'opForEnd'");
        if (opForNext === undefined) missing.push("'opForNext'");

        analyzerDiagnostic.error(
            nodeRange.getBoundingLocation(),
            "The iterator type does not have " + missing.join(", "),
        );
        return undefined;
    }

    const forValueTypes: (ResolvedType | undefined)[] = [];
    for (let i = 0; ; ++i) {
        const opForValue = memberScope.lookupSymbol('opForValue' + i);
        if (opForValue === undefined) break;

        const type = opForValue.isFunctionHolder() ? opForValue.first.returnType : undefined;
        forValueTypes.push(type);
    }

    if (forValueTypes.length === 0) {
        analyzerDiagnostic.error(
            nodeRange.getBoundingLocation(),
            "The iterator type does not have 'opForValue'",
        );
        return undefined;
    }

    return forValueTypes;
}


import {ResolvedType} from './resolvedType';
import {getActiveGlobalScope, resolveActiveScope} from './symbolScope';
import {TokenRange} from '../compiler_tokenizer/tokenRange';
import {ConversionCost, ConversionEvaluation} from './typeConversion';
import {VariableSymbol} from './symbolObject';
import {analyzerDiagnostic} from './analyzerDiagnostic';
import {stringifyResolvedType} from './symbolStringifier';
import {NumberLiteral, NumberToken} from '../compiler_tokenizer/tokenObject';

export function causeTypeConversionSideEffect(
    evaluation: ConversionEvaluation,
    from: ResolvedType | undefined,
    to: ResolvedType | undefined,
    nodeRange?: TokenRange
) {
    if (from === undefined || to === undefined) {
        return false;
    }

    if (evaluation.lambdaTarget !== undefined) {
        // e.g., resolving the lambda target of a lambda expression when it's being converted to a delegate type.
        from.lambdaInfo?.resolve(evaluation.lambdaTarget, nodeRange);
    }

    if (evaluation.resolvedOverload !== undefined && from.attachedAccessSourceFunctionToken !== undefined) {
        // e.g., adding a reference for `my_function` in `@my_funcdef(my_function)
        getActiveGlobalScope().pushReference({
            toSymbol: evaluation.resolvedOverload,
            fromToken: from.attachedAccessSourceFunctionToken
        });
    }

    // Resolve the type of ambiguous enum member.
    if (from.typeOrFunc.isType() && from.typeOrFunc.multipleEnumCandidates !== undefined) {
        const enumScope = resolveActiveScope(to.scopePath ?? []).lookupScope(to.identifierText);
        const enumMember = enumScope?.lookupSymbol(from.typeOrFunc.identifierText);
        if (enumMember?.isVariable()) {
            getActiveGlobalScope().pushReference({
                fromToken: from.typeOrFunc.identifierToken,
                toSymbol: enumMember
            });
        }
    }

    if (nodeRange === undefined) {
        return true;
    }

    const integerLiteralOutOfRange = getOutOfRangeIntegerLiteral(nodeRange, to.identifierText);
    if (integerLiteralOutOfRange !== undefined) {
        analyzerDiagnostic.error(
            nodeRange.getBoundingLocation(),
            `Integer literal '${integerLiteralOutOfRange}' is out of range for '${to.identifierText}'.`
        );
        return true;
    }

    const floatLiteralOutOfRange = getOutOfRangeFloatLiteral(nodeRange, to.identifierText);
    if (floatLiteralOutOfRange !== undefined) {
        analyzerDiagnostic.error(
            nodeRange.getBoundingLocation(),
            `Floating-point literal '${floatLiteralOutOfRange}' is out of range for '${to.identifierText}'.`
        );
        return true;
    }

    const shouldWarn = isRiskyConversionCost(evaluation.cost);
    if (!shouldWarn) {
        return true;
    }

    if (isCommonSafeLiteralConversion(evaluation, to.identifierText, nodeRange)) {
        return true;
    }

    analyzerDiagnostic.error(
        nodeRange.getBoundingLocation(),
        `Possible lossy type conversion from '${stringifyResolvedType(from)}' to '${stringifyResolvedType(to)}'.`
    );

    return true;
}

function getOutOfRangeIntegerLiteral(nodeRange: TokenRange, toinationType: string): bigint | undefined {
    const literal = getSingleNumberLiteral(nodeRange);
    if (literal === undefined) {
        return undefined;
    }

    const intValue = parseIntegerLiteral(literal);
    if (intValue === undefined) {
        return undefined;
    }

    const range = integerTypeRange.get(toinationType);
    if (range === undefined) {
        return undefined;
    }

    if (intValue < range.min || intValue > range.max) {
        return intValue;
    }

    return undefined;
}

function getOutOfRangeFloatLiteral(nodeRange: TokenRange, toinationType: string): string | undefined {
    const literal = getSingleNumberLiteral(nodeRange);
    if (literal === undefined || literal.numberLiteral === NumberLiteral.Integer) {
        return undefined;
    }

    const floatValue = parseFloatLiteral(literal);
    if (floatValue === undefined) {
        return literal.text;
    }

    if (toinationType === 'float') {
        if (Math.abs(floatValue) > float32MaxFinite) {
            return literal.text;
        }

        return undefined;
    }

    if (toinationType === 'double') {
        return undefined;
    }

    const range = integerTypeRange.get(toinationType);
    if (range === undefined) {
        return undefined;
    }

    if (floatValue < Number(range.min) || floatValue > Number(range.max)) {
        return literal.text;
    }

    return undefined;
}

function isRiskyConversionCost(cost: ConversionCost): boolean {
    return (
        cost === ConversionCost.EnumDiffSizeConv ||
        cost === ConversionCost.PrimitiveSizeDownConv ||
        cost === ConversionCost.SignedToUnsignedConv ||
        cost === ConversionCost.UnsignedToSignedConv ||
        cost === ConversionCost.IntToFloatConv ||
        cost === ConversionCost.FloatToIntConv
    );
}

function isCommonSafeLiteralConversion(
    evaluation: ConversionEvaluation,
    toinationType: string,
    nodeRange: TokenRange
): boolean {
    const literal = getSingleNumberLiteral(nodeRange);
    if (literal === undefined) {
        return false;
    }

    if (evaluation.cost === ConversionCost.IntToFloatConv) {
        const intValue = parseIntegerLiteral(literal);
        if (intValue === undefined) {
            return false;
        }

        if (toinationType === 'float') {
            return intValue >= -16777216n && intValue <= 16777216n;
        }

        if (toinationType === 'double') {
            return intValue >= -9007199254740992n && intValue <= 9007199254740992n;
        }

        return false;
    }

    if (evaluation.cost === ConversionCost.FloatToIntConv) {
        const floatValue = parseFloatLiteral(literal);
        if (floatValue === undefined || Number.isInteger(floatValue) === false) {
            return false;
        }

        const range = integerTypeRange.get(toinationType);
        if (range === undefined) {
            return false;
        }

        return floatValue >= Number(range.min) && floatValue <= Number(range.max);
    }

    const intValue = parseIntegerLiteral(literal);
    if (intValue === undefined) {
        return false;
    }

    const range = integerTypeRange.get(toinationType);
    if (range === undefined) {
        return false;
    }

    return intValue >= range.min && intValue <= range.max;
}

function getSingleNumberLiteral(nodeRange: TokenRange): NumberToken | undefined {
    if (nodeRange.start !== nodeRange.end) {
        return undefined;
    }

    if (!nodeRange.start.isNumberToken()) {
        return undefined;
    }

    return nodeRange.start;
}

function parseIntegerLiteral(token: NumberToken): bigint | undefined {
    if (token.numberLiteral !== NumberLiteral.Integer) {
        return undefined;
    }

    const text = token.text;
    try {
        if (text.length >= 2 && text[0] === '0' && (text[1] === 'd' || text[1] === 'D')) {
            return BigInt(text.slice(2));
        }

        return BigInt(text);
    } catch {
        return undefined;
    }
}

function parseFloatLiteral(token: NumberToken): number | undefined {
    if (token.numberLiteral === NumberLiteral.Integer) {
        return undefined;
    }

    let text = token.text;
    if (text.endsWith('f') || text.endsWith('F')) {
        text = text.slice(0, -1);
    }

    const value = Number(text);
    return Number.isFinite(value) ? value : undefined;
}

const integerTypeRange = new Map<string, {min: bigint; max: bigint}>([
    ['int8', {min: -128n, max: 127n}],
    ['uint8', {min: 0n, max: 255n}],
    ['int16', {min: -32768n, max: 32767n}],
    ['uint16', {min: 0n, max: 65535n}],
    ['int', {min: -2147483648n, max: 2147483647n}],
    ['int32', {min: -2147483648n, max: 2147483647n}],
    ['uint', {min: 0n, max: 4294967295n}],
    ['uint32', {min: 0n, max: 4294967295n}],
    ['int64', {min: -9223372036854775808n, max: 9223372036854775807n}],
    ['uint64', {min: 0n, max: 18446744073709551615n}]
]);

const float32MaxFinite = 3.4028234663852886e38;

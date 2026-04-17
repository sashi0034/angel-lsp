import type {TokenObject} from '../compiler_tokenizer/tokenObject';
import type {FunctionSymbolHolder, SymbolObject, TypeSymbol} from './symbolObject';
import type {SymbolScope} from './symbolScope';
import type {TextLocation} from '../compiler_tokenizer/textLocation';
import type {ResolvedType, TemplateMapping} from './resolvedType';
import type {Node_ArgList, Node_ExprPostOp1, Node_Scope} from '../compiler_parser/nodes';
import {getBoundingLocationBetween} from '../compiler_tokenizer/tokenRange';
import {extendTokenLocation} from '../compiler_tokenizer/tokenUtils';

/**
 * Marker for a symbol that references a symbol declared elsewhere.
 */
export interface ReferenceMarker {
    readonly toSymbol: SymbolObject;
    readonly fromToken: TokenObject;
}

/**
 * Location marker within the file where the target scope exists.
 * e.g., the code block inside `{}` in `void fn() { ... }`.
 */
export interface ScopeRegionMarker {
    readonly boundingLocation: TextLocation;
    readonly targetScope: SymbolScope;
}

/**
 * Records an instance member access.
 * e.g., `object.member`, where the target type is used to resolve member completions and references.
 */
export interface InstanceAccessMarker {
    readonly instanceAccessNode: Node_ExprPostOp1;
    readonly targetType: TypeSymbol;
}

export function getInstanceAccessMarkerLocation(marker: InstanceAccessMarker): TextLocation {
    const accessToken = marker.instanceAccessNode.nodeRange.start;
    return getBoundingLocationBetween(
        accessToken, // '.'
        accessToken.getNextOrSelf() // IDENTIFIER
    );
}

/**
 * Records a scope access through namespace or type qualifiers.
 * This is generated for each qualifier token, i.e., `Outer::Inner::$C$` will generate two markers.
 * e.g., resolving or completing symbols after `Outer::Inner::`, where `$C$` is the caret.
 */
export interface ScopeAccessMarker {
    readonly scopeAccessNode: Node_Scope;
    readonly listIndex: number;
    readonly targetScope: SymbolScope;
    readonly tokenAfterScopeAccess: TokenObject | undefined;
}

export function getScopeAccessMarkerToken(marker: ScopeAccessMarker): TokenObject {
    return marker.scopeAccessNode.scopeList[marker.listIndex];
}

export function getScopeAccessMarkerLocation(marker: ScopeAccessMarker): TextLocation {
    // <token[0]> --> '::' --> <token[2]> --> ...
    return extendTokenLocation(getScopeAccessMarkerToken(marker), 0, 3);
}

/**
 * Function call marker that can be used when suggesting possible values.
 * e.g., providing argument suggestions when typing inside a function call `fn($C$)`, where `$C$` is the caret.
 */
export interface FunctionCallMarker {
    readonly callerIdentifier: TokenObject;
    readonly callerArgumentsNode: Node_ArgList;
    readonly calleeFuncHolder: FunctionSymbolHolder;
    readonly calleeTemplateMapping: TemplateMapping | undefined;
}

/**
 * Represents the type resolution information for the auto keyword.
 * e.g., providing the resolved type for the auto keyword.
 */
export interface AutoTypeResolutionMarker {
    readonly autoToken: TokenObject;
    readonly resolvedType: ResolvedType;
}

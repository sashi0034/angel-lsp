// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_script_bnf.html

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
import {Token} from "./tokenizer";

function parseFunc() {
    // TODO: まずは IDENTIFIER PARAMLIST (';' | STATBLOCK)
}

export function processFromTokens(tokens: Token[]) {
}

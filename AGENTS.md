# AGENTS.md

## Project Overview
`angel-lsp` is a Language Server Protocol (LSP) implementation for AngelScript.

## Tech Stack
- **Language**: TypeScript
- **Runtime**: Node.js
- **Build System**: `tsc`

## Project Structure
- `client/`
- `server/src/`
  - `compiler_tokenizer/`
  - `compiler_parser/`
  - `compiler_analyzer/`
  - `inspector/`
  - `services/`
  - `formatter/`
  - `server.ts`
  - `test`

## Grammar & Parser Development
- `server/bnf.txt`
- `server/update_bnf.py`: A developer utility to keep the implementation in sync with the grammar.
  - Updates `// BNF: <definition>` comments in source files to match `bnf.txt`.
  - Automatically inserts missing rule placeholders with `// TODO: IMPLEMENT IT!` to guide development.
  - Marks removed or unknown rules with `// TODO: REMOVE IT!`.

## Additional Rules
- **as.predefined**: Its syntax is almost identical to AngelScript, but differs in that function implementations are not required and only declarations are needed. It can include other predefined modules using directives such as `#include "module.as.predefined"`.

## Build & Test Commands
- **Initial Setup**: `npm install && npm run postinstall`
- **Build**: `npm run compile`
- **Watch**: `npm run watch`
- **Lint**: `npm run lint`
- **Test (Server)**: `cd server && npm test`
- **Test (E2E)**: `npm test`

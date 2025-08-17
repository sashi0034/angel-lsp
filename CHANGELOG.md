# Change Log

## [0.3.52] 2025/08/17

- Support for `#include` of other `*.as.predefined` files inside `as.predefined`

  - For example, you can now write something like:
  ```as
  #include "module.as.predefined"
  ```

- Support for absolute path includes

## [0.3.50] 2025/08/16

- Support for `using namespace` in AngelScript 2.38.0

## [0.3.47] 2025/07/08

- `workspace/diagnostics/refresh` [#195](https://github.com/sashi0034/angel-lsp/pull/195) (Thnaks AlexMorson)

## [0.3.46] 2025/07/03

- Fixed circular include bug reported in #192

## [0.3.39] 2025/03/31

- Debugger support #171 (Thanks Paril)

## [0.3.35] 2025/03/26

- Deprecated the `buitinStringTypes: string[]` setting. Use `buitinStringType: string` instead.
- Added support for include path setting.
- Various other minor changes and improvements.

## [0.3.31] 2025/03/19

- #149

## [0.3.29] 2025/03/17

- [#146](https://github.com/sashi0034/angel-lsp/pull/146), [#145](https://github.com/sashi0034/angel-lsp/pull/145), etc.

## [0.3.28] 2025/03/15

- Fixed bugs.

## [0.3.26] 2025/03/14

- Fixed bugs.

## [0.3.25] 2025/03/13

- Fixed bugs.

## [0.3.23] 2025/03/11

- Add some missing features in AngelScript [#108](https://github.com/sashi0034/angel-lsp/pull/108), [#109](https://github.com/sashi0034/angel-lsp/pull/109), [#110](https://github.com/sashi0034/angel-lsp/pull/110) by Paril

## [0.3.22] 2025/03/10

- [#105](https://github.com/sashi0034/angel-lsp/pull/105), [#106](https://github.com/sashi0034/angel-lsp/pull/106) by Paril

## [0.3.21] 2025/03/04

- Code cleanup.
- Fixed memory leak issues and improved performance.
- Fixes bugs.

## [0.3.19] 2025/02/22

- Fixed some bugs.
- Added a setting 'suppressAnalyzerErrors'.

## [0.3.18] 2025/02/07

- Tentatively fixed to avoid a memory leak problem.

## [0.3.17] 2025/01/19

- Fixed a bug [#71](https://github.com/sashi0034/angel-lsp/pull/71) by Vam-Jam.

## [0.3.16] 2025/01/06

- Support for multiple subsequent metadata declarations [#66](https://github.com/sashi0034/angel-lsp/pull/66) by goulash32
- Fixed some bugs.

## [0.3.15] 2025/01/03

- Fixed some bugs.

## [0.3.14] 2024/12/31

- Fixed a bug in parsing enums [#45](https://github.com/sashi0034/angel-lsp/pull/45) by FnControlOption

## [0.3.13] 2024/12/22

- Added hoistEnumParentScope setting [#42](https://github.com/sashi0034/angel-lsp/pull/42) by Vam-Jam.
- Fixed some bugs [#43](https://github.com/sashi0034/angel-lsp/pull/43), [#44](https://github.com/sashi0034/angel-lsp/pull/44) by Vam-Jam

## [0.3.12] 2024/10/28

- Support for function signature help. [#30](https://github.com/sashi0034/angel-lsp/issues/30)

## [0.3.11] 2024/10/05

- Added settings for builtin array and string types. [#11](https://github.com/sashi0034/angel-lsp/issues/11), [#34](https://github.com/sashi0034/angel-lsp/issues/34)

## [0.3.10] 2024/08/20

- Fixed bugs [#22](https://github.com/sashi0034/angel-lsp/issues/22)

## [0.3.9] - 2024/07/22

- Add settings for implicit mutual inclusion. [#19](https://github.com/sashi0034/angel-lsp/issues/19)

## [0.3.8] - 2024/07/22

Fix README.md

## [0.3.7] - 2024/07/22

- Support for hover to view details on symbols (Experimental)

## [0.3.6] - 2024/07/13

- Fixed bugs [#13](https://github.com/sashi0034/angel-lsp/issues/13), [#14](https://github.com/sashi0034/angel-lsp/issues/14)

## [0.3.5] - 2024/07/13

- Fixed problem [#11](https://github.com/sashi0034/angel-lsp/issues/11)

## [0.3.4] - 2024/06/14

- Fixed formatter bugs and add user settings.

## [0.3.3] - 2024/06/11

- Supports completion and analysis of private and protected fields. [#5](https://github.com/sashi0034/angel-lsp/issues/5)

## [0.3.2] - 2024/06/10

- Fixed bugs [#6](https://github.com/sashi0034/angel-lsp/issues/6)

## [0.3.1] - 2024/06/09

- Parse metadata [#3](https://github.com/sashi0034/angel-lsp/pull/3) by MineBill

## [0.3.0] - 2024/06/04

- Support for `#include` directive (Preview)
- Modified the search method for `as.predefined`
  - Search recursively from the parent directory of the file instead of the root of the workspace directory.
- Fix minor bugs.

## [0.2.0] - 2024/05/10

- Format support (Preview)

## [0.1.7] - 2024/04/11

- Fix parser bugs.

## [0.1.6] - 2024/04/06

- Support for type aliases, getters and setters, etc.
- Fix many bugs.

## [0.1.5] - 2024/04/05

- Support for function handler.

## [0.1.4] - 2024/04/03

- Support for inheritance of classes and interfaces.
- Fixed bugs in templates, etc.

## [0.1.0] - 2024/04/02

- Initial pre-release

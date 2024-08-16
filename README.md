# AngelScript Language Server for VSCode

**This extension provides useful features to make AngelScript development easier and faster.**

![sample.png](https://raw.githubusercontent.com/sashi0034/angel-lsp/main/sample.png)

# Features

This extension parses scripts and provides the following benefits.

- Syntax Highlight for AngelScript
- Autocompletion
- Type Checking
- Go to Definition
- Find References
- Symbol Renaming
- Snippets
- Formatter

> Note: Since it is still under development, some features of AngelScript are not yet fully supported.

# Getting Started

Once installed, the Language Server uses the file `as.predefined` to perform the analysis according to the application you are using.

Create and place `as.predefined` in the workspace directory.

![folder_example.png](https://raw.githubusercontent.com/sashi0034/angel-lsp/main/folder_example.png)

Write type definitions and function definitions for your application in `as.predefined` using the same syntax as in AngelScript.

This will give you symbol completion.

See examples below:
- [as.predefined](./examples/OpenSiv3D/as.predefined) for [OpenSiv3D](https://github.com/Siv3D/OpenSiv3D) (v0.6)


# TODO

These features are still in the development stage.

- Support for import statements
- Hover to view details on symbols
- Add more user settings
- Handler checking
- Code actions
- Debugger

# Issues and Contributions

Reports of problems and feature requests are welcome on [GitHub Issues](https://github.com/sashi0034/angel-lsp/issues)

Also, if you have `as.predefined` for a library you use, committing it as an example is highly appreciated.

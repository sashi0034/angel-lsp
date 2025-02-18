# AngelScript Language Server for VSCode

[![Tests](https://github.com/sashi0034/angel-lsp/actions/workflows/tests.yml/badge.svg)](https://github.com/sashi0034/angel-lsp/actions/workflows/tests.yml)

This is a Language Server for Visual Studio Code that offers features to make AngelScript development easier and faster.

![sample.png](https://raw.githubusercontent.com/sashi0034/angel-lsp/main/sample.png)


# Introduction

While there are already AngelScript Language Server extensions available for VSCode, many of them are platform-specific.
For example, there are excellent Language Servers specialized for specific environments like 
[Unreal Angelscript](https://marketplace.visualstudio.com/items?itemName=Hazelight.unreal-angelscript) and
[Openplanet Angelscript](https://marketplace.visualstudio.com/items?itemName=XertroV.openplanet-angelscript).
Developers working in these environments are encouraged to use those options.

However, if you are looking for a general-purpose Language Server that is not dependent on a particular application, this extension might be useful for you.
This extension aims to serve as a universal Language Server, independent of any specific application that integrates AngelScript.


# Features

The Language Server analyzes AngelScript files within your project and offers the following features:

- Syntax Highlighting for AngelScript
- Autocompletion
- Type Checking
- Go to Definition
- Find References
- Symbol Renaming
- Snippets
- Formatter

> Note: As this project is still under development, there may be bugs or incomplete support for some of these features. Future updates will continue to improve functionality.


# Getting Started

1. Install this extension from the Visual Studio Code Marketplace.

1. Create a file named `as.predefined` in the root directory of your AngelScript project.

   `as.predefined` is a custom file used by this Language Server.

   ![folder_example.png](https://raw.githubusercontent.com/sashi0034/angel-lsp/main/folder_example.png)

1. In `as.predefined`, define your application’s types and functions using AngelScript syntax.

   When analyzing `*.as` files, this Language Server implicitly imports symbols defined in `as.predefined`.

   This allows the Language Server to recognize the custom types and functions defined by your application, enabling autocompletion and type checking.

   You can check actual examples of `as.predefined` below:

    - [OpenSiv3D/as.predefined](./examples/OpenSiv3D/as.predefined) for [OpenSiv3D](https://github.com/Siv3D/OpenSiv3D) (v0.6)

    - [Sven Co-op/as.predefined](./examples/Sven%20Co-op/as.predefined) for [Sven Co-op](https://store.steampowered.com/app/225840/Sven_Coop) by [@DrAbcOfficial](https://github.com/DrAbcOfficial)

# Documentation

- [User Settings](./docs/user_settings.md)


# Unimplemented Features

The following features are currently under development:

- Detailed AngelScript features: Support for `import` and `property` is still incomplete.
- Hover Information: Plans to provide more descriptive symbol details on hover.
- More User Configuration Options
- Enhanced Type Checking: Current support for handlers and arrays is limited.
- Code Actions: Considering features like method signature changes.
- Debugger: While the approach is still undecided, adding a debugger is being explored.


# Issues and Contributions

Bug reports and feature requests are welcome via [GitHub Issues](https://github.com/sashi0034/angel-lsp/issues) .

If you fix a small bug or add an enhancement, feel free to submit a pull request.

Additionally, if you create an `as.predefined` file for your application, contributing it as an example would be greatly appreciated and could be helpful to others.


## Contributors
![GitHub Contributors Image](https://contrib.rocks/image?repo=sashi0034/angel-lsp)


# License

This repository is licensed under the [MIT License](https://github.com/sashi0034/angel-lsp/blob/main/LICENSE).


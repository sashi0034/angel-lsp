# AngelScript Language Server for VSCode

これは、AngelScript の開発をより簡単かつ迅速にするための便利な機能を提供する VSCode のための Language Server です。

![sample.png](https://raw.githubusercontent.com/sashi0034/angel-lsp/main/sample.png)


# 始めに

既存の VSCode 用 AngelScript 拡張機能について、特定のプラットフォームに特化した Language Server はある程度存在しています。

例えば、[Unreal Angelscript](https://marketplace.visualstudio.com/items?itemName=Hazelight.unreal-angelscript) 
や [Openplanet Angelscript](https://marketplace.visualstudio.com/items?itemName=XertroV.openplanet-angelscript)
といったような特定の環境に特化した素晴らしい Language Server があります。
これらのプラットフォームの開発者は是非こちらをご利用ください。

しかし、あなたが特定のアプリケーションに依存しない汎用的な Language Server を探している場合、この拡張機能が役立つかもしれません。

この拡張機能は、AngelScript を組み込んだ特定のアプリケーションに特化するのではない普遍的な Language Server として利用できることを目指しています。


# 機能

Language Server はプロジェクトの AngelScript のファイルを解析し、以下の利点を提供します。

- Syntax Highlight for AngelScript
- Autocompletion
- Type Checking
- Go to Definition
- Find References
- Symbol Renaming
- Snippets
- Formatter

> 注意: まだ開発中のため、これらの機能にバグが存在したり、完全にサポートされていない場合があります。今後の開発で修正していく予定です。

# Getting Started

1. Visual Studio Code Marketplace を通じ、この拡張機能を インストールします。

1. あなたの AngelScript プロジェクトのルートディレクトリに `as.predefined` というファイルを作成します。

   `as.predefined` はこの Language Server のために用いる独自ファイルです。

   ![folder_example.png](https://raw.githubusercontent.com/sashi0034/angel-lsp/main/folder_example.png)

1. `as.predefined` に、AngelScript と同じ構文でアプリケーションで定義された型定義や関数定義を記述します。

   この Language Server は、`*.as` を解析する際、まず `as.predefined` で定義されたシンボルを暗黙的にインポートします。

   これを通して、Language Server はあなたのアプリケーションで定義された情報を考慮して解析を行います。これで、自動補完や型チェックが可能になります。

   以下で実際の `as.predefined` の例を確認できます:

    - [OpenSiv3D/as.predefined](./examples/OpenSiv3D/as.predefined) for [OpenSiv3D](https://github.com/Siv3D/OpenSiv3D) (v0.6)

    - [Sven Co-op/as.predefined](./examples/Sven Co-op/) for [Sven Co-op](https://store.steampowered.com/app/225840/Sven_Coop)


# 未実装の機能

以下の機能は、現在開発中です。

- AngelScript の細かい機能: まだ import や property の対応が不十分です
- ホバー機能: ホバー時にシンボルの詳細を更に分かりやすくする予定です
- より多くのユーザー設定の追加
- より詳細な型チェックの実装: 現在はハンドラーや配列のサポートが不十分です
- コードアクション: メソッドのシグネチャ変更といった機能を検討しています
- デバッガ: どのような形になるかは未定なのですが、将来的にデバッガの実装も検討しています

# Issues と Contributions

問題の報告や機能のリクエストは、[GitHub Issues](https://github.com/sashi0034/angel-lsp/issues) で歓迎しています。

もし小さなバグ修正を行った場合は、是非プルリクエストを送ってください。

また、あなたがアプリケーションの `as.predefined` を作成した場合、それを例としてコミットすることは大変ありがたいです。それは、他のユーザーの助けになります。


# ライセンス

このリポジトリは [MIT ライセンス](https://github.com/sashi0034/angel-lsp/blob/main/LICENSE) の下で公開されています。

import os

# 置換対象と置換後の文字列
target = [
    "'Namespace'",
    "'Enum'",
    "'Class'",
    "'Typedef'",
    "'Func'",
    "'Interface'",
    "'Var'",
    "'Import'",
    "'Funcdef'",
    "'VirtProp'",
    "'Mixin'",
    "'IntfMthd'",
    "'StatBlock'",
    "'ParamList'",
    "'TypeMod'",
    "'Type'",
    "'InitList'",
    "'Scope'",
    "'DataType'",
    "'PrimType'",
    "'FuncAttr'",
    "'Statement'",
    "'Switch'",
    "'Break'",
    "'For'",
    "'While'",
    "'DoWhile'",
    "'If'",
    "'Continue'",
    "'ExprStat'",
    "'Try'",
    "'Return'",
    "'Case'",
    "'Expr'",
    "'ExprTerm'",
    "'ExprValue'",
    "'ConstructCall'",
    "'ExprPreOp'",
    "'ExprPostOp'",
    "'Cast'",
    "'Lambda'",
    "'Literal'",
    "'FuncCall'",
    "'VarAccess'",
    "'ArgList'",
    "'Assign'",
    "'Condition'",
    "'ExprOp'",
    "'BitOp'",
    "'MathOp'",
    "'CompOp'",
    "'LogicOp'",
    "'AssignOp'",
    "'Identifier'",
    "'Number'",
    "'String'",
    "'Bits'",
    "'Comment'",
    "'Whitespace'",
]
replace = [
    "NodeName.Namespace",
    "NodeName.Enum",
    "NodeName.Class",
    "NodeName.Typedef",
    "NodeName.Func",
    "NodeName.Interface",
    "NodeName.Var",
    "NodeName.Import",
    "NodeName.Funcdef",
    "NodeName.VirtProp",
    "NodeName.Mixin",
    "NodeName.IntfMthd",
    "NodeName.StatBlock",
    "NodeName.ParamList",
    "NodeName.TypeMod",
    "NodeName.Type",
    "NodeName.InitList",
    "NodeName.Scope",
    "NodeName.DataType",
    "NodeName.PrimType",
    "NodeName.FuncAttr",
    "NodeName.Statement",
    "NodeName.Switch",
    "NodeName.Break",
    "NodeName.For",
    "NodeName.While",
    "NodeName.DoWhile",
    "NodeName.If",
    "NodeName.Continue",
    "NodeName.ExprStat",
    "NodeName.Try",
    "NodeName.Return",
    "NodeName.Case",
    "NodeName.Expr",
    "NodeName.ExprTerm",
    "NodeName.ExprValue",
    "NodeName.ConstructCall",
    "NodeName.ExprPreOp",
    "NodeName.ExprPostOp",
    "NodeName.Cast",
    "NodeName.Lambda",
    "NodeName.Literal",
    "NodeName.FuncCall",
    "NodeName.VarAccess",
    "NodeName.ArgList",
    "NodeName.Assign",
    "NodeName.Condition",
    "NodeName.ExprOp",
    "NodeName.BitOp",
    "NodeName.MathOp",
    "NodeName.CompOp",
    "NodeName.LogicOp",
    "NodeName.AssignOp",
    "NodeName.Identifier",
    "NodeName.Number",
    "NodeName.String",
    "NodeName.Bits",
    "NodeName.Comment",
    "NodeName.Whitespace",
]


# 置換を実行する関数
def replace_in_file(file_path, target, replace):
    with open(file_path, 'r', encoding='utf-8') as file:
        content = file.read()

    original_content = content
    for t, r in zip(target, replace):
        content = content.replace(t, r)

    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as file:
            file.write(content)
        print(f"Replaced text in {file_path}")


# ファイルを探索し、条件に合うファイルで置換を実行する関数
def search_and_replace(directory, target, replace):
    for root, dirs, files in os.walk(directory):
        for name in files:
            file_path = os.path.join(root, name)
            replace_in_file(file_path, target, replace)


# 'src' ディレクトリ以下で処理を開始
if __name__ == '__main__':
    search_and_replace('src', target, replace)

#include <cassert>
#include <format>
#include <fstream>
#include <string>
#include <string_view>

#include "angelscript.h"

namespace
{
    template <class Stream>
    void printEnumList(const asIScriptEngine* engine, Stream& stream)
    {
        for (int i = 0; i < engine->GetEnumCount(); i++)
        {
            const auto e = engine->GetEnumByIndex(i);
            if (not e) continue;
            const std::string_view ns = e->GetNamespace();
            if (not ns.empty()) stream << std::format("namespace {} {{\n", ns);
            stream << std::format("enum {} {{\n", e->GetName());
            for (int j = 0; j < e->GetEnumValueCount(); ++j)
            {
                stream << std::format("\t{}", e->GetEnumValueByIndex(j, nullptr));
                if (j < e->GetEnumValueCount() - 1) stream << ",";
                stream << "\n";
            }
            stream << "}\n";
            if (not ns.empty()) stream << "}\n";
        }
    }

    template <class Stream>
    void printClassTypeList(const asIScriptEngine* engine, Stream& stream)
    {
        for (int i = 0; i < engine->GetObjectTypeCount(); i++)
        {
            const auto t = engine->GetObjectTypeByIndex(i);
            if (not t) continue;

            const std::string_view ns = t->GetNamespace();
            if (not ns.empty()) stream << std::format("namespace {} {{\n", ns);

            stream << std::format("class {}", t->GetName());
            if (t->GetSubTypeCount() > 0)
            {
                stream << "<";
                for (int sub = 0; sub < t->GetSubTypeCount(); ++sub)
                {
                    if (sub < t->GetSubTypeCount() - 1) stream << ", ";
                    const auto st = t->GetSubType(sub);
                    stream << st->GetName();
                }

                stream << ">";
            }

            stream << "{\n";
            for (int j = 0; j < t->GetBehaviourCount(); ++j)
            {
                asEBehaviours behaviours;
                const auto f = t->GetBehaviourByIndex(j, &behaviours);
                if (behaviours == asBEHAVE_CONSTRUCT
                    || behaviours == asBEHAVE_DESTRUCT)
                {
                    stream << std::format("\t{};\n", f->GetDeclaration(false, true, true));
                }
            }
            for (int j = 0; j < t->GetMethodCount(); ++j)
            {
                const auto m = t->GetMethodByIndex(j);
                stream << std::format("\t{};\n", m->GetDeclaration(false, true, true));
            }
            for (int j = 0; j < t->GetPropertyCount(); ++j)
            {
                stream << std::format("\t{};\n", t->GetPropertyDeclaration(j, true));
            }
            for (int j = 0; j < t->GetChildFuncdefCount(); ++j)
            {
                stream << std::format("\tfuncdef {};\n",
                                      t->GetChildFuncdef(j)->GetFuncdefSignature()->GetDeclaration(false));
            }
            stream << "}\n";
            if (not ns.empty()) stream << "}\n";
        }
    }

    template <class Stream>
    void printGlobalFunctionList(const asIScriptEngine* engine, Stream& stream)
    {
        for (int i = 0; i < engine->GetGlobalFunctionCount(); i++)
        {
            const auto f = engine->GetGlobalFunctionByIndex(i);
            if (not f) continue;
            const std::string_view ns = f->GetNamespace();
            if (not ns.empty()) stream << std::format("namespace {} {{ ", ns);
            stream << std::format("{};", f->GetDeclaration(false, false, true));
            if (not ns.empty()) stream << " }";
            stream << "\n";
        }
    }

    template <class Stream>
    void printGlobalPropertyList(const asIScriptEngine* engine, Stream& stream)
    {
        for (int i = 0; i < engine->GetGlobalPropertyCount(); i++)
        {
            const char* name;
            const char* ns0;
            int type;
            engine->GetGlobalPropertyByIndex(i, &name, &ns0, &type, nullptr, nullptr, nullptr, nullptr);

            const std::string t = engine->GetTypeDeclaration(type, true);
            if (t.empty()) continue;

            std::string_view ns = ns0;
            if (not ns.empty()) stream << std::format("namespace {} {{ ", ns);

            stream << std::format("{} {};", t, name);
            if (not ns.empty()) stream << " }";
            stream << "\n";
        }
    }

    template <class Stream>
    void printGlobalTypedef(const asIScriptEngine* engine, Stream& stream)
    {
        for (int i = 0; i < engine->GetTypedefCount(); ++i)
        {
            const auto type = engine->GetTypedefByIndex(i);
            if (not type) continue;
            const std::string_view ns = type->GetNamespace();
            if (not ns.empty()) stream << std::format("namespace {} {{\n", ns);
            stream << std::format(
                "typedef {} {};\n", engine->GetTypeDeclaration(type->GetTypedefTypeId()), type->GetName());
            if (not ns.empty()) stream << "}\n";
        }
    }
}

/// @brief Generate 'as.predefined' file, which contains all defined symbols in C++. It is used by the language server.
void GenerateScriptPredefined(const asIScriptEngine* engine, const std::string& path)
{
    assert(path.ends_with("as.predefined"));

    std::ofstream stream{path};

    printEnumList(engine, stream);

    printClassTypeList(engine, stream);

    printGlobalFunctionList(engine, stream);

    printGlobalPropertyList(engine, stream);

    printGlobalTypedef(engine, stream);
}

void printGlobalFunctionList(const AngelScript::asIScriptEngine& engine)
{
	for (int i = 0; i < engine.GetGlobalFunctionCount(); i++)
	{
		const auto f = engine.GetGlobalFunctionByIndex(i);
		if (not f) continue;
		const std::string_view ns = f->GetNamespace();
		if (not ns.empty()) std::cout << std::format("namespace {} {{ ", ns);
		std::cout << std::format("{};", f->GetDeclaration(false, false, false));
		if (not ns.empty()) std::cout << " }";
		std::cout << "\n";
	}
}

void printGlobalPropertyList(const AngelScript::asIScriptEngine& engine)
{
	for (int i = 0; i < engine.GetGlobalPropertyCount(); i++)
	{
		const char* name;
		const char* ns0;
		int type;
		engine.GetGlobalPropertyByIndex(i, &name, &ns0, &type, nullptr, nullptr, nullptr, nullptr);
		const auto t = engine.GetTypeInfoById(type);
		if (not t) continue;
		std::string_view ns = ns0;
		if (not ns.empty()) std::cout << std::format("namespace {} {{ ", ns);
		std::cout << std::format("{} {};", t->GetName(), name);
		if (not ns.empty()) std::cout << " }";
		std::cout << "\n";
	}
}

void printClassTypeList(const AngelScript::asIScriptEngine& engine)
{
	for (int i = 0; i < engine.GetObjectTypeCount(); i++)
	{
		const auto t = engine.GetObjectTypeByIndex(i);
		if (not t) continue;
		const std::string_view ns = t->GetNamespace();
		if (not ns.empty()) std::cout << std::format("namespace {} {{\n", ns);
		std::cout << std::format("class {}", t->GetName());
		if (t->GetSubTypeCount() > 0)
		{
			std::cout << "<";
			for (int sub = 0; sub < t->GetSubTypeCount(); ++sub)
			{
				if (sub < t->GetSubTypeCount() - 1) std::cout << ", ";
				const auto st = t->GetSubType(sub);
				std::cout << st->GetName();
			}

			std::cout << ">";
		}
		std::cout << "{\n";
		for (int j = 0; j < t->GetBehaviourCount(); ++j)
		{
			AngelScript::asEBehaviours behaviours;
			const auto f = t->GetBehaviourByIndex(j, &behaviours);
			if (behaviours == AngelScript::asBEHAVE_CONSTRUCT
				|| behaviours == AngelScript::asBEHAVE_DESTRUCT)
			{
				std::cout << std::format("\t{};\n", f->GetDeclaration(false, true, false));
			}
		}
		for (int j = 0; j < t->GetMethodCount(); ++j)
		{
			const auto m = t->GetMethodByIndex(j);
			std::cout << std::format("\t{};\n", m->GetDeclaration(false, true, false));
		}
		for (int j = 0; j < t->GetPropertyCount(); ++j)
		{
			std::cout << std::format("\t{};\n", t->GetPropertyDeclaration(j, true));
		}
		std::cout << "}\n";
		if (not ns.empty()) std::cout << "}\n";
	}
}

void printEnumList(const AngelScript::asIScriptEngine& engine)
{
	for (int i = 0; i < engine.GetEnumCount(); i++)
	{
		const auto e = engine.GetEnumByIndex(i);
		if (not e) continue;
		const std::string_view ns = e->GetNamespace();
		if (not ns.empty()) std::cout << std::format("namespace {} {{\n", ns);
		std::cout << std::format("enum {} {{\n", e->GetName());
		for (int j = 0; j < e->GetEnumValueCount(); ++j)
		{
			std::cout << std::format("\t{}", e->GetEnumValueByIndex(j, nullptr));
			if (j < e->GetEnumValueCount() - 1) std::cout << ",";
			std::cout << "\n";
		}
		std::cout << "}\n";
		if (not ns.empty()) std::cout << "}\n";
	}
}

void printAngelInfo(const AngelScript::asIScriptEngine& engine)
{
	printEnumList(engine);

	printClassTypeList(engine);

	printGlobalFunctionList(engine);

	printGlobalPropertyList(engine);
}

using ValveKeyValue;
/**
 * 1.Nuget install https://github.com/ValveResourceFormat/ValveKeyValue
 * 2.Run the game with the -as_outputdocs launch option to generate asdocs.txt
 * 3.Use https://github.com/cooolbros/vscode-vdf.git formatting asdocs.txt into asdocs.vdf
 * 4.Manually editing as.predefined because some of the syntax of Sven Co-op isn't that strict
 */
string szPath = "./asdocs.vdf";
if (!Path.Exists(szPath))
    return;
using FileStream fs = File.OpenWrite("./as.predefined");
using StreamWriter writer = new(fs);
using var stream = File.OpenRead(szPath);
var kv = KVSerializer.Create(KVSerializationFormat.KeyValues1Text);
KVObject data = kv.Deserialize(stream);

const string defaultLibrary = """
class ref{}
funcdef bool less(const ?&in a, const ?&in b);
class array<T>{
	uint length() const;
	void resize(uint);
	void reverse();
	void insertAt(uint index, const T& in value);
	void insertAt(uint index, const array<T>& arr);
	void insertLast(const T& in);
	void removeAt(uint index);
	void removeLast();
	void removeRange(uint start, uint count);
	void sortAsc();
	void sortAsc(uint startAt, uint count);
	void sortDesc();
	void sortDesc(uint startAt, uint count);
	void sort(const less &in compareFunc, uint startAt = 0, uint count = uint(-1));
	int find(const T& in);
	int find(uint startAt, const T& in);
	int findByRef(const T& in);
	int findByRef(uint startAt, const T& in);
}
class any{
	//The default constructor creates an empty object, and the second initializes the object with the provided value.
	//The int64 and double overloads make sure that all numbers are converted to 64bit before being stored in the object.
	any();
	any(? &in value);
	any(int64 &in value);
	any(double &in value);
	//The assignment operator will copy the contained value from the other object.
	any &opAssign(const any &in other);
	//These methods sets the value in the object.
	//The int64 and double overloads make sure that all numbers are converted to 64bit before being stored in the object.
	void store(? &in value);
	void store(int64 &in value);
	void store(double &in value);
	//These methods retrieve the value stored in the object. The methods will return true if the stored value is compatible with the requested type.
	bool retrieve(? &out value) const;
	bool retrieve(int64 &out value) const;
	bool retrieve(double &out value) const;
}
class dictionary{
	//Sets a key/value pair in the dictionary. If the key already exists, the value will be changed.
	void set(const string &in key, ? &in value);
	void set(const string &in key, int64 &in value);
	void set(const string &in key, double &in value);
	//Retrieves the value corresponding to the key. The methods return false if the key is not found, and in this case the value will maintain its default value based on the type.
	bool get(const string &in key, ? &out value) const;
	bool get(const string &in key, int64 &out value) const;
	bool get(const string &in key, double &out value) const;
	//This method returns an array with all of the existing keys in the dictionary. The order of the keys in the array is undefined.
	array<string> @getKeys() const;
	//Returns true if the key exists in the dictionary.
	bool exists(const string &in key) const;
	//Removes the key and the corresponding value from the dictionary. Returns false if the key wasn't found.
	bool delete(const string &in key);
	//Removes all entries in the dictionary.
	void deleteAll();
	//Returns true if the dictionary doesn't hold any entries.
	bool isEmpty() const;
	//Returns the number of keys in the dictionary.
	uint getSize() const;
}
class dictionaryValue{}
""";
writer.WriteLine(defaultLibrary);

foreach (var obj in data.Children)
{
    switch (obj.Name)
    {
        case "Interfaces":
            {
                foreach (var child in obj.Children)
                {
                    string? namespc = child.GetStringValue("Namespace").ToString();
                    if (namespc != "")
                        writer.WriteLine($"namespace {namespc} {{");
                    writer.WriteLine($"//{child.GetStringValueNoNewLine("Documentation")}");
                    writer.WriteLine($"interface {child.GetStringValue("InterfaceName")} {{");
                    var methods = child.Children.Single(method => method.Name == "Methods");
                    foreach (var m in methods)
                    {
                        writer.WriteLine($"\t{m.GetStringValue("Declaration")};");
                    }
                    writer.WriteLine("}");
                    if (namespc != "")
                        writer.WriteLine("}");
                }
                break;
            }
        case "Classes":
            {
                foreach (var child in obj.Children)
                {
                    string? namespc = child.GetStringValue("Namespace").ToString();
                    if (namespc != "")
                        writer.WriteLine($"namespace {namespc} {{");

                    writer.WriteLine($"//{child.GetStringValueNoNewLine("Documentation")}");
                    writer.WriteLine($"class {child.GetStringValue("ClassName")} {{");
                    var methods = child.Children.Single(method => method.Name == "Methods");
                    foreach (var m in methods)
                    {
                        writer.WriteLine($"\t//{m.GetStringValueNoNewLine("Documentation")}");
                        writer.WriteLine($"\t{m.GetStringValue("Declaration")};");
                    }
                    var props = child.Children.Single(method => method.Name == "Properties");
                    foreach (var m in props)
                    {
                        writer.WriteLine($"\t//{m.GetStringValueNoNewLine("Documentation")}");
                        writer.WriteLine($"\t{m.GetStringValue("Declaration")};");
                    }
                    writer.WriteLine("}");
                    if (namespc != "")
                        writer.WriteLine("}");
                }
                break;
            }
        case "Enums":
            {
                foreach (var child in obj.Children)
                {
                    string? namespc = child.GetStringValue("Namespace").ToString();
                    if (namespc != "")
                        writer.WriteLine($"namespace {namespc} {{");
                    writer.WriteLine($"//{child.GetStringValueNoNewLine("Documentation")}");
                    writer.WriteLine($"enum {child.GetStringValue("Name")} {{");
                    var methods = child.Children.Single(method => method.Name == "Values");
                    int i = 0;
                    foreach (var m in methods)
                    {
                        writer.WriteLine($"\t//{m.GetStringValueNoNewLine("Documentation")}");
                        writer.WriteLine($"\t{m.GetStringValue("Name")} = {m.GetStringValue("Value")}{((i == methods.Count() - 1) ? ' ' : ',')}");
                        i++;
                    }
                    writer.WriteLine("}");
                    if (namespc != "")
                        writer.WriteLine("}");
                }
                break;
            }
        case "Functions":
        case "Properties":
            {
                foreach (var child in obj.Children)
                {
                    string? namespc = child.GetStringValue("Namespace").ToString();
                    writer.WriteLine($"//{child.GetStringValueNoNewLine("Documentation")}");
                    if (namespc != "")
                        writer.Write($"namespace {namespc} {{ ");
                    writer.Write($"{child.GetStringValue("Declaration")};");
                    if (namespc != "")
                        writer.WriteLine(" }");
                    else
                        writer.WriteLine();
                }
                break;
            }
        case "Typedefs":
            {
                foreach (var child in obj.Children)
                {
                    string? namespc = child.GetStringValue("Namespace").ToString();
                    writer.WriteLine($"//{child.GetStringValueNoNewLine("Documentation")}");
                    if (namespc != "")
                        writer.Write($"namespace {namespc} {{ ");
                    writer.Write($"typedef {child.GetStringValue("Type")} {child.GetStringValue("Name")};");
                    if (namespc != "")
                        writer.WriteLine(" }");
                    else
                        writer.WriteLine();
                }
                break;
            }
        case "FuncDefs":
            {
                foreach (var child in obj.Children)
                {
                    string? namespc = child.GetStringValue("Namespace").ToString();
                    writer.WriteLine($"//{child.GetStringValueNoNewLine("Documentation")}");
                    if (namespc != "")
                        writer.Write($"namespace {namespc} {{ ");
                    writer.Write($"funcdef {child.GetStringValue("Name")};");
                    if (namespc != "")
                        writer.WriteLine(" }");
                    else
                        writer.WriteLine();
                }
                break;
            }
    }
}
public static class KVObjectExtend
{
    public static string GetStringValueNoNewLine(this KVObject obj, string key)
    {
        string? raw = obj[key].ToString();
        if (raw != null)
            return raw.Replace("\\t", "\t")
                     .Replace("\\\\", "\\")
                     .Replace("\\\"", "\"")
                     .Replace("\\\'", "\'");
        return "";
    }

    public static string GetStringValue(this KVObject obj, string key)
    {
       string? raw = obj[key].ToString();
       if (raw != null)
            return raw.Replace("\\n", "\n")
                     .Replace("\\t", "\t")
                     .Replace("\\\\", "\\")
                     .Replace("\\\"", "\"")
                     .Replace("\\\'", "\'");
       return "";
    }
}
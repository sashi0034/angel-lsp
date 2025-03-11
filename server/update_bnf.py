import os
import re


def read_bnf_definitions(bnf_filename):
    """
    Reads bnf.txt and returns a dictionary:
       { bnf_name: full_definition_line, ... }
    Blank lines are ignored.
    """
    bnf_dict = {}
    with open(bnf_filename, "r", encoding="utf-8") as f:
        for line in f:
            stripped = line.strip()
            if not stripped:
                # Ignore blank lines
                continue
            # Parse out the BNF name (left side) and store the entire line
            # Example: SCRIPT        ::= {IMPORT | ENUM | ...}
            match = re.match(r"^([A-Za-z0-9_]+)\s*::=.*", stripped)
            if match:
                bnf_name = match.group(1)
                bnf_dict[bnf_name] = stripped
    return bnf_dict


def replace_bnf_in_file(filepath, bnf_dict, usage_dict):
    """
    Reads a file line by line and replaces lines that match
       // BNF: <bnfName>
    with
       // BNF: <bnf_dict[bnfName]>
    if <bnfName> exists in bnf_dict.
    Also updates usage_dict to keep track of how many times each BNF is used.

    Returns True if the file was modified, False otherwise.
    """
    modified = False
    new_lines = []

    # Regex to match lines like: // BNF: SCRIPT
    pattern = re.compile(r"^//\s*BNF:\s+([A-Za-z0-9_]+)\b")

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except (UnicodeDecodeError, PermissionError):
        # If we can't read the file as text, just skip it
        return False

    for line in lines:
        m = pattern.match(line)
        if m:
            bnf_name = m.group(1)
            # If we have this BNF in our dictionary, replace
            if bnf_name in bnf_dict:
                # Mark usage
                usage_dict[bnf_name] += 1
                # Replace the line
                new_line = f"// BNF: {bnf_dict[bnf_name]}\n"
                new_lines.append(new_line)
                modified = True
            else:
                # No known definition for this BNF -> keep line as is (or handle differently)
                new_lines.append(line)
        else:
            new_lines.append(line)

    if modified:
        # Write updated lines back to the file
        with open(filepath, "w", encoding="utf-8") as f:
            f.writelines(new_lines)

    return modified


def main():
    bnf_filename = "bnf.txt"
    if not os.path.isfile(bnf_filename):
        print(f"Error: {bnf_filename} not found.")
        return

    # 1. Read BNF definitions
    bnf_dict = read_bnf_definitions(bnf_filename)
    if not bnf_dict:
        print(f"No valid BNF definitions found in {bnf_filename}.")
        return

    # Create usage dictionary for each BNF definition
    usage_dict = {bnf_name: 0 for bnf_name in bnf_dict}

    # 2. Recursively walk through the current directory
    for root, dirs, files in os.walk("."):
        for name in files:
            # Skip the bnf.txt itself to avoid rewriting it
            if name == bnf_filename:
                continue
            filepath = os.path.join(root, name)
            replace_bnf_in_file(filepath, bnf_dict, usage_dict)

    # 3. After processing, determine if we used any BNF at all
    total_usage = sum(usage_dict.values())
    if total_usage > 0:
        # Print warnings for unused BNF definitions
        for bnf_name, count in usage_dict.items():
            if count == 0:
                print(
                    f"Warning: BNF definition '{bnf_name}' was not used in any source file."
                )
    else:
        # No BNF lines were found/used at all, so do not print warnings
        pass


if __name__ == "__main__":
    main()

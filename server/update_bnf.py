import os
import re
from collections import OrderedDict


def read_bnf_definitions(bnf_filename):
    """
    Reads bnf.txt and returns:
      - bnf_dict: {bnf_name: full_definition_line}
      - ordered_names: [bnf_name in the order they appear]
    """
    bnf_dict = OrderedDict()
    name_pat = re.compile(r"^([A-Za-z0-9_]+)\s*::=.*")
    with open(bnf_filename, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line:
                continue
            m = name_pat.match(line)
            if not m:
                continue
            name = m.group(1)
            bnf_dict[name] = line
    return bnf_dict, list(bnf_dict.keys())


def _is_comment_or_blank(s: str) -> bool:
    t = s.lstrip()
    return (not t) or t.startswith("//")


def _extract_bnf_name_from_after_tag(after: str):
    s = after.strip()
    if "::=" in s:
        left = s.split("::=", 1)[0].strip()
        m = re.match(r"^([A-Za-z0-9_]+)\b", left)
        return m.group(1) if m else None
    m = re.match(r"^([A-Za-z0-9_]+)\b", s)
    return m.group(1) if m else None


def _find_safe_slot_before(lines, right_idx):
    """
    Find a 'safe' insertion slot immediately before a BNF marker at right_idx.
    Safe slot = a contiguous block of comment/blank lines right before right_idx.
    Returns (insert_pos, indent) or None.
    """
    j = right_idx - 1
    while j >= 0 and _is_comment_or_blank(lines[j]):
        j -= 1
    block_start = j + 1
    if block_start < right_idx:
        m = re.match(r"^(\s*)//\s*BNF:\s*(.*)$", lines[right_idx])
        indent = m.group(1) if m else ""
        return (block_start, indent)
    return None


def _ensure_todo_remove_for_unknown(lines, bnf_dict):
    """
    For any '// BNF: ...' whose name is unknown (not in bnf_dict),
    insert an immediate next line '<indent>// TODO: REMOVE IT' if not already present.
    Returns (modified_lines, modified_flag)
    """
    tag_pat = re.compile(r"^(\s*)//\s*BNF:\s*(.*)$")
    modified = False
    i = 0
    while i < len(lines):
        m = tag_pat.match(lines[i])
        if not m:
            i += 1
            continue
        indent, after = m.group(1), m.group(2)
        name = _extract_bnf_name_from_after_tag(after)
        if not name or name not in bnf_dict:
            # Check if the very next line is already the TODO marker (with same indent)
            next_is_todo = False
            if i + 1 < len(lines):
                next_is_todo = lines[i + 1].rstrip("\n").strip() == "##__SHOULD_NOT_MATCH__##"  # sentinel, never true
                # Better check exact text with indent:
                next_is_todo = lines[i + 1] == f"{indent}// TODO: REMOVE IT!\n"
            if not next_is_todo:
                lines[i + 1:i + 1] = [f"{indent}// TODO: REMOVE IT!\n"]
                modified = True
                i += 1  # skip newly inserted TODO
        i += 1
    return lines, modified


def replace_and_insert_bnf_in_file(filepath, bnf_dict, ordered_names, usage_dict):
    """
    - Normalize existing known '// BNF:' lines to canonical full definition.
    - Compute gaps between consecutive known BNF markers (by master order).
    - Insert missing names only at 'safe slots' (comment/blank block) before the right marker.
      If no safe slot for a gap, carry it forward to the next safe slot.
    - After all insertions, scan again and, for any unknown BNF, insert a '// TODO: REMOVE IT' line.
    Returns True if modified.
    """
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except (UnicodeDecodeError, PermissionError):
        return False

    tag_pat = re.compile(r"^(\s*)//\s*BNF:\s*(.*)$")

    # collect known markers
    markers = []
    for i, line in enumerate(lines):
        m = tag_pat.match(line)
        if not m:
            continue
        indent, after = m.group(1), m.group(2)
        name = _extract_bnf_name_from_after_tag(after)
        if name and name in bnf_dict:
            markers.append((i, indent, name))

    if not markers:
        # Even if no known markers, we still want to add TODO for unknown BNFs
        new_lines, unknown_mod = _ensure_todo_remove_for_unknown(lines, bnf_dict)
        if unknown_mod:
            with open(filepath, "w", encoding="utf-8") as f:
                f.writelines(new_lines)
        return unknown_mod

    modified = False

    # 1) normalize existing known markers
    for i, indent, name in markers:
        canonical = f"{indent}// BNF: {bnf_dict[name]}\n"
        if lines[i] != canonical:
            lines[i] = canonical
            modified = True
        usage_dict[name] += 1

    master_pos = {name: pos for pos, name in enumerate(ordered_names)}

    # 2) find gaps between known markers in file order
    markers_sorted = sorted(markers, key=lambda t: t[0])
    gaps = []
    for (ia, inda, na), (ib, indb, nb) in zip(markers_sorted, markers_sorted[1:]):
        pa, pb = master_pos[na], master_pos[nb]
        missing = ordered_names[pa + 1: pb] if pb - pa > 1 else []
        gaps.append((ib, indb, missing))

    # 3) plan insertions with carry-forward to next safe slot
    insertion_plans = []
    carry = []
    for right_idx, right_indent, missing in gaps:
        names_to_place = carry + missing
        if not names_to_place:
            continue
        slot = _find_safe_slot_before(lines, right_idx)
        if slot is None:
            carry = names_to_place
        else:
            insert_pos, indent = slot
            insertion_plans.append((insert_pos, indent, names_to_place))
            carry = []

    # try final slot before the last known marker
    if carry:
        last_idx, last_indent, _ = markers_sorted[-1]
        slot = _find_safe_slot_before(lines, last_idx)
        if slot is not None:
            insert_pos, indent = slot
            insertion_plans.append((insert_pos, indent, carry))
            carry = []

    # 4) apply insertions (bottom-to-top)
    for insert_pos, indent, names in sorted(insertion_plans, key=lambda x: x[0], reverse=True):
        block = []
        for nm in names:
            block.append(f"{indent}// BNF: {bnf_dict[nm]}\n")
            block.append(f"{indent}// TODO: IMPLEMENT IT!\n")
            block.append("\n")
            usage_dict[nm] += 1
        lines[insert_pos:insert_pos] = block
        modified = True

    # 5) ensure TODO: REMOVE IT after unknown BNFs (post-pass on the updated lines)
    lines, unknown_mod = _ensure_todo_remove_for_unknown(lines, bnf_dict)
    if unknown_mod:
        modified = True

    if modified:
        with open(filepath, "w", encoding="utf-8") as f:
            f.writelines(lines)

    return modified


def main():
    bnf_filename = "bnf.txt"
    if not os.path.isfile(bnf_filename):
        print(f"Error: {bnf_filename} not found.")
        return

    bnf_dict, ordered_names = read_bnf_definitions(bnf_filename)
    if not bnf_dict:
        print(f"No valid BNF definitions found in {bnf_filename}.")
        return

    usage_dict = {name: 0 for name in bnf_dict}

    for root, dirs, files in os.walk("."):
        for name in files:
            if name == bnf_filename:
                continue
            path = os.path.join(root, name)
            replace_and_insert_bnf_in_file(path, bnf_dict, ordered_names, usage_dict)

    total_usage = sum(usage_dict.values())
    if total_usage > 0:
        for name, cnt in usage_dict.items():
            if cnt == 0:
                print(f"Warning: BNF definition '{name}' was not used in any source file.")


if __name__ == "__main__":
    main()

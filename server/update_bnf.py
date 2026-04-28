import os
import re
from collections import OrderedDict

BNF_TAG_PREFIX = "// **BNF**"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BNF_TAG_RE = re.compile(r"^(\s*)//\s*\*\*BNF\*\*\s+(.*)$")


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


def _match_bnf_tag(line: str):
    return BNF_TAG_RE.match(line)


def _find_safe_slot_before(lines, right_idx):
    """
    Find a 'safe' insertion slot immediately before a BNF marker at right_idx.
    Safe slot = the contiguous block of non-BNF comment/blank lines right before right_idx.
    Returns (insert_pos, indent) or None.
    """
    m = _match_bnf_tag(lines[right_idx])
    if not m:
        return None

    j = right_idx - 1
    while j >= 0 and _is_comment_or_blank(lines[j]) and not _match_bnf_tag(lines[j]):
        j -= 1
    return (j + 1, m.group(1))


def _find_in_order_marker_indexes(markers, ordered_names):
    """
    Return marker indexes that form the longest subsequence matching bnf.txt order.

    Known markers outside this subsequence are still valid BNF names, but they are
    stale at their current position after a grammar reorder and should be marked
    for removal instead of being used as anchors for missing-rule insertion.
    """
    master_pos = {name: pos for pos, name in enumerate(ordered_names)}
    marker_positions = [master_pos[name] for _, _, name in markers]
    if not marker_positions:
        return set()

    lengths = [1] * len(marker_positions)
    previous = [-1] * len(marker_positions)
    for i, pos in enumerate(marker_positions):
        for j in range(i):
            if marker_positions[j] < pos and lengths[j] + 1 > lengths[i]:
                lengths[i] = lengths[j] + 1
                previous[i] = j

    best = max(range(len(lengths)), key=lambda i: lengths[i])
    keep = set()
    while best != -1:
        keep.add(best)
        best = previous[best]
    return keep


def _ensure_todo_remove(lines, bnf_dict, stale_line_indexes=None):
    """
    For any BNF marker whose name is unknown (not in bnf_dict), or whose line
    index is stale after a grammar reorder,
    insert an immediate next line '<indent>// TODO: REMOVE IT' if not already present.
    Returns (modified_lines, modified_flag)
    """
    stale_line_indexes = stale_line_indexes or set()
    modified = False
    i = 0
    while i < len(lines):
        m = _match_bnf_tag(lines[i])
        if not m:
            i += 1
            continue
        indent, after = m.group(1), m.group(2)
        name = _extract_bnf_name_from_after_tag(after)
        if i in stale_line_indexes or not name or name not in bnf_dict:
            next_is_todo = i + 1 < len(lines) and lines[i + 1].strip() == "// TODO: REMOVE IT!"
            if not next_is_todo:
                lines[i + 1:i + 1] = [f"{indent}// TODO: REMOVE IT!\n"]
                modified = True
                i += 1  # skip newly inserted TODO
        i += 1
    return lines, modified


def replace_and_insert_bnf_in_file(filepath, bnf_dict, ordered_names, usage_dict):
    """
    - Normalize existing in-order BNF marker lines to canonical full definition.
    - Compute gaps between consecutive in-order BNF markers (by master order).
    - Insert missing names immediately before the right marker, preserving any
      non-BNF comment/blank prefix attached to that marker.
    - Mark unknown or stale known markers with a '// TODO: REMOVE IT' line.
    Returns True if modified.
    """
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except (UnicodeDecodeError, PermissionError):
        return False

    # collect known markers
    markers = []
    for i, line in enumerate(lines):
        m = _match_bnf_tag(line)
        if not m:
            continue
        indent, after = m.group(1), m.group(2)
        name = _extract_bnf_name_from_after_tag(after)
        if name and name in bnf_dict:
            markers.append((i, indent, name))

    if not markers:
        # Even if no known markers, we still want to add TODO for unknown BNFs
        new_lines, unknown_mod = _ensure_todo_remove(lines, bnf_dict)
        if unknown_mod:
            with open(filepath, "w", encoding="utf-8") as f:
                f.writelines(new_lines)
        return unknown_mod

    modified = False
    markers = sorted(markers, key=lambda t: t[0])
    in_order_marker_indexes = _find_in_order_marker_indexes(markers, ordered_names)
    active_markers = [marker for idx, marker in enumerate(markers) if idx in in_order_marker_indexes]
    stale_line_indexes = {marker[0] for idx, marker in enumerate(markers) if idx not in in_order_marker_indexes}

    # 1) normalize existing in-order known markers
    for i, indent, name in active_markers:
        canonical = f"{indent}{BNF_TAG_PREFIX} {bnf_dict[name]}\n"
        if lines[i] != canonical:
            lines[i] = canonical
            modified = True
        usage_dict[name] += 1

    master_pos = {name: pos for pos, name in enumerate(ordered_names)}

    # 2) find gaps between in-order known markers in file order
    gaps = []
    for (ia, inda, na), (ib, indb, nb) in zip(active_markers, active_markers[1:]):
        pa, pb = master_pos[na], master_pos[nb]
        missing = ordered_names[pa + 1: pb] if pb - pa > 1 else []
        gaps.append((ib, indb, missing))

    # 3) plan insertions before the right marker of each gap
    insertion_plans = []
    for right_idx, right_indent, missing in gaps:
        if not missing:
            continue
        slot = _find_safe_slot_before(lines, right_idx)
        if slot is not None:
            insert_pos, indent = slot
            insertion_plans.append((insert_pos, indent, missing))

    # 4) apply insertions (bottom-to-top)
    for insert_pos, indent, names in sorted(insertion_plans, key=lambda x: x[0], reverse=True):
        block = []
        for nm in names:
            block.append(f"\n{indent}{BNF_TAG_PREFIX} {bnf_dict[nm]}\n")
            block.append(f"{indent}// TODO: IMPLEMENT IT!\n")
            block.append("\n")
            usage_dict[nm] += 1
        lines[insert_pos:insert_pos] = block
        modified = True

    # 5) ensure TODO: REMOVE IT after unknown or stale BNFs.
    #
    # Insertions are applied bottom-to-top and only before active markers, so an
    # original stale line index shifts by the number of inserted lines above it.
    shifted_stale_line_indexes = set()
    for stale_idx in stale_line_indexes:
        shift = 0
        for insert_pos, _indent, names in insertion_plans:
            if insert_pos <= stale_idx:
                shift += len(names) * 3
        shifted_stale_line_indexes.add(stale_idx + shift)

    lines, remove_mod = _ensure_todo_remove(lines, bnf_dict, shifted_stale_line_indexes)
    if remove_mod:
        modified = True

    if modified:
        with open(filepath, "w", encoding="utf-8") as f:
            f.writelines(lines)

    return modified


def main():
    bnf_filename = os.path.join(SCRIPT_DIR, "bnf.txt")
    if not os.path.isfile(bnf_filename):
        print(f"Error: {bnf_filename} not found.")
        return

    bnf_dict, ordered_names = read_bnf_definitions(bnf_filename)
    if not bnf_dict:
        print(f"No valid BNF definitions found in {bnf_filename}.")
        return

    usage_dict = {name: 0 for name in bnf_dict}

    for root, dirs, files in os.walk(SCRIPT_DIR):
        dirs[:] = [d for d in dirs if d not in {"node_modules", "out"}]
        for name in files:
            path = os.path.join(root, name)
            if path == bnf_filename:
                continue
            replace_and_insert_bnf_in_file(path, bnf_dict, ordered_names, usage_dict)

    total_usage = sum(usage_dict.values())
    if total_usage > 0:
        for name, cnt in usage_dict.items():
            if cnt == 0:
                print(f"Warning: BNF definition '{name}' was not used in any source file.")


if __name__ == "__main__":
    main()

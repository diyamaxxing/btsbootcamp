"""
Heuristic member tagging for videos.json.

Logic:
- Strip the '- BTS (방탄소년단)' suffix from titles before matching
- Match each member's name patterns against the cleaned title
- If 1–3 members detected → tag with those members (solo or unit content)
- If 4+ members detected, or 0 detected → keep all 7 (group default)
- Never overwrite a video that already has fewer than 7 members tagged manually
"""

import json, re, sys
from pathlib import Path

ROOT = Path(__file__).parent.parent

MEMBERS = ["RM", "Jin", "Suga", "J-Hope", "Jimin", "V", "Jungkook"]
ALL_SEVEN = sorted(MEMBERS)

# Patterns ordered carefully — V last because \bV\b is single-letter noisy.
# Each list is OR'd; first match wins for that member.
PATTERNS = {
    "RM":       [r"\bRM\b", r"\bRap\s*Monster\b", r"\bRAPMON\b", r"남준"],
    "Jin":      [r"\bJIN\b", r"\bJin\b", r"석진"],
    "Suga":     [r"\bSUGA\b", r"\bSuga\b", r"\bAgust\s*D\b", r"윤기"],
    "J-Hope":   [r"\bj-?hope\b", r"\bjhope\b", r"호석"],
    "Jimin":    [r"\bJIMIN\b", r"\bJimin\b", r"(?<!\w)JM(?!\w)", r"지민"],
    "Jungkook": [r"\bJUNGKOOK\b", r"\bJungkook\b", r"\bJung\s*Kook\b", r"(?<!\w)JK(?!\w)", r"정국"],
    "V":        [r"\bV's\b", r"\bV\s+(?:PD|solo|show|cam|ver\.?)\b",
                 r"(?:with|&|and)\s+V\b", r"\bby\s+V\b",
                 r",\s*V\s*(?:,|&|\band\b|$)", r"(?:^|\s)V\s*&", r"태형"],
}

STRIP_SUFFIX = re.compile(
    r"\s*[-–]\s*BTS\s*(?:\(방탄소년단\))?\s*$|"
    r"\s*\(방탄소년단\)\s*$",
    re.IGNORECASE,
)


def detect(title: str) -> set[str]:
    cleaned = STRIP_SUFFIX.sub("", title).strip()
    found = set()
    for member, pats in PATTERNS.items():
        for p in pats:
            if re.search(p, cleaned, re.IGNORECASE):
                found.add(member)
                break
    return found


def main(dry_run: bool = True):
    with open(ROOT / "data" / "videos.json") as f:
        videos = json.load(f)

    changes = []

    for v in videos:
        current = sorted(v.get("members") or MEMBERS)
        if current != ALL_SEVEN:
            # already manually tagged — skip
            continue

        found = detect(v["title"])
        if 0 < len(found) <= 3:
            new_members = sorted(found, key=lambda m: MEMBERS.index(m))
            changes.append((v["id"], v["title"][:70], current, new_members))
            if not dry_run:
                v["members"] = new_members

    print(f"{'DRY RUN — ' if dry_run else ''}Found {len(changes)} videos to retag:\n")
    for vid_id, title, old, new in changes:
        print(f"  {vid_id}")
        print(f"    {title}")
        print(f"    {old} → {new}")
        print()

    if not dry_run:
        with open(ROOT / "data" / "videos.json", "w") as f:
            json.dump(videos, f, indent=2, ensure_ascii=False)
        print(f"Written {len(changes)} changes to videos.json")


if __name__ == "__main__":
    dry_run = "--apply" not in sys.argv
    if dry_run:
        print("(Pass --apply to write changes)\n")
    main(dry_run)

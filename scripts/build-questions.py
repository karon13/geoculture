"""Regenerate src/questions.js from data/questions.csv.

Run from the project root:  python3 scripts/build-questions.py
The CSV is the source of truth; editorial columns (note, review status) are not shipped to players.
"""
import csv, json, sys

SRC = "data/questions.csv"
OUT = "src/questions.js"

rows = list(csv.DictReader(open(SRC, encoding="utf-8-sig", newline="")))
questions, seen = [], set()
for r in rows:
    qid = r["id"].strip()
    assert qid and qid not in seen, f"missing or duplicate id: {qid!r}"
    seen.add(qid)
    lat, lng = float(r["latitude"]), float(r["longitude"])
    assert -90 <= lat <= 90 and -180 <= lng <= 180, f"bad coordinates for {qid}"
    source = r["source_url"].strip()
    questions.append({
        "id": qid,
        "category": r["category"].strip().lower(),
        "title": r["work_reference_title_internal"].strip(),
        "prompt": r["prompt"].strip(),
        "place": r["answer_location"].strip(),
        "lat": lat,
        "lng": lng,
        "precision": r["location_precision"].strip(),
        "story": r["story"].strip(),
        "source": source if source.startswith(("http://", "https://")) else "",
    })

header = (
    "// GENERATED from data/questions.csv by scripts/build-questions.py. Edit the CSV, not this file.\n"
    "// category is one of: art | music | books | movies\n"
)
open(OUT, "w", encoding="utf-8").write(
    header + "export const QUESTIONS = " + json.dumps(questions, ensure_ascii=False, indent=1) + ";\n"
)
print(f"wrote {len(questions)} questions to {OUT}")

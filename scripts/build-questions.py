"""Regenerate src/questions.js from data/questions.csv.

Run from the project root:  python3 scripts/build-questions.py
The CSV is the source of truth; editorial columns (note, review status) are not shipped to players.
"""
import csv, json, re, sys
from urllib.parse import urlsplit

SRC = "data/questions.csv"
OUT = "src/questions.js"

# Images are hotlinked, never stored. A question ships an image only when the CSV has a usable https
# image_url; everything else gets image = null and the reveal simply has no picture.
LICENSE_OK = re.compile(r"^(CC BY(-SA)? \d\.\d|CC0 1\.0|Public domain)", re.I)


def image_for(r):
    url = (r.get("image_url") or "").strip()
    if not url.startswith("https://"):
        return None
    host = urlsplit(url).netloc
    # Wikimedia's FilePath address redirects to the original (often 5-20 MB). Asking for a width gets a
    # ready-made thumbnail instead, which is what a phone should download.
    if host == "commons.wikimedia.org" and "Special:FilePath/" in url and "width=" not in url:
        url += ("&" if "?" in url else "?") + "width=1000"
    credit = (r.get("image_attribution") or "").strip()
    if credit.lower().startswith("see ") or credit.lower() in ("", "unknown"):
        credit = ""
    licence = (r.get("image_license") or "").strip()
    page = (r.get("image_source") or "").strip()
    return {
        "url": url,
        "credit": credit,
        # Only a confirmed licence is shown. "Licence to confirm..." is an editorial to-do, not player text.
        "license": licence if LICENSE_OK.match(licence) else "",
        "page": page if page.startswith("https://") else "",
    }


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
        "image": image_for(r),
    })

header = (
    "// GENERATED from data/questions.csv by scripts/build-questions.py. Edit the CSV, not this file.\n"
    "// category is one of: art | music | books | movies\n"
)
open(OUT, "w", encoding="utf-8").write(
    header + "export const QUESTIONS = " + json.dumps(questions, ensure_ascii=False, indent=1) + ";\n"
)
with_image = sum(1 for q in questions if q["image"])
print(f"wrote {len(questions)} questions to {OUT} ({with_image} with an image, {len(questions) - with_image} without)")

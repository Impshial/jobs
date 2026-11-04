"""Import the supplied shortlist workbook locally. Requires Python and openpyxl.

Usage: python scripts/import-shortlist.py path/to/workbook.xlsx
The workbook and personal tracking data never enter the source repository.
"""
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import openpyxl


def text(value):
    return value.isoformat() if isinstance(value, datetime) else str(value).strip() if value is not None else ""


def salary(low, high, basis):
    def number(v):
        return f"{v:,.2f}".rstrip("0").rstrip(".") if isinstance(v, float) else f"{v:,}" if isinstance(v, int) else text(v)
    values = [number(v) for v in (low, high) if v is not None and text(v)]
    return (" – ".join(dict.fromkeys(values)) + " " + text(basis)).strip()


def convert(source):
    workbook = openpyxl.load_workbook(source, data_only=True)
    imported_at = datetime.now(timezone.utc).isoformat()
    jobs, tracked, counts = [], {}, {}
    status_map = {"Applied": "Applied", "Not started": "Saved", "Not Interested": "Not Interested", "Heard From": "Heard From", "Interviewed": "Interviewed", "No Dice": "No Dice", "Saved": "Saved", "Preparing": "Preparing"}
    for name in ("Job shortlist", "Data entry", "Not shortlisted"):
        sheet = workbook[name]
        header_row = next(row for row in sheet.iter_rows() if any(text(c.value) in ("Posting URL", "Position / listing") for c in row))
        headers = [text(c.value) for c in header_row]
        counts[name] = 0
        for row in sheet.iter_rows(min_row=header_row[0].row+1):
            values = [c.value for c in row]
            is_data = name == "Data entry"
            excluded = name == "Not shortlisted"
            employer_idx, title_idx = (0, 1) if excluded else (2, 3) if is_data else (1, 2)
            if not values[employer_idx] or not values[title_idx]:
                continue
            url = text(values[3] if excluded else values[12])
            if not url.startswith(("https://", "http://")):
                raise ValueError(f"Missing listing URL in {name}, row {row[0].row}")
            status = "Not Interested" if excluded else status_map[text(values[0])]
            priority = "Excluded" if excluded else text(values[1] if is_data else values[3])
            checked = "" if excluded else text(values[14])
            job_id = "import-" + hashlib.sha256((name + "|" + url).encode()).hexdigest()[:20]
            notes = text(values[2]) if excluded else next((text(v) for h, v in zip(headers, values) if h.lower() == "your notes"), "")
            description = "\n\n".join(f"{h}: {text(v)}" for h, v in zip(headers, values) if h and h != "Column1" and v is not None and text(v))
            description += f"\n\nImported from {source.name}, worksheet {name}, row {row[0].row}. Verification statements are from the workbook; listings were not rechecked during import."
            location = "Not specified" if excluded else text(values[7])
            job = dict(id=job_id, title=text(values[title_idx]), company=text(values[employer_idx]), location=location,
                       category=("Finance" if "Payable" in text(values[title_idx]) else "Operations") if is_data else "Engineering",
                       type="Not specified", salary="" if excluded else salary(values[4], values[5], values[6]),
                       description=description, url=url, source="Original listing", posted="", remote=not excluded,
                       tags=[name, priority], importedFrom=dict(sheet=name, row=row[0].row, checkedAt=checked, priority=priority))
            if job_id in tracked:
                raise ValueError(f"Duplicate listing in {name}, row {row[0].row}")
            tracked[job_id] = dict(job=job, stage=status, notes=notes, followUp="", savedAt=imported_at)
            # Applied is imported as supplied. The workbook does not provide application dates.
            if not excluded:
                jobs.append(job)
            counts[name] += 1
    data = dict(revision=hashlib.sha256(source.read_bytes()).hexdigest(), sourceName=source.name,
                importedAt=imported_at, jobs=jobs, tracked=tracked)
    return data, counts


if __name__ == "__main__":
    source = Path(sys.argv[1]).resolve()
    data, counts = convert(source)
    destination = Path(__file__).resolve().parent.parent / ".local-runtime" / "imported-jobs.json"
    destination.parent.mkdir(exist_ok=True)
    if destination.exists():
        destination.with_suffix(".previous.json").write_bytes(destination.read_bytes())
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(destination)
    stages = {}
    for item in data["tracked"].values():
        stages[item["stage"]] = stages.get(item["stage"], 0) + 1
    print(json.dumps(dict(sheets=counts, stages=stages, listings=len(data["jobs"]), total=len(data["tracked"]))))

"""Local helper (not shipped): export active tracker rows to seed.csv. Needs openpyxl.
Usage: python tools/export_tracker.py "<xlsx path>" [out.csv]
Only IDs, names, group, status and dates are copied; free-text columns never are."""
import collections
import csv
import datetime
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import server  # noqa: E402
import openpyxl  # noqa: E402

STAGE = {"Belum mulai": "Konsep", "Berjalan": "Pengembangan"}
FRESH_DAYS = 90


def main(src, out):
    ws = openpyxl.load_workbook(src, data_only=True, read_only=True)["Tracker"]
    rows = ws.iter_rows(min_row=5, values_only=True)
    head = [str(h).strip() if h is not None else "" for h in next(rows)]
    ix = {n: head.index(n) for n in ("ID", "Project", "Grup", "Status Terkini", "Update Terakhir", "ID Lama")}
    out_rows, errs, seen = [], [], set()
    for r in rows:
        g = lambda n: r[ix[n]] if len(r) > ix[n] else None
        code = str(g("ID") or "").strip()
        st = str(g("Status Terkini") or "").strip()
        if not code or st not in STAGE:
            continue
        upd = g("Update Terakhir")
        upd = upd.strftime("%Y-%m-%d") if isinstance(upd, (datetime.date, datetime.datetime)) else (str(upd)[:10] if upd else "none")
        # The tracker's own stale flag trips after about two weeks and is set on every active row,
        # so status comes from the age of the last update instead: over FRESH_DAYS (or no date) = At risk.
        try:
            fresh = (datetime.date.today() - datetime.date.fromisoformat(upd)).days <= FRESH_DAYS
        except ValueError:
            fresh = False
        d = {"code": code, "name": str(g("Project") or "").strip()[:200], "type": "NPD",
             "category": str(g("Grup") or "").strip(), "stage": STAGE[st],
             "status": "On track" if fresh else "At risk",
             "owner": "", "site": "", "start_date": "", "target_date": "",
             "progress": 0, "target_saving": 0, "realised_saving": 0,
             "notes": "Tracker status: %s. Last update: %s. Old ID: %s." % (st, upd, str(g("ID Lama") or "").strip())}
        _, e = server.validate(d)
        if e:
            errs.append("%s: %s" % (code, e))
        if code in seen:
            errs.append("%s: duplicate code" % code)
        seen.add(code)
        out_rows.append(d)
    if errs:
        sys.exit("self-check failed:\n" + "\n".join(errs))
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=server.EDIT)
        w.writeheader()
        w.writerows(out_rows)
    print("total", len(out_rows))
    for k in ("category", "stage"):
        print(k, dict(collections.Counter(d[k] for d in out_rows)))
    print("At risk", sum(d["status"] == "At risk" for d in out_rows))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "seed.csv"))

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
v1 = json.loads((ROOT / "cases_v1.json").read_text(encoding="utf-8"))
lines = (ROOT / "fixtures" / "cat.txt").read_text(encoding="utf-8").splitlines()
nonempty = [l for l in lines if l.strip()]

cases = []
for c in v1["cases"]:
    if not c.get("answerable", True):
        cases.append({
            "id": "cat-" + c["id"], "suite": "eval-cats",
            "question": c["question"], "answerable": False, "gold": [],
        })
        continue
    expected = c.get("expected_chunk_ids", [])
    gold = []
    for cid in expected:
        try:
            num = int(cid.lstrip("c"))
        except ValueError:
            continue
        anchor = nonempty[num - 1].strip()
        assert sum(1 for l in nonempty if anchor in l) == 1, f"anchor not unique for {cid}"
        gold.append({"file": "cat.txt", "anchor": anchor})
    cases.append({
        "id": "cat-" + c["id"], "suite": "eval-cats",
        "question": c["question"], "answerable": True,
        "gold": gold, "must_contain": c.get("must_include", []),
    })

mixed = [
    {"id": "mix-001", "question": "How many annual leave days do staff get?", "gold": [{"file": "handbook.pdf", "anchor": "27 days"}], "must_contain": ["27"]},
    {"id": "mix-002", "question": "What ticket is needed for flights over $620?", "gold": [{"file": "handbook.pdf", "anchor": "FIN-7710"}], "must_contain": ["FIN-7710"]},
    {"id": "mix-003", "question": "Which VPN token SKU must be used offsite?", "gold": [{"file": "handbook.pdf", "anchor": "SEC-TOKEN-9X"}], "must_contain": ["SEC-TOKEN-9X"]},
    {"id": "mix-004", "question": "What is the standard monitor SKU and its price in the pricing table?", "gold": [{"file": "pricing.csv", "anchor": "MON-27X4"}], "must_contain": ["MON-27X4"]},
    {"id": "mix-005", "question": "How much does Widget Pro cost?", "gold": [{"file": "pricing.csv", "anchor": "WDG-1001"}], "must_contain": ["49"]},
    {"id": "mix-006", "question": "What is the per-diem rate in the travel policy?", "gold": [{"file": "policy.docx", "anchor": "$62 per day"}], "must_contain": ["62"]},
    {"id": "mix-007", "question": "What laptop SKU is standard issue?", "gold": [{"file": "policy.docx", "anchor": "LAP-8810"}], "must_contain": ["LAP-8810"]},
    {"id": "mix-008", "question": "When is the Northwind launch date?", "gold": [{"file": "notes.txt", "anchor": "2026-09-14"}], "must_contain": ["2026-09-14"]},
    {"id": "mix-009", "question": "What is the rollout ticket in the meeting notes?", "gold": [{"file": "notes.txt", "anchor": "OPS-5510"}], "must_contain": ["OPS-5510"]},
    {"id": "mix-010", "question": "What is the referral bonus?", "gold": [{"file": "handbook.pdf", "anchor": "$1,500"}], "must_contain": ["1,500"]},
    {"id": "mix-011", "question": "What is the monitor price according to the authoritative policy doc?", "gold": [{"file": "policy.docx", "anchor": "$329"}], "must_contain": ["329"]},
    {"id": "mix-012", "question": "Which ticket covers security audit?", "gold": [{"file": "notes.txt", "anchor": "SEC-3301"}], "must_contain": ["SEC-3301"]},
    {"id": "mix-013", "question": "How much is the remote allowance?", "gold": [{"file": "handbook.pdf", "anchor": "$120 per month"}], "must_contain": ["120"]},
    {"id": "mix-014", "question": "What is the price of Gadget Plus?", "gold": [{"file": "pricing.csv", "anchor": "GAD-5555"}], "must_contain": ["99"]},
    {"id": "mix-015", "question": "What is the support ticket for monitor setup?", "gold": [{"file": "handbook.pdf", "anchor": "IT-9152"}], "must_contain": ["IT-9152"]},
    {"id": "mix-u01", "question": "What is the CEO's favourite colour?", "answerable": False, "gold": []},
    {"id": "mix-u02", "question": "How much does a helicopter cost?", "answerable": False, "gold": []},
    {"id": "mix-u03", "question": "What is the stock price of Northwind?", "answerable": False, "gold": []},
    {"id": "mix-u04", "question": "When is the Mars office opening?", "answerable": False, "gold": []},
    {"id": "mix-u05", "question": "Who won the 2024 football final?", "answerable": False, "gold": []},
]
for m in mixed:
    cases.append({"suite": "eval-mixed", "answerable": m.get("answerable", True),
                  "gold": m.get("gold", []), "must_contain": m.get("must_contain", []),
                  "id": m["id"], "question": m["question"]})

for _ in range(5):
    pass

out = {"version": 2, "cases": cases}
(ROOT / "cases.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
print(f"wrote {len(cases)} cases")

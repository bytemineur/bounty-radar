# -*- coding: utf-8 -*-
"""导出看板数据：生成 web/data/bounties.js（script 标签可直接加载，file:// 可用）。"""
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
for p in (_ROOT, _HERE):
    if p not in sys.path:
        sys.path.insert(0, p)

import config
import db

# (数据库列名, 前端字段名)
COLUMNS = [
    ("id", "id"),
    ("court", "court"),
    ("province", "prov"),
    ("city", "city"),
    ("debtor", "debtor"),
    ("case_no", "caseNo"),
    ("subject_amount", "subject"),
    ("reward_ratio", "ratio"),
    ("reward_cap", "cap"),
    ("reward_fixed", "fixed"),
    ("reward_est", "est"),
    ("reward_type", "type"),
    ("publish_date", "pub"),
    ("valid_from", "vfrom"),
    ("valid_to", "vto"),
    ("contact_phone", "phone"),
    ("parse_quality", "q"),
    ("url", "url"),
    ("content", "snip"),
]


def load_rows(conn):
    sql = "SELECT * FROM notices ORDER BY publish_date DESC, id DESC"
    out = []
    for r in conn.execute(sql):
        d = {}
        for col, k in COLUMNS:
            v = r[col]
            if k == "ratio" and v is not None:
                v = round(float(v) * 100, 3)      # 转成百分数便于前端展示
            if k == "snip" and v:
                v = " ".join(str(v).split())[:300]
            d[k] = v
        out.append(d)
    return out


def build_meta(rows):
    provs = {}
    for r in rows:
        p = r.get("prov") or "未识别"
        provs[p] = provs.get(p, 0) + 1
    ests = [r["est"] for r in rows if r.get("est")]
    subs = [r["subject"] for r in rows if r.get("subject")]
    return {
        "generatedAt": __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M"),
        "count": len(rows),
        "provinces": dict(sorted(provs.items(), key=lambda x: -x[1])),
        "sumEst": round(sum(ests), 2) if ests else 0,
        "sumSubject": round(sum(subs), 2) if subs else 0,
        "maxEst": round(max(ests), 2) if ests else 0,
        "medianEst": round(sorted(ests)[len(ests) // 2], 2) if ests else 0,
    }


def export(build_meta_too=True):
    conn = db.connect()
    db.init_db(conn)
    rows = load_rows(conn)
    meta = build_meta(rows) if build_meta_too else {}
    conn.close()

    os.makedirs(os.path.dirname(config.EXPORT_JS), exist_ok=True)
    payload = json.dumps({"meta": meta, "rows": rows}, ensure_ascii=False,
                         separators=(",", ":"))
    with open(config.EXPORT_JS, "w", encoding="utf-8") as f:
        f.write("window.__BOUNTY_DATA__ = ")
        f.write(payload)
        f.write(";\n")

    # 同时导一份纯 JSON，便于其他系统对接
    json_path = os.path.join(os.path.dirname(config.EXPORT_JS), "bounties.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "rows": rows}, f, ensure_ascii=False, indent=1)

    size = os.path.getsize(config.EXPORT_JS) / 1024
    print(f"已导出 {len(rows)} 条 -> {config.EXPORT_JS} ({size:.0f} KB)")
    return len(rows)


if __name__ == "__main__":
    export()

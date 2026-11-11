# -*- coding: utf-8 -*-
"""采集 -> 解析 -> 入库 主流程。"""
import hashlib
import json
import os
import sys
import time
from datetime import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
for p in (_ROOT, _HERE, os.path.join(_ROOT, "ref")):
    if p not in sys.path:
        sys.path.insert(0, p)

import config
import db
import parser
import regions
from http_client import Http
from sources import rmfygg


def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def build_record(raw, province_map=True):
    """源站原始行 -> 完整入库记录。"""
    rec = rmfygg.to_record(raw)
    text = rec["content"]
    info = parser.parse_notice(text, publish_date=rec.get("publish_date") or None)

    prov, city, conf = (None, None, 0.0)
    if province_map:
        prov, city, conf = regions.resolve(rec.get("court") or "")

    # 如果法院名识别不出，尝试从正文地址推断
    if not prov:
        m = parser.PROVINCE_HINT.search(info.get("content_norm", ""))
        if m:
            p2, c2, _ = regions.resolve(m.group(1))
            prov, city = p2 or prov, c2 or city

    rec.update({
        "province": prov,
        "city": city,
        "case_no": info.get("case_no"),
        "debtor": rec.get("debtor") or info.get("debtor") or None,
        "debtor_count": info.get("debtor_count") or 1,
        "subject_amount": info.get("subject_amount"),
        "reward_ratio": info.get("reward_ratio"),
        "reward_cap": info.get("reward_cap"),
        "reward_fixed": info.get("reward_fixed"),
        "reward_est": info.get("reward_est"),
        "reward_type": info.get("reward_type"),
        "valid_from": info.get("valid_from"),
        "valid_to": info.get("valid_to"),
        "contact_phone": info.get("contact_phone"),
        "content_hash": hashlib.md5(text.encode("utf-8")).hexdigest(),
        "parse_quality": info.get("parse_quality"),
        "raw_json": json.dumps(rec.pop("raw_json", {}), ensure_ascii=False),
        "fetched_at": _now(),
        "parsed_at": _now(),
    })
    rec.pop("notice_type", None)
    return rec


def crawl(keywords=None, limit=None, verbose=True):
    keywords = keywords or config.SEARCH_KEYWORDS
    http = Http()
    conn = db.connect()
    db.init_db(conn)

    total_seen, total_new, total_kept = 0, 0, 0
    handled = set()

    for kw in keywords:
        started = _now()
        seen_this, new_this = 0, 0
        if verbose:
            print(f"\n[{kw}] 开始采集…")
        try:
            for raw in rmfygg.iter_keyword(http, kw):
                if limit and total_kept >= limit:
                    break
                sid = str(raw.get("noticeCode") or raw.get("uuid"))
                total_seen += 1
                seen_this += 1
                if sid in handled:
                    continue
                handled.add(sid)

                content = raw.get("noticeContent") or ""
                if config.REQUIRE_BOUNTY_SIGNAL and not parser.looks_like_bounty(content):
                    continue
                rec = build_record(raw)
                is_new = db.upsert(conn, rec)
                total_kept += 1
                if is_new:
                    total_new += 1
                    new_this += 1
                if verbose and total_kept % 25 == 0:
                    conn.commit()
                    print(f"    已处理 {total_kept} 条（新增 {total_new}）")
        except Exception as e:
            print(f"    ! 关键词[{kw}] 采集异常: {e}")
            db.log_crawl(conn, source="rmfygg", keyword=kw, started_at=started,
                         finished_at=_now(), total_seen=seen_this,
                         total_new=new_this, status=f"error: {e}")
            continue

        conn.commit()
        db.log_crawl(conn, source="rmfygg", keyword=kw, started_at=started,
                     finished_at=_now(), total_seen=seen_this,
                     total_new=new_this, status="ok")
        if verbose:
            print(f"[{kw}] 扫描 {seen_this} 条，新增 {new_this} 条")
        if limit and total_kept >= limit:
            if verbose:
                print(f"\n已达条数上限 {limit}，停止。")
            break

    conn.commit()
    s = db.stats(conn)
    conn.close()
    if verbose:
        print("\n" + "=" * 52)
        print(f"本次扫描 {total_seen} 条，入库 {total_kept} 条，新增 {total_new} 条")
        print(f"数据库共 {s['n']} 条 | 有标的 {s['has_amount']} | "
              f"有比例 {s['has_ratio']} | 可估算奖励 {s['has_est']}")
        print("=" * 52)
    return total_new


def reparse_all(verbose=True):
    """重新解析库内全部记录（改进正则后使用）。"""
    conn = db.connect()
    db.init_db(conn)
    rows = conn.execute("SELECT source_id, content, publish_date, court, debtor, url FROM notices").fetchall()
    n = 0
    for r in rows:
        fake_raw = {
            "noticeCode": r["source_id"], "uuid": "",
            "court": r["court"], "tosendPeople": r["debtor"],
            "publishDate": r["publish_date"], "noticeContent": r["content"],
        }
        rec = build_record(fake_raw)
        rec["url"] = r["url"]
        rec["source_id"] = r["source_id"]
        rec["source"] = "rmfygg"
        db.upsert(conn, rec)
        n += 1
    conn.commit()
    conn.close()
    if verbose:
        print(f"重新解析完成：{n} 条")
    return n

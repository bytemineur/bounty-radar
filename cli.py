# -*- coding: utf-8 -*-
"""执行悬赏公告数据库 - 命令行入口

用法:
  python cli.py init                初始化数据库
  python cli.py crawl               全量采集
  python cli.py crawl --limit 50    试跑，最多入库 50 条
  python cli.py crawl --kw 悬赏     指定关键词
  python cli.py update              采集 + 重新解析 + 导出（增量更新一条命令）
  python cli.py reparse             用最新规则重新解析已有数据
  python cli.py dedupe              清理正文重复的记录
  python cli.py export              导出看板数据
  python cli.py serve               本地起服务并打开看板
  python cli.py stats               查看入库统计
"""
import argparse
import http.server
import os
import socketserver
import sys
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
for p in (ROOT, os.path.join(ROOT, "src"), os.path.join(ROOT, "ref")):
    if p not in sys.path:
        sys.path.insert(0, p)

import config
import db
import export as exporter
import pipeline


def cmd_init(_):
    conn = db.connect()
    db.init_db(conn)
    conn.close()
    print(f"数据库已初始化: {config.DB_PATH}")


def _sources(arg):
    if not arg or arg == "all":
        return None
    return [s.strip() for s in arg.split(",") if s.strip()]


def cmd_crawl(args):
    kws = [args.kw] if args.kw else None
    pipeline.crawl(keywords=kws, limit=args.limit, sources=_sources(args.source))


def cmd_reparse(_):
    pipeline.reparse_all()
    exporter.export()


def cmd_export(_):
    exporter.export()


def cmd_dedupe(_):
    conn = db.connect()
    db.init_db(conn)
    db.dedupe(conn)
    conn.close()
    exporter.export()


def cmd_stats(_):
    conn = db.connect()
    db.init_db(conn)
    s = db.stats(conn)
    print(f"总记录      : {s['n']}")
    print(f"有执行标的  : {s['has_amount']}")
    print(f"有奖励比例  : {s['has_ratio']}")
    print(f"有封顶金额  : {s['has_cap']}")
    print(f"可估算奖励  : {s['has_est']}")
    print("\n-- 按数据源 --")
    for r in conn.execute("""SELECT source, COUNT(*) n FROM notices
                             GROUP BY source ORDER BY n DESC"""):
        print(f"  {r['source']:<10} {r['n']}")
    print("\n-- 按法院（前 12）--")
    for r in conn.execute("""SELECT COALESCE(court,'未识别') c, COUNT(*) n
                             FROM notices GROUP BY c ORDER BY n DESC LIMIT 12"""):
        print(f"  {r['n']:>4}  {r['c']}")
    print("\n-- 按省份 --")
    for r in conn.execute("""SELECT COALESCE(province,'未识别') p, COUNT(*) n
                             FROM notices GROUP BY p ORDER BY n DESC LIMIT 15"""):
        print(f"  {r['p']:<12} {r['n']}")
    print("\n-- 奖励比例分布 --")
    for r in conn.execute("""SELECT CASE
            WHEN reward_ratio IS NULL THEN '未标注'
            WHEN reward_ratio < 0.05 THEN '<5%'
            WHEN reward_ratio < 0.10 THEN '5%-10%'
            WHEN reward_ratio < 0.20 THEN '10%-20%'
            ELSE '>=20%' END k, COUNT(*) n
            FROM notices GROUP BY k ORDER BY n DESC"""):
        print(f"  {r['k']:<10} {r['n']}")
    conn.close()


def cmd_serve(args):
    host = args.host
    port = args.port
    os.chdir(config.WEB_DIR)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer((host, port), Handler) as httpd:
        httpd.daemon_threads = True
        shown = "127.0.0.1" if host in ("0.0.0.0", "::", "") else host
        url = f"http://{shown}:{port}/index.html"
        print(f"监听 {host}:{port}")
        print(f"看板地址: {url}\nCtrl+C 停止")
        if not args.no_browser:
            try:
                webbrowser.open(url)
            except Exception:
                pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止")


def cmd_update(args):
    """采集 -> 重新解析 -> 导出看板数据，一条命令完成增量更新。"""
    pipeline.crawl(keywords=[args.kw] if args.kw else None, limit=args.limit,
                   sources=_sources(args.source))
    pipeline.reparse_all()
    exporter.export()


def main():
    ap = argparse.ArgumentParser(description="执行悬赏公告数据库")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init").set_defaults(func=cmd_init)

    p = sub.add_parser("crawl")
    p.add_argument("--kw", help="只用单个关键词（仅对公告网生效）")
    p.add_argument("--limit", type=int, help="最多入库条数")
    p.add_argument("--source", help="all(默认) / rmfygg / court，可逗号组合")
    p.set_defaults(func=cmd_crawl)

    sub.add_parser("reparse").set_defaults(func=cmd_reparse)
    sub.add_parser("export").set_defaults(func=cmd_export)
    sub.add_parser("dedupe", help="清理正文完全相同的重复记录").set_defaults(func=cmd_dedupe)
    sub.add_parser("stats").set_defaults(func=cmd_stats)

    p = sub.add_parser("serve")
    p.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8848)))
    p.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"),
                   help="监听地址，容器内用 0.0.0.0")
    p.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    p.set_defaults(func=cmd_serve)

    p = sub.add_parser("update", help="采集 + 重新解析 + 导出，一条命令增量更新")
    p.add_argument("--kw", help="只用单个关键词（仅对公告网生效）")
    p.add_argument("--limit", type=int, help="最多入库条数")
    p.add_argument("--source", help="all(默认) / rmfygg / court，可逗号组合")
    p.set_defaults(func=cmd_update)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()

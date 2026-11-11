# -*- coding: utf-8 -*-
"""看板交互回归测试：把 tests/selftest*.js 注入对应页面，用本机 Chrome 无头运行。

用法：
  python tests/run_ui_test.py                    # 悬赏看板（index.html + selftest.js）
  python tests/run_ui_test.py hearing            # 开庭看板（hearings.html + selftest_hearing.js）
  python tests/run_ui_test.py all                # 两块都跑

零第三方依赖，找不到 Chrome 时回退 Edge。
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
]

SUITES = {
    "bounty": ("index.html", "selftest.js", "悬赏看板"),
    "hearing": ("hearings.html", "selftest_hearing.js", "开庭看板"),
}


def find_browser():
    for p in CHROME_CANDIDATES:
        if os.path.isfile(p):
            return p
    raise SystemExit("未找到 Chrome / Edge，无法运行 UI 测试")


def run_suite(browser, page, script_name, title):
    index = open(os.path.join(WEB, page), encoding="utf-8").read()
    script = open(os.path.join(ROOT, "tests", script_name), encoding="utf-8").read()
    page_html = index.replace("</body>", "<script>\n" + script + "\n</script>\n</body>")

    tmp = os.path.join(WEB, "_ui_test.html")
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(page_html)

    try:
        out = subprocess.run(
            [browser, "--headless=new", "--disable-gpu",
             "--no-sandbox", "--disable-dev-shm-usage",
             "--dump-dom", "--virtual-time-budget=20000",
             "file:///" + tmp.replace("\\", "/")],
            capture_output=True, text=True, encoding="utf-8", errors="ignore", timeout=180,
        ).stdout
    finally:
        os.path.exists(tmp) and os.remove(tmp)

    print("\n=== %s (%s) ===" % (title, page))
    m = re.search(r'<pre[^>]*id="testout"[^>]*>(.*?)</pre>', out, re.S)
    if not m:
        print("未拿到测试输出，页面可能加载失败")
        return 1, 0

    lines = [l for l in m.group(1).split("\n")
             if l.startswith("TEST|") and "WAIT" not in l]
    fails = [l for l in lines if "FAIL" in l or "CRASH" in l]
    for l in lines:
        print(l.replace("TEST| ", ""))
    return (1 if fails else 0), len(lines)


def main():
    target = (sys.argv[1] if len(sys.argv) > 1 else "bounty").lower()
    keys = list(SUITES) if target == "all" else [target]
    if any(k not in SUITES for k in keys):
        raise SystemExit("未知目标: %s（可选 bounty / hearing / all）" % target)

    browser = find_browser()
    rc, total = 0, 0
    for k in keys:
        page, script_name, title = SUITES[k]
        r, n = run_suite(browser, page, script_name, title)
        rc |= r
        total += n
    print("\n合计 %d 项断言" % total)
    return rc


if __name__ == "__main__":
    sys.exit(main())

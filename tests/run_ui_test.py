# -*- coding: utf-8 -*-
"""看板交互回归测试：把 tests/selftest.js 注入 index.html，用本机 Chrome 无头运行。

用法：python tests/run_ui_test.py
零第三方依赖，找不到 Chrome 时回退 Edge。
"""
import os
import re
import subprocess
import sys
import tempfile

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


def find_browser():
    for p in CHROME_CANDIDATES:
        if os.path.isfile(p):
            return p
    raise SystemExit("未找到 Chrome / Edge，无法运行 UI 测试")


def main():
    index = open(os.path.join(WEB, "index.html"), encoding="utf-8").read()
    script = open(os.path.join(ROOT, "tests", "selftest.js"), encoding="utf-8").read()
    page = index.replace("</body>", "<script>\n" + script + "\n</script>\n</body>")

    tmp = os.path.join(WEB, "_ui_test.html")
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(page)

    try:
        out = subprocess.run(
            [find_browser(), "--headless=new", "--disable-gpu",
             "--no-sandbox", "--disable-dev-shm-usage",   # 容器/CI 里常见需要
             "--dump-dom", "--virtual-time-budget=20000",
             "file:///" + tmp.replace("\\", "/")],
            capture_output=True, text=True, encoding="utf-8", errors="ignore", timeout=180,
        ).stdout
    finally:
        os.path.exists(tmp) and os.remove(tmp)

    m = re.search(r'<pre id="testout">(.*?)</pre>', out, re.S)
    if not m:
        print("未拿到测试输出，页面可能加载失败")
        return 1

    lines = [l for l in m.group(1).split("\n") if l.startswith("TEST|")]
    fails = [l for l in lines if "FAIL" in l or "CRASH" in l]
    for l in lines:
        print(l.replace("TEST| ", ""))
    print("\n%d 项断言，%d 项失败" % (len(lines), len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())

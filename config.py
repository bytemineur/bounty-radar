# -*- coding: utf-8 -*-
"""全局配置。改这里即可，无需改代码。"""
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "bounty.db")
WEB_DIR = os.path.join(BASE_DIR, "web")
EXPORT_JS = os.path.join(WEB_DIR, "data", "bounties.js")

# ---- 采集 ----
# 人民法院公告网按关键词搜索，多个关键词结果会被 source_id 去重合并。
# 覆盖不同类型表述，避免漏采。
SEARCH_KEYWORDS = [
    "悬赏",
    "执行悬赏",
    "悬赏公告",
    "悬赏执行",
    "财产线索",
    "赏金",
]

# 公告类型过滤：留空表示不限；"66" = 执行文书、拍卖
NOTICE_TYPE_CODE = ""

PAGE_SIZE = 15              # 接口固定返回 15 条/页
REQUEST_INTERVAL = 1.2      # 每次请求间隔（秒），对法院站点保持克制
REQUEST_TIMEOUT = 30
MAX_RETRY = 3
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# 仅入库"看起来是执行悬赏公告"的记录，过滤掉普通开庭/送达公告
REQUIRE_BOUNTY_SIGNAL = True

# ---- 地方法院官网栏目源 ----
# 均为南方网 NFCMS 站群，栏目页静态分页（index.html / index_2.html ...），
# 详情页 /content/post_NNNN.html。新增法院只需在这里加一条：
#   court  发布法院全称（会用于地区识别）
#   base   站点根，prefix 栏目路径
# 想确认某站有哪些栏目，可访问 <base>/postmeta/catreeall.json 看全站栏目树。
COURT_SITES = [
    {
        "court": "广东省深圳市中级人民法院",
        "base": "https://www.szcourt.gov.cn",
        "prefix": "/xsgg",                 # 司法公开 > 悬赏公告
        "province": "广东省", "city": "深圳市",
    },
    {
        "court": "深圳市南山区人民法院",
        "base": "https://gw.nscourt.gov.cn",
        "prefix": "/nscourt/wzsy/swgk/zxxsgg",   # 审务公开 > 执行悬赏公告
        "province": "广东省", "city": "深圳市",
    },
    {
        "court": "深圳市福田区人民法院",
        "base": "https://www.ftcourt.gov.cn",
        "prefix": "/xwzx/fygg/xsgg",       # 法院公告 > 悬赏公告
        "province": "广东省", "city": "深圳市",
    },
]

# 单个栏目最多抓多少页（0 = 不限，按站点分页上限）
COURT_MAX_PAGES = 40

# 执行悬赏公告数据库 · Bounty Radar

采集全国法院公开发布的**执行悬赏公告**，解析成结构化数据库，并通过可筛选看板展示。

[![CI](https://github.com/bytemineur/bounty-radar/actions/workflows/ci.yml/badge.svg)](https://github.com/bytemineur/bounty-radar/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue)](https://www.python.org/)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](#技术选型)
[![Docker](https://img.shields.io/badge/docker-compose%20up-2496ED?logo=docker&logoColor=white)](#docker-启动推荐)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

![看板截图](docs/screenshot.png)

- 数据源：人民法院公告网（rmfygg.court.gov.cn）公开公告
- 技术栈：Python 标准库 + SQLite + 原生 HTML/JS，**零第三方依赖**
- 当前库存：402 条公告，覆盖 77 家法院、18 个省级行政区

## Docker 启动（推荐）

```bash
git clone https://github.com/bytemineur/bounty-radar.git
cd bounty-radar
docker compose up -d --build
```

打开 <http://localhost:8848/index.html> 即可。容器内置已采集好的数据，不需要先跑采集。

常用操作：

```bash
docker compose logs -f dashboard              # 看日志
docker compose run --rm crawl                 # 增量采集（写入宿主机 data/ 与 web/data/）
docker compose run --rm crawl update          # 采集 + 重新解析 + 导出，一条命令
docker compose run --rm --entrypoint python crawl cli.py stats   # 查看库内统计
docker compose down                           # 停止
```

改端口：`PORT=9000 docker compose up -d`。

镜像说明：`python:3.12-slim` 基底，非 root（uid 1000）运行，暴露 8848，自带 healthcheck。
Linux 宿主机若遇到 `data/` 写权限报错，用 `docker compose run --rm --user "$(id -u):$(id -g)" crawl`。

也可以不用 compose：

```bash
docker build -t bounty-radar .
docker run -d --name bounty-radar -p 8848:8848 \
  -v "$PWD/web/data:/app/web/data:ro" bounty-radar
```

## 本地启动（不用 Docker）

零第三方依赖，Python 3.10+ 直接跑：

```bash
python cli.py init      # 初始化数据库
python cli.py stats     # 看库里的数据
python cli.py serve     # http://127.0.0.1:8848/index.html
```

采集与更新：

```bash
python cli.py crawl     # 全量采集（约 5 分钟，含限速）
python cli.py update    # 采集 + 重新解析 + 导出，增量更新
python cli.py reparse   # 改了正则后重跑全库解析
python cli.py export    # 只重新导出看板数据
```

`serve` 支持 `--host`、`--port`、`--no-browser`，也读环境变量 `HOST` / `PORT`。

看板是纯静态的，也可以直接双击 `web/index.html`（数据以 JS 变量内嵌，`file://` 下可用）。

## 看板能力

- **发布日期**：区间筛选 + 近 30/90/365 天快捷键
- **执行标的**：万元区间 + 50 万以下 / 50–500 万 / 500 万以上
- **奖励比例**：百分比区间 + ≥10% / ≥20% / ≤5%
- **最高奖励（预估）**：金额区间 + ≥1 万 / ≥10 万 / ≥100 万
- **地区**：省级多选（带条数）
- **悬赏类型**：财产线索 / 下落行踪 / 两者
- **悬赏期有效性**：仅看当前仍在悬赏期内的公告
- **关键词**：全文检索法院、被执行人、案号、正文
- 表头点击排序（执行标的 / 奖励比例 / 封顶 / 预估奖励 / 发布日期）、分页、导出当前筛选结果为 CSV、详情弹窗（含公告全文与原文链接）

三个图表随筛选实时联动：发布趋势、比例分布、地区 TOP 8。

## 数据字段

| 字段 | 说明 |
|---|---|
| `court` / `province` / `city` | 发布法院及其所属地区（由法院名推断） |
| `debtor` | 被执行人（可能多人，分号/顿号分隔） |
| `case_no` | 执行案号 |
| `subject_amount` | 执行标的额（元）。**公告未披露则为空**，当前覆盖率约 61% |
| `reward_ratio` | 悬赏奖励比例（导出为百分数，如 `10` 表示 10%）。覆盖率约 84% |
| `reward_cap` | 封顶金额（元），"最高不超过 X 元" |
| `reward_fixed` | 固定赏金（元），如"提供下落线索支付 1000 元" |
| `reward_est` | **预估最高奖励** = min(标的 × 比例, 封顶)，或固定赏金，取两者较大值 |
| `reward_type` | `property` 财产线索 / `whereabouts` 下落行踪 / `both` / `unknown` |
| `publish_date` / `valid_from` / `valid_to` | 发布日期与悬赏有效期 |
| `contact_phone` | 举报联系电话 |
| `parse_quality` | 解析置信度（0~1，按抽到的字段加权） |

## 目录结构

```
bounty-radar/
├── cli.py                    命令行入口（init/crawl/update/reparse/export/serve/stats）
├── config.py                 关键词、限速、路径等配置
├── Dockerfile                镜像定义（python:3.12-slim，非 root，自带 healthcheck）
├── docker-compose.yml        dashboard + crawl 两个服务
├── Makefile                  常用命令封装
├── src/
│   ├── http_client.py        限速/重试/403 冷却的 HTTP 客户端
│   ├── sources/rmfygg.py     人民法院公告网采集器（逆向 DataTables 接口）
│   ├── parser.py             公告正文解析：标的/比例/封顶/赏金/期限/案号/电话
│   ├── db.py                 SQLite schema 与幂等写入
│   ├── pipeline.py           采集 → 解析 → 入库
│   └── export.py             导出 web/data/bounties.js 与 bounties.json
├── ref/regions.py            法院名 → 省级行政区 / 地市
├── data/bounty.db            SQLite 数据库（已含采集结果）
├── web/                      看板（index.html / app.js / style.css / data/）
├── tests/test_parser.py      解析器回归测试
├── tests/selftest.js         看板交互回归脚本
├── tests/run_ui_test.py      注入 selftest.js，用无头浏览器跑交互测试
└── docs/screenshot.png       看板截图
```

## 技术选型

刻意只用标准库，原因：

- 目标机器上经常没有 pip 环境，`python cli.py xxx` 就能跑；
- 看板必须能离线双击打开，所以不引入构建工具和前端框架；
- 部署简单：镜像只有基底 + 代码，没有依赖解析这一步。

## 数据源与合规说明

1. 仅采集法院依法主动向社会公开的悬赏公告，不对任何非公开信息做抓取或推断。
2. 采集间隔默认 1.2 秒，触发 403 会冷却 35 秒后重试，避免对法院站点造成压力。
3. 人民法院公告网的列表接口有**频次限制**：短时间内重复全量抓取会被临时 403。
   建议按日/周做增量采集，不要连续循环跑 `crawl`。
4. 公告中的身份证号在原文中已是打码状态（如 `34112519901103****`），本项目原样保留公告正文，不做补全。
5. 金额与比例为程序从正文**正则抽取**，可能存在误差；`parse_quality` 字段可用于过滤低置信度记录，关键决策请以公告原文为准。

## 扩展新的数据源

在 `src/sources/` 下新增模块，实现一个 `iter_keyword(http, keyword)` 生成器，
产出至少包含以下键的 dict，然后在 `pipeline.py` 里按源分发：

```python
{"source": "xxx", "source_id": "...", "url": "...", "court": "...",
 "debtor": "...", "publish_date": "YYYY-MM-DD", "content": "公告全文"}
```

解析、地区映射、入库、导出、看板都会自动复用，无需改动其他代码。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 已知限制

- 数据源目前只有人民法院公告网一家。各地法院官网、法院微信公众号发布的悬赏公告未纳入，
  实际全国悬赏公告总量远大于 402 条，接入更多源后需扩展 `sources/`。
- 公告正文表述极不统一，"分段费率表""以物抵债另计比例"等复杂条款只能近似解析。
- 法院名到省份的映射基于内置的地级市词典，个别只写区县名的法院（如"定远县人民法院"）
  只能靠县级词典兜底，仍有少量归入"未识别"。
- 数据分布由源站决定：广东省占比偏高（222/402），因为深圳龙岗区法院、前海合作区法院
  在批量发布悬赏公告，并非地区识别错误。

## 测试

```bash
python -m unittest tests.test_parser -v   # 解析器规则，10 项
python tests/run_ui_test.py               # 看板排序 + 全部筛选控件，47 项断言
```

`run_ui_test.py` 会把 `tests/selftest.js` 注入 `web/index.html`，
用本机 Chrome/Edge 无头跑真实点击，对照一份独立实现的参考筛选结果校验条数与顺序。

CI 在 Python 3.10 / 3.12 / 3.13 上跑这两组测试，并构建镜像做冒烟验证。

## License

[MIT](LICENSE)

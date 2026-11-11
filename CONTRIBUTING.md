# 参与贡献

感谢关注。这个项目结构很小，改动成本低，欢迎提 Issue 和 PR。

## 本地跑起来

零第三方依赖，Python 3.10+ 即可：

```bash
python cli.py init          # 初始化 SQLite
python cli.py stats         # 看库里的数据
python cli.py serve         # http://127.0.0.1:8848/index.html
```

或者用 Docker：

```bash
docker compose up -d --build dashboard   # 看板
docker compose run --rm crawl            # 采集
```

## 提交前请跑测试

```bash
python -m unittest tests.test_parser -v   # 解析器规则
python tests/run_ui_test.py               # 看板排序 + 全部筛选控件（需本机 Chrome/Edge）
```

CI 会在 Python 3.10 / 3.12 / 3.13 上跑这两组测试，并构建镜像。

## 三类常见改动

### 1. 新增数据源

在 `src/sources/` 下加一个模块，暴露 `iter_keyword(http, keyword)` 生成器，
每条产出一个与 `src/sources/rmfygg.py` 的 `to_record()` 同构的 dict（至少含
`noticeCode`/`court`/`publishDate`/`noticeContent`）。然后在 `src/pipeline.py`
的 `crawl()` 里按源分发即可，解析、地区映射、入库、导出、看板全部自动复用。

注意：新增源必须限速（参考 `config.REQUEST_INTERVAL`），不要并发轰炸法院站点。

### 2. 提升字段抽取覆盖率

`src/parser.py` 顶部是一组正则清单（`SUBJECT_PATTERNS`/`RATIO_*`/`CAP_PATTERNS`/`FIXED_PATTERNS`）。
改进流程：

1. 从库里捞没抽到的样本：
   ```bash
   python -c "import sys;sys.path[:0]=['src','.','ref'];import db;c=db.connect();\
   [print(' '.join(r[0].split())[:300],'\n') for r in c.execute('SELECT content FROM notices WHERE subject_amount IS NULL ORDER BY RANDOM() LIMIT 5')]"
   ```
2. 在 `tests/test_parser.py` 加一条真实公告片段作为用例（先让它失败）。
3. 改正则直到测试通过，然后 `python cli.py reparse` 重跑全库，看覆盖率是否真的提升。

正则改动很容易误伤，**没有测试用例的改动不会被合入**。

### 3. 看板改动

`web/` 下是原生 JS，无构建步骤。改完请跑 `python tests/run_ui_test.py`，
它会真实点击表头与每个筛选控件，对照一份独立实现的参考筛选结果校验条数与顺序。
新增筛选项时，请同时在 `tests/selftest.js` 里加断言。

## 数据伦理

- 只采集法院公开发布的公告，不绕过登录、验证码或反爬策略。
- 遵守站点频率限制，宁可慢；遇到 403 就停，不要换 IP 继续。
- 公告含自然人姓名、部分含身份证号（源站已脱敏）。二次分发时请勿补全或关联其他个人信息。

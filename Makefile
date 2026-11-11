# 法院公告雷达 —— 常用命令（悬赏看板 + 开庭看板）
# make / make up / make crawl / make crawl-hearing / make test

DC      ?= docker compose
IMAGE   ?= bounty-radar:latest
PORT    ?= 8848

.PHONY: help build up down restart logs shell stats crawl crawl-court crawl-notice update reparse dedupe export \
        crawl-hearing update-hearing reparse-hearing export-hearing stats-hearing \
        test test-hearing test-ui clean

help:  ## 显示可用命令
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*?##/ {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build:  ## 构建镜像
	$(DC) build

up:  ## 后台启动看板 http://localhost:$(PORT)
	PORT=$(PORT) $(DC) up -d dashboard
	@echo "悬赏看板: http://localhost:$(PORT)/index.html"
	@echo "开庭看板: http://localhost:$(PORT)/hearings.html"

down:  ## 停止并移除容器
	$(DC) down

restart: down up  ## 重启看板

logs:  ## 查看看板日志
	$(DC) logs -f --tail=100 dashboard

shell:  ## 进容器拿一个 shell
	$(DC) run --rm --entrypoint sh dashboard

stats:  ## 查看悬赏库统计
	$(DC) run --rm --no-deps --entrypoint python dashboard cli.py stats

crawl:  ## 悬赏全量采集（公告网 + 各法院官网，法院站点有频次限制，别连续跑）
	$(DC) run --rm crawl

crawl-court:  ## 悬赏：只抓各地法院官网栏目
	$(DC) run --rm --entrypoint python crawl cli.py crawl --source court

crawl-notice:  ## 悬赏：只抓人民法院公告网
	$(DC) run --rm --entrypoint python crawl cli.py crawl --source rmfygg

update:  ## 悬赏：采集 + 重新解析 + 导出
	$(DC) run --rm crawl update

reparse:  ## 悬赏：用最新规则重解析并导出
	$(DC) run --rm crawl reparse

dedupe:  ## 悬赏：清理正文重复的记录
	$(DC) run --rm --entrypoint python crawl cli.py dedupe

export:  ## 悬赏：只重新导出看板数据
	$(DC) run --rm crawl export

# ---------------- 开庭看板 ----------------
crawl-hearing:  ## 开庭：采集（公告网开庭传票 + 法院排期表）
	$(DC) run --rm crawl-hearing hearing crawl

update-hearing:  ## 开庭：采集 + 去重 + 导出
	$(DC) run --rm crawl-hearing

reparse-hearing:  ## 开庭：用最新规则重解析并导出
	$(DC) run --rm --entrypoint python crawl-hearing cli.py hearing reparse

export-hearing:  ## 开庭：只重新导出数据
	$(DC) run --rm --entrypoint python crawl-hearing cli.py hearing export

stats-hearing:  ## 开庭：查看开庭库统计
	$(DC) run --rm --no-deps --entrypoint python dashboard cli.py hearing stats

test:  ## 解析器单元测试（悬赏 + 开庭）
	python -m unittest tests.test_parser tests.test_hearing_parser -v

test-hearing:  ## 只跑开庭解析测试
	python tests/test_hearing_parser.py

test-ui:  ## 看板交互回归（需要本机 Chrome/Edge）
	python tests/run_ui_test.py

clean:  ## 删掉镜像与本地缓存
	$(DC) down -v --remove-orphans
	docker rmi $(IMAGE) 2>/dev/null || true
	find . -name __pycache__ -type d -prune -exec rm -rf {} +

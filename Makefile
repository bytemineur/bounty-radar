# 执行悬赏公告看板 —— 常用命令
# make / make up / make crawl / make test

DC      ?= docker compose
IMAGE   ?= bounty-radar:latest
PORT    ?= 8848

.PHONY: help build up down restart logs shell stats crawl update reparse export test test-ui clean

help:  ## 显示可用命令
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*?##/ {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build:  ## 构建镜像
	$(DC) build

up:  ## 后台启动看板 http://localhost:$(PORT)
	PORT=$(PORT) $(DC) up -d dashboard
	@echo "看板地址: http://localhost:$(PORT)/index.html"

down:  ## 停止并移除容器
	$(DC) down

restart: down up  ## 重启看板

logs:  ## 查看看板日志
	$(DC) logs -f --tail=100 dashboard

shell:  ## 进容器拿一个 shell
	$(DC) run --rm --entrypoint sh dashboard

stats:  ## 查看库内统计
	$(DC) run --rm --no-deps --entrypoint python dashboard cli.py stats

crawl:  ## 全量采集（法院站点有频次限制，别连续跑）
	$(DC) run --rm crawl

update:  ## 采集 + 重新解析 + 导出，一条命令增量更新
	$(DC) run --rm crawl update

reparse:  ## 用最新规则重解析已有数据并重新导出
	$(DC) run --rm crawl reparse

export:  ## 只重新导出看板数据
	$(DC) run --rm crawl export

test:  ## 解析器单元测试
	python -m unittest tests.test_parser -v

test-ui:  ## 看板交互回归（需要本机 Chrome/Edge）
	python tests/run_ui_test.py

clean:  ## 删掉镜像与本地缓存
	$(DC) down -v --remove-orphans
	docker rmi $(IMAGE) 2>/dev/null || true
	find . -name __pycache__ -type d -prune -exec rm -rf {} +

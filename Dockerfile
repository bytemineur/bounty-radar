# syntax=docker/dockerfile:1

# 法院公告雷达 —— 零第三方依赖，只需要标准库
# 内置两块看板：执行悬赏公告（index.html）、法院开庭公告（hearings.html）
FROM python:3.12-slim

LABEL org.opencontainers.image.title="bounty-radar" \
      org.opencontainers.image.description="全国法院执行悬赏公告与开庭公告采集、筛选看板" \
      org.opencontainers.image.source="https://github.com/bytemineur/bounty-radar" \
      org.opencontainers.image.licenses="MIT"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    LANG=C.UTF-8 \
    TZ=Asia/Shanghai \
    PORT=8848 \
    HOST=0.0.0.0

WORKDIR /app

# 代码 + 已采集的数据（镜像开箱即用，不挂卷也能看板）
COPY cli.py config.py ./
COPY src ./src
COPY ref ./ref
COPY web ./web
COPY data ./data

# 非 root 运行
RUN useradd -m -u 1000 app && chown -R app:app /app
USER app

EXPOSE 8848

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD python -c "import os,urllib.request as u; u.urlopen('http://127.0.0.1:%s/index.html' % os.environ.get('PORT','8848'), timeout=3)"

ENTRYPOINT ["python", "cli.py"]
# 默认起看板；端口取环境变量 PORT
CMD ["serve", "--host", "0.0.0.0", "--no-browser"]

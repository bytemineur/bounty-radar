# -*- coding: utf-8 -*-
"""极简 HTTP 客户端：限速 + 重试 + 统一 UA。仅标准库。"""
import gzip
import io
import random
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib

import config


class Http:
    def __init__(self, interval=None, timeout=None, max_retry=None):
        self.interval = config.REQUEST_INTERVAL if interval is None else interval
        self.timeout = config.REQUEST_TIMEOUT if timeout is None else timeout
        self.max_retry = config.MAX_RETRY if max_retry is None else max_retry
        self._last = 0.0
        self.count = 0

    def _throttle(self):
        gap = self.interval - (time.time() - self._last)
        if gap > 0:
            time.sleep(gap + random.uniform(0, 0.25))
        self._last = time.time()
        self.count += 1

    def _decode(self, resp):
        raw = resp.read()
        enc = resp.headers.get("Content-Encoding", "")
        if "gzip" in enc:
            raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read()
        elif "deflate" in enc:
            raw = zlib.decompress(raw, -zlib.MAX_WBITS)
        charset = resp.headers.get_content_charset() or "utf-8"
        try:
            return raw.decode(charset, "ignore")
        except LookupError:
            return raw.decode("utf-8", "ignore")

    def request(self, url, data=None, headers=None, method=None):
        body = None
        hdrs = {
            "User-Agent": config.USER_AGENT,
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive",
        }
        if headers:
            hdrs.update(headers)
        if data is not None:
            body = urllib.parse.urlencode(data).encode("utf-8")
            hdrs.setdefault("Content-Type",
                            "application/x-www-form-urlencoded; charset=UTF-8")

        last_err = None
        for attempt in range(1, self.max_retry + 1):
            self._throttle()
            req = urllib.request.Request(url, data=body, headers=hdrs,
                                         method=method or ("POST" if body else "GET"))
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return self._decode(resp)
            except (urllib.error.URLError, urllib.error.HTTPError, OSError) as e:
                last_err = e
                code = getattr(e, "code", None)
                if code == 403:
                    # 站点限流：长冷却后重试，最多 2 次
                    if attempt <= 2:
                        print(f"    ! 403 限流，冷却 35s 后重试 ({attempt}/2)")
                        time.sleep(35)
                        continue
                    break
                if code and 400 <= code < 500 and code != 429:
                    break
                sleep = min(2 ** attempt, 15)
                print(f"    ! 请求失败({e})，{sleep}s 后重试 {attempt}/{self.max_retry}")
                time.sleep(sleep)
        raise RuntimeError(f"请求失败: {url} -> {last_err}")

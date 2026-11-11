/* 执行悬赏公告看板 —— 纯原生 JS，无外部依赖 */
(function () {
  "use strict";

  var RAW = window.__BOUNTY_DATA__ || { meta: {}, rows: [] };
  var ROWS = RAW.rows || [];
  var META = RAW.meta || {};

  var TYPE_LABEL = {
    property: "财产线索",
    whereabouts: "下落行踪",
    both: "财产+下落",
    unknown: "未标注"
  };

  var state = {
    dateFrom: "",
    dateTo: "",
    subMin: null, subMax: null,      // 万元
    ratioMin: null, ratioMax: null,  // %
    estMin: null, estMax: null,      // 元
    type: "",
    validOnly: false,
    keyword: "",
    provinces: new Set(),
    sources: new Set(),
    sort: "pub_desc",
    page: 1,
    pageSize: 20
  };

  var filtered = ROWS.slice();

  /* ---------------- 工具 ---------------- */
  function $(id) { return document.getElementById(id); }
  // num() 只做“是不是有效数字”的判断；取数值本身用 nval()，无效返回 NaN
  function num(v) { return typeof v === "number" && isFinite(v); }
  function nval(v) { return (typeof v === "number" && isFinite(v)) ? v : NaN; }

  function fmtMoney(v, opt) {
    opt = opt || {};
    if (!num(v)) return '<span class="na">—</span>';
    var s;
    if (v >= 1e8) s = (v / 1e8).toFixed(2).replace(/\.?0+$/, "") + " 亿";
    else if (v >= 1e4) s = (v / 1e4).toFixed(v >= 1e5 ? 0 : 1).replace(/\.0$/, "") + " 万";
    else s = Math.round(v).toLocaleString("zh-CN");
    return s;
  }
  function fmtNum(v) { return num(v) ? Math.round(v).toLocaleString("zh-CN") : "—"; }
  function fmtDate(d) { return d ? d : '<span class="na">—</span>'; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /* ---------------- 筛选 ---------------- */
  function applyFilters() {
    var kw = state.keyword.trim().toLowerCase();
    var today = todayStr();

    filtered = ROWS.filter(function (r) {
      if (state.dateFrom && (r.pub || "") < state.dateFrom) return false;
      if (state.dateTo && (r.pub || "9999") > state.dateTo) return false;

      if (state.subMin != null || state.subMax != null) {
        if (!num(r.subject)) return false;
        if (state.subMin != null && r.subject < state.subMin * 1e4) return false;
        if (state.subMax != null && r.subject > state.subMax * 1e4) return false;
      }
      if (state.ratioMin != null || state.ratioMax != null) {
        if (!num(r.ratio)) return false;
        if (state.ratioMin != null && r.ratio < state.ratioMin) return false;
        if (state.ratioMax != null && r.ratio > state.ratioMax) return false;
      }
      if (state.estMin != null || state.estMax != null) {
        if (!num(r.est)) return false;
        if (state.estMin != null && r.est < state.estMin) return false;
        if (state.estMax != null && r.est > state.estMax) return false;
      }
      if (state.type && r.type !== state.type) return false;
      if (state.validOnly) {
        if (!r.vto) return false;
        if (r.vto < today) return false;
      }
      if (state.provinces.size) {
        var p = r.prov || "未识别";
        if (!state.provinces.has(p)) return false;
      }
      if (state.sources.size) {
        var s = r.src || "unknown";
        if (!state.sources.has(s)) return false;
      }
      if (kw) {
        var hay = ((r.court || "") + " " + (r.debtor || "") + " " + (r.caseNo || "") + " " + (r.body || "")).toLowerCase();
        if (hay.indexOf(kw) === -1) return false;
      }
      return true;
    });

    sortRows();
    state.page = 1;
    renderAll();
  }

  function sortRows() {
    var parts = state.sort.split("_");
    var key = parts[0];
    var dir = parts[1] === "asc" ? 1 : -1;

    filtered.sort(function (a, b) {
      // 日期列：按 ISO 字符串比较即可
      if (key === "pub") {
        var x = a.pub || "", y = b.pub || "";
        if (x !== y) return x < y ? -dir : dir;
        return (b.id || 0) - (a.id || 0);
      }
      // 数值列：缺值始终排在最后，不随升降序翻转
      var xv = nval(a[key]), yv = nval(b[key]);
      var hasX = !isNaN(xv), hasY = !isNaN(yv);
      if (hasX && hasY) {
        if (xv !== yv) return (xv - yv) * dir;
        return (b.id || 0) - (a.id || 0);
      }
      if (hasX) return -1;
      if (hasY) return 1;
      return (b.pub || "").localeCompare(a.pub || "") || ((b.id || 0) - (a.id || 0));
    });
  }

  /* ---------------- 统计卡 ---------------- */
  function renderStats() {
    var n = filtered.length;
    var courts = new Set(), provs = new Set();
    var sumSub = 0, sumEst = 0, maxEst = 0, estCount = 0;
    filtered.forEach(function (r) {
      if (r.court) courts.add(r.court);
      if (r.prov) provs.add(r.prov);
      if (num(r.subject)) sumSub += r.subject;
      if (num(r.est)) { sumEst += r.est; estCount++; if (r.est > maxEst) maxEst = r.est; }
    });

    var cards = [
      { k: "公告条数", v: n.toLocaleString("zh-CN"),
        d: n === ROWS.length ? "全量数据" : "占全量 " + ((n / ROWS.length) * 100).toFixed(0) + "%" },
      { k: "覆盖法院", v: courts.size.toLocaleString("zh-CN"), d: "涉及 " + provs.size + " 个省级地区" },
      { k: "执行标的合计", v: fmtMoney(sumSub), d: "仅统计已披露标的的公告" },
      { k: "预估奖励合计", v: fmtMoney(sumEst), d: estCount + " 条可推算" },
      { k: "最高单笔奖励", v: fmtMoney(maxEst), d: maxEst ? "约 " + fmtNum(maxEst) + " 元" : "—" }
    ];
    $("stats").innerHTML = cards.map(function (c) {
      return '<div class="stat"><div class="k">' + c.k + '</div>' +
             '<div class="v">' + c.v + '</div><div class="d">' + c.d + "</div></div>";
    }).join("");
  }

  /* ---------------- 图表 ---------------- */
  function svgEl(tag, attrs) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function chartSize(host) {
    var W = host.clientWidth || 600;
    var H = host.clientHeight || 200;
    return { W: Math.max(W, 240), H: Math.max(H, 140) };
  }

  function emptyChart(host) {
    host.innerHTML = '<div class="empty" style="padding:66px 0">暂无数据</div>';
  }

  function drawLineChart(host, data) {
    host.innerHTML = "";
    if (!data.length) { emptyChart(host); return; }
    var sz = chartSize(host), W = sz.W, H = sz.H;
    var PL = 40, PR = 22, PT = 14, PB = 24;
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H });

    var maxV = Math.max.apply(null, data.map(function (d) { return d.v; })) || 1;
    maxV = Math.ceil(maxV / 4) * 4 || 4;
    var iw = W - PL - PR, ih = H - PT - PB;

    for (var i = 0; i <= 4; i++) {
      var y = PT + ih - (ih * i) / 4;
      svg.appendChild(svgEl("line", { x1: PL, y1: y, x2: W - PR, y2: y, stroke: "#eef0f4", "stroke-width": 1 }));
      var t = svgEl("text", { x: PL - 7, y: y + 3.5, "text-anchor": "end", "font-size": 10, fill: "#9aa1ad" });
      t.textContent = String(Math.round((maxV * i) / 4));
      svg.appendChild(t);
    }

    var step = data.length > 1 ? iw / (data.length - 1) : 0;
    var pts = data.map(function (d, i) {
      return [PL + step * i, PT + ih - (d.v / maxV) * ih];
    });

    var area = "M" + pts[0][0] + "," + (PT + ih);
    pts.forEach(function (p) { area += " L" + p[0] + "," + p[1]; });
    area += " L" + pts[pts.length - 1][0] + "," + (PT + ih) + " Z";
    svg.appendChild(svgEl("path", { d: area, fill: "rgba(31,79,216,.07)" }));

    var line = "M" + pts.map(function (p) { return p[0] + "," + p[1]; }).join(" L");
    svg.appendChild(svgEl("path", { d: line, fill: "none", stroke: "#1f4fd8", "stroke-width": 2, "stroke-linejoin": "round" }));

    pts.forEach(function (p, i) {
      var c = svgEl("circle", { cx: p[0], cy: p[1], r: 2.8, fill: "#fff", stroke: "#1f4fd8", "stroke-width": 1.6 });
      var ti = svgEl("title", {});
      ti.textContent = data[i].label + "：" + data[i].v + " 条";
      c.appendChild(ti);
      svg.appendChild(c);
    });

    // x 轴标签：均匀取最多 6 个，避免重叠
    var n = data.length;
    var picks = n <= 6 ? data.map(function (_, i) { return i; })
      : [0, Math.round((n - 1) * 0.2), Math.round((n - 1) * 0.4), Math.round((n - 1) * 0.6),
         Math.round((n - 1) * 0.8), n - 1];
    picks = picks.filter(function (v, i, a) { return a.indexOf(v) === i; });
    picks.forEach(function (i) {
      var x = PL + step * i;
      var anchor = i === 0 ? "start" : (i === n - 1 ? "end" : "middle");
      var t = svgEl("text", { x: x, y: H - 7, "text-anchor": anchor, "font-size": 10, fill: "#9aa1ad" });
      t.textContent = data[i].label;
      svg.appendChild(t);
    });
    host.appendChild(svg);
  }

  function drawBarChart(host, data) {
    host.innerHTML = "";
    if (!data.length) { emptyChart(host); return; }
    var sz = chartSize(host), W = sz.W, H = sz.H;
    var PL = 34, PR = 12, PT = 16, PB = 24;
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H });
    var maxV = Math.max.apply(null, data.map(function (d) { return d.v; })) || 1;
    maxV = Math.ceil((maxV * 1.12) / 3) * 3 || 3;   // 顶部留白，避免柱顶数字超界
    var iw = W - PL - PR, ih = H - PT - PB;
    var bw = iw / data.length;

    for (var i = 0; i <= 3; i++) {
      var y = PT + ih - (ih * i) / 3;
      svg.appendChild(svgEl("line", { x1: PL, y1: y, x2: W - PR, y2: y, stroke: "#eef0f4" }));
      var t = svgEl("text", { x: PL - 6, y: y + 3.5, "text-anchor": "end", "font-size": 10, fill: "#9aa1ad" });
      t.textContent = String(Math.round((maxV * i) / 3));
      svg.appendChild(t);
    }

    data.forEach(function (d, i) {
      var h = (d.v / maxV) * ih;
      var x = PL + bw * i + bw * 0.2;
      var w = bw * 0.6;
      var rect = svgEl("rect", {
        x: x, y: PT + ih - h, width: w, height: Math.max(h, d.v ? 2 : 0),
        rx: 3, fill: d.color || "#1f4fd8", opacity: .9
      });
      var ti = svgEl("title", {});
      ti.textContent = d.label + "：" + d.v + " 条";
      rect.appendChild(ti);
      svg.appendChild(rect);

      if (d.v) {
        var vt = svgEl("text", { x: x + w / 2, y: PT + ih - h - 5, "text-anchor": "middle", "font-size": 10, fill: "#475467" });
        vt.textContent = String(d.v);
        svg.appendChild(vt);
      }
      var lt = svgEl("text", { x: x + w / 2, y: H - 7, "text-anchor": "middle", "font-size": 10, fill: "#9aa1ad" });
      lt.textContent = d.label;
      svg.appendChild(lt);
    });
    host.appendChild(svg);
  }

  function drawHBarChart(host, data) {
    host.innerHTML = "";
    if (!data.length) { emptyChart(host); return; }
    var sz = chartSize(host), W = sz.W, H = sz.H;
    var PL = 80, PR = 38, PT = 10, PB = 12;
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H });
    var maxV = Math.max.apply(null, data.map(function (d) { return d.v; })) || 1;
    var iw = W - PL - PR, ih = H - PT - PB;
    var rowH = ih / data.length;

    data.forEach(function (d, i) {
      var y = PT + rowH * i;
      var label = svgEl("text", { x: PL - 8, y: y + rowH / 2 + 3.5, "text-anchor": "end", "font-size": 10.5, fill: "#475467" });
      label.textContent = d.label.length > 7 ? d.label.slice(0, 7) + "…" : d.label;
      svg.appendChild(label);

      svg.appendChild(svgEl("rect", { x: PL, y: y + rowH * 0.24, width: iw, height: rowH * 0.52, rx: 3, fill: "#f3f5f9" }));

      var w = Math.max((d.v / maxV) * iw, d.v ? 3 : 0);
      var rect = svgEl("rect", { x: PL, y: y + rowH * 0.24, width: w, height: rowH * 0.52, rx: 3, fill: "#1f4fd8", opacity: .85 });
      var ti = svgEl("title", {});
      ti.textContent = d.label + "：" + d.v + " 条";
      rect.appendChild(ti);
      svg.appendChild(rect);

      var vt = svgEl("text", { x: PL + w + 6, y: y + rowH / 2 + 3.5, "font-size": 10, fill: "#475467" });
      vt.textContent = String(d.v);
      svg.appendChild(vt);
    });
    host.appendChild(svg);
  }

  function renderCharts() {
    // 1) 趋势：按月份
    var byMonth = {};
    filtered.forEach(function (r) {
      if (!r.pub) return;
      var m = r.pub.slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + 1;
    });
    var months = Object.keys(byMonth).sort().slice(-18);
    var trend = months.map(function (m) {
      return { label: m.slice(2).replace("-", "/"), v: byMonth[m] };
    });
    drawLineChart($("chartTrend"), trend);
    $("trendHint").textContent = months.length ? months[0] + " 至今，共 " + months.length + " 个月" : "";

    // 2) 比例分布（区间左开右闭，与看板快捷筛选口径保持一致）
    var bins = [
      { label: "≤5%", v: 0, color: "#9db6f5" },
      { label: "6–10%", v: 0, color: "#6d90ec" },
      { label: "11–15%", v: 0, color: "#3f6ee0" },
      { label: "16–20%", v: 0, color: "#1f4fd8" },
      { label: ">20%", v: 0, color: "#12307f" },
      { label: "未标注", v: 0, color: "#d5d9e2" }
    ];
    filtered.forEach(function (r) {
      if (!num(r.ratio)) { bins[5].v++; return; }
      var b = r.ratio <= 5 ? 0 : r.ratio <= 10 ? 1 : r.ratio <= 15 ? 2 : r.ratio <= 20 ? 3 : 4;
      bins[b].v++;
    });
    drawBarChart($("chartRatio"), bins);

    // 3) 省份 TOP8（"未识别"不计入排名）
    var byProv = {};
    filtered.forEach(function (r) {
      if (!r.prov) return;
      byProv[r.prov] = (byProv[r.prov] || 0) + 1;
    });
    var provs = Object.keys(byProv).map(function (k) { return { label: k, v: byProv[k] }; })
      .sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
    drawHBarChart($("chartProv"), provs);
  }

  /* ---------------- 表格 ---------------- */
  function renderTable() {
    var total = filtered.length;
    var size = state.pageSize;
    var pages = Math.max(1, Math.ceil(total / size));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * size;
    var slice = filtered.slice(start, start + size);

    $("resultCount").textContent = "共 " + total + " 条";
    $("empty").hidden = total !== 0;

    $("tbody").innerHTML = slice.map(function (r, i) {
      var ratioCell = num(r.ratio)
        ? '<div class="ratio-wrap"><span>' + r.ratio.toFixed(1).replace(/\.0$/, "") + '%</span>' +
          '<span class="ratio-bar"><i style="width:' + Math.min(r.ratio * 4, 100) + '%"></i></span></div>'
        : '<span class="na">—</span>';
      var estCell = num(r.est)
        ? '<span class="money' + (r.est >= 100000 ? " big" : "") +
          '" title="' + (num(r.subject) ? "按执行标的 × 奖励比例" + (num(r.cap) ? "，并受封顶限制" : "") : "公告载明的固定赏金") +
          '">' + fmtMoney(r.est) + "</span>"
        : '<span class="na">—</span>';
      return "<tr>" +
        '<td class="c-court"><div class="court-name">' + esc(r.court || "—") + "</div>" +
          '<div class="court-sub">' + esc(r.prov || "未识别") + (r.city ? " · " + esc(r.city) : "") + "</div></td>" +
        '<td class="c-debtor">' + esc(r.debtor || "—") + "</td>" +
        '<td class="c-case"><span class="case-no">' + esc(r.caseNo || "—") + "</span></td>" +
        '<td class="c-num">' + (num(r.subject) ? fmtMoney(r.subject) : '<span class="na">—</span>') + "</td>" +
        '<td class="c-num">' + ratioCell + "</td>" +
        '<td class="c-num">' + (num(r.cap) ? fmtMoney(r.cap) : '<span class="na">—</span>') + "</td>" +
        '<td class="c-num">' + estCell + "</td>" +
        '<td class="c-type"><span class="tag ' + esc(r.type || "unknown") + '">' +
          (TYPE_LABEL[r.type] || "未标注") + "</span></td>" +
        '<td class="c-date">' + fmtDate(r.pub) + "</td>" +
        '<td class="c-act"><button class="link-btn" data-idx="' + (start + i) + '">详情</button></td>' +
        "</tr>";
    }).join("");

    $("pageInfo").textContent = total
      ? "第 " + state.page + " / " + pages + " 页，显示 " + (start + 1) + "–" +
        Math.min(start + size, total) + " 条"
      : "无数据";
    renderPager(pages);
    renderSortMarks();
  }

  function renderPager(pages) {
    var btns = [];
    btns.push('<button data-p="' + (state.page - 1) + '"' + (state.page <= 1 ? " disabled" : "") + ">‹</button>");
    var nums = new Set([1, pages, state.page, state.page - 1, state.page + 1, state.page - 2, state.page + 2]);
    var list = Array.from(nums).filter(function (n) { return n >= 1 && n <= pages; }).sort(function (a, b) { return a - b; });
    var prev = 0;
    list.forEach(function (n) {
      if (n - prev > 1) btns.push('<button disabled>…</button>');
      btns.push('<button data-p="' + n + '"' + (n === state.page ? ' class="on"' : "") + ">" + n + "</button>");
      prev = n;
    });
    btns.push('<button data-p="' + (state.page + 1) + '"' + (state.page >= pages ? " disabled" : "") + ">›</button>");
    $("pagerBtns").innerHTML = btns.join("");
  }

  function renderSortMarks() {
    var [key] = state.sort.split("_");
    Array.prototype.forEach.call(document.querySelectorAll("th.sortable"), function (th) {
      th.classList.remove("asc", "desc");
      if (th.dataset.sort === key) th.classList.add(state.sort.split("_")[1]);
    });
  }

  /* ---------------- 详情弹窗 ---------------- */
  function openDetail(idx) {
    var r = filtered[idx];
    if (!r) return;
    $("mTitle").textContent = r.court || "公告详情";

    var kv = [
      ["被执行人", esc(r.debtor || "—")],
      ["执行案号", esc(r.caseNo || "—")],
      ["执行标的", num(r.subject) ? fmtMoney(r.subject) + "（" + fmtNum(r.subject) + " 元）" : "未披露"],
      ["奖励比例", num(r.ratio) ? r.ratio + "%" : "未标注"],
      ["封顶金额", num(r.cap) ? fmtMoney(r.cap) : "无"],
      ["固定赏金", num(r.fixed) ? fmtMoney(r.fixed) : "无"],
      ["预估最高奖励", num(r.est) ? "<b>" + fmtMoney(r.est) + "</b>（" + fmtNum(r.est) + " 元）" : "无法推算"],
      ["悬赏类型", TYPE_LABEL[r.type] || "未标注"],
      ["发布日期", r.pub || "—"],
      ["悬赏期限", (r.vfrom || "—") + " 至 " + (r.vto || "—")],
      ["联系电话", esc(r.phone || "—")],
      ["解析置信度", num(r.q) ? Math.round(r.q * 100) + "%" : "—"]
    ];
    var html = '<dl class="kv">' + kv.map(function (x) {
      return "<dt>" + x[0] + "</dt><dd>" + x[1] + "</dd>";
    }).join("") + "</dl>";
    var body = r.body || "";
    html += '<div class="body-head"><span>公告正文 · 本地留存快照</span>' +
      (body ? '<button class="btn tiny" id="mCopy">复制全文</button>' : "") + "</div>";
    html += '<div class="fulltext" id="mBody">' + esc(body || "（无正文）") + "</div>";
    html += '<p class="waf-note">原文链接指向法院官网详情页，该页有 Web 应用防火墙：' +
      "短时间多次访问会被判定为异常并返回 403 拦截页（带请求 UUID）。上面的正文是采集时的快照，不受影响。</p>";
    $("mContent").innerHTML = html;

    var copyBtn = $("mCopy");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        copyText(body);
        copyBtn.textContent = "已复制";
        setTimeout(function () { copyBtn.textContent = "复制全文"; }, 1500);
      });
    }

    var link = $("mLink");
    if (r.url) { link.href = r.url; link.style.display = ""; }
    else link.style.display = "none";

    $("modal").hidden = false;
  }

  function copyText(s) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(s);
        return;
      }
    } catch (e) { /* 降级到 execCommand */ }
    var ta = document.createElement("textarea");
    ta.value = s;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* 忽略 */ }
    ta.remove();
  }

  function closeModal() { $("modal").hidden = true; }

  /* ---------------- CSV ---------------- */
  function exportCSV() {
    var head = ["法院", "省份", "城市", "被执行人", "执行案号", "执行标的(元)", "奖励比例(%)",
                "封顶金额(元)", "固定赏金(元)", "预估最高奖励(元)", "悬赏类型", "发布日期",
                "悬赏截止", "联系电话", "公告链接", "公告正文"];
    var lines = [head.join(",")];
    filtered.forEach(function (r) {
      var cells = [
        r.court, r.prov, r.city, r.debtor, r.caseNo,
        num(r.subject) ? Math.round(r.subject) : "",
        num(r.ratio) ? r.ratio : "",
        num(r.cap) ? Math.round(r.cap) : "",
        num(r.fixed) ? Math.round(r.fixed) : "",
        num(r.est) ? Math.round(r.est) : "",
        TYPE_LABEL[r.type] || "", r.pub, r.vto, r.phone, r.url, r.body || ""
      ];
      lines.push(cells.map(function (c) {
        var s = c == null ? "" : String(c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(","));
    });
    var blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "执行悬赏公告_" + todayStr() + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  /* ---------------- 省份 chips ---------------- */
  function renderProvChips() {
    var counts = {};
    ROWS.forEach(function (r) {
      var p = r.prov || "未识别";
      counts[p] = (counts[p] || 0) + 1;
    });
    var list = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    $("provChips").innerHTML = list.map(function (p) {
      return '<button class="chip" data-prov="' + esc(p) + '">' + esc(p) +
             '<span style="opacity:.55;margin-left:4px">' + counts[p] + "</span></button>";
    }).join("");
  }

  function renderSrcChips() {
    var list = META.sources || [];
    if (!list.length) {
      // 元数据缺失时从数据里现算，保证筛选器始终可用
      var counts = {};
      ROWS.forEach(function (r) {
        var k = r.src || "unknown";
        counts[k] = (counts[k] || 0) + 1;
      });
      list = Object.keys(counts).map(function (k) {
        return { key: k, label: k, n: counts[k] };
      }).sort(function (a, b) { return b.n - a.n; });
    }
    $("srcChips").innerHTML = list.map(function (s) {
      return '<button class="chip" data-src="' + esc(s.key) + '">' + esc(s.label) +
             '<span style="opacity:.55;margin-left:4px">' + s.n + "</span></button>";
    }).join("");
  }

  /* ---------------- 渲染总入口 ---------------- */
  function renderAll() {
    renderStats();
    renderCharts();
    renderTable();
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    $("updatedAt").textContent = META.generatedAt
      ? "数据更新于 " + META.generatedAt + " · 共 " + (META.count || ROWS.length) + " 条"
      : "";

    var map = [
      ["fDateFrom", "dateFrom", "str"], ["fDateTo", "dateTo", "str"],
      ["fSubMin", "subMin", "num"], ["fSubMax", "subMax", "num"],
      ["fRatioMin", "ratioMin", "num"], ["fRatioMax", "ratioMax", "num"],
      ["fEstMin", "estMin", "num"], ["fEstMax", "estMax", "num"]
    ];
    map.forEach(function (m) {
      $(m[0]).addEventListener("input", function (e) {
        var v = e.target.value.trim();
        state[m[1]] = (m[2] === "num") ? (v === "" ? null : parseFloat(v)) : v;
        applyFilters();
      });
    });

    $("fKeyword").addEventListener("input", function (e) {
      state.keyword = e.target.value;
      clearTimeout(this._t);
      this._t = setTimeout(applyFilters, 200);
    });

    $("fType").addEventListener("change", function (e) {
      state.type = e.target.value;
      applyFilters();
    });

    $("fSort").addEventListener("change", function (e) {
      state.sort = e.target.value;
      sortRows();
      state.page = 1;
      renderTable();
    });

    $("fPageSize").addEventListener("change", function (e) {
      state.pageSize = parseInt(e.target.value, 10);
      state.page = 1;
      renderTable();
    });

    $("btnExport").addEventListener("click", exportCSV);

    $("btnReset").addEventListener("click", function () {
      state.dateFrom = state.dateTo = state.keyword = state.type = "";
      state.subMin = state.subMax = state.ratioMin = state.ratioMax = null;
      state.estMin = state.estMax = null;
      state.validOnly = false;
      state.provinces.clear();
      state.sources.clear();
      state.sort = "pub_desc";
      state.page = 1;
      ["fDateFrom", "fDateTo", "fSubMin", "fSubMax", "fRatioMin", "fRatioMax",
       "fEstMin", "fEstMax", "fKeyword"].forEach(function (id) { $(id).value = ""; });
      $("fType").value = "";
      $("fSort").value = "pub_desc";
      document.querySelectorAll(".chip.on").forEach(function (c) { c.classList.remove("on"); });
      applyFilters();
    });

    $("btnToggleFilter").addEventListener("click", function () {
      var body = $("filterBody");
      var hidden = body.style.display === "none";
      body.style.display = hidden ? "" : "none";
      this.textContent = hidden ? "收起" : "展开";
    });

    // 快捷筛选
    document.addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b) return;

      if (b.dataset.date) {
        var days = parseInt(b.dataset.date, 10);
        var d = new Date();
        d.setDate(d.getDate() - days);
        var from = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        $("fDateFrom").value = from;
        $("fDateTo").value = "";
        state.dateFrom = from; state.dateTo = "";
        document.querySelectorAll('.chip[data-date]').forEach(function (c) { c.classList.remove("on"); });
        b.classList.add("on");
        applyFilters();
      } else if (b.dataset.sub) {
        var p = b.dataset.sub.split(",");
        $("fSubMin").value = p[0]; $("fSubMax").value = p[1] === "999999" ? "" : p[1];
        state.subMin = parseFloat(p[0]); state.subMax = p[1] === "999999" ? null : parseFloat(p[1]);
        document.querySelectorAll('.chip[data-sub]').forEach(function (c) { c.classList.remove("on"); });
        b.classList.add("on");
        applyFilters();
      } else if (b.dataset.ratio) {
        var q = b.dataset.ratio.split(",");
        $("fRatioMin").value = q[0]; $("fRatioMax").value = q[1] || "";
        state.ratioMin = q[0] ? parseFloat(q[0]) : null;
        state.ratioMax = q[1] ? parseFloat(q[1]) : null;
        document.querySelectorAll('.chip[data-ratio]').forEach(function (c) { c.classList.remove("on"); });
        b.classList.add("on");
        applyFilters();
      } else if (b.dataset.est) {
        var r2 = b.dataset.est.split(",");
        $("fEstMin").value = r2[0]; $("fEstMax").value = r2[1] || "";
        state.estMin = r2[0] ? parseFloat(r2[0]) : null;
        state.estMax = r2[1] ? parseFloat(r2[1]) : null;
        document.querySelectorAll('.chip[data-est]').forEach(function (c) { c.classList.remove("on"); });
        b.classList.add("on");
        applyFilters();
      } else if (b.dataset.valid) {
        b.classList.toggle("on");
        state.validOnly = b.classList.contains("on");
        applyFilters();
      } else if (b.dataset.prov) {
        var pv = b.dataset.prov;
        if (state.provinces.has(pv)) { state.provinces.delete(pv); b.classList.remove("on"); }
        else { state.provinces.add(pv); b.classList.add("on"); }
        applyFilters();
      } else if (b.dataset.src) {
        var sv = b.dataset.src;
        if (state.sources.has(sv)) { state.sources.delete(sv); b.classList.remove("on"); }
        else { state.sources.add(sv); b.classList.add("on"); }
        applyFilters();
      }
    });

    $("tbody").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-idx]");
      if (btn) openDetail(parseInt(btn.dataset.idx, 10));
    });

    $("pagerBtns").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-p]");
      if (!btn || btn.disabled) return;
      state.page = parseInt(btn.dataset.p, 10);
      renderTable();
      document.querySelector(".table-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    document.querySelector("thead").addEventListener("click", function (e) {
      var th = e.target.closest("th.sortable");
      if (!th) return;
      var key = th.dataset.sort;
      var cur = state.sort.split("_");
      var dir = (cur[0] === key && cur[1] === "desc") ? "asc" : "desc";
      state.sort = key + "_" + dir;
      $("fSort").value = state.sort;
      sortRows();
      state.page = 1;
      renderTable();
    });

    $("modal").addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
  }

  /* ---------------- 启动 ---------------- */
  // 只读快照，供自动化回归测试使用
  window.__BOUNTY_DEBUG__ = function () {
    return { sort: state.sort, page: state.page, pageSize: state.pageSize, rows: filtered.slice() };
  };

  document.addEventListener("DOMContentLoaded", function () {
    renderProvChips();
    renderSrcChips();
    bind();
    applyFilters();

    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(renderCharts, 160);
    });
  });
})();

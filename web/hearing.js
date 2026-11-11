/* 法院开庭公告看板 —— 纯原生 JS，无外部依赖 */
(function () {
  "use strict";

  var RAW = window.__HEARING_DATA__ || { meta: {}, rows: [] };
  var ROWS = RAW.rows || [];
  var META = RAW.meta || {};

  var SRC_LABEL = {
    rmfygg_kt: "公告网",
    court_schedule: "排期表"
  };
  var DEF_LABEL = {
    company: "企业",
    mixed: "企业+个人",
    person: "自然人",
    unknown: "未披露"
  };
  var GROUP_ORDER = ["建筑工程", "票据", "商标知产", "金融借贷", "公司股权",
                     "合同纠纷", "其他民商"];

  var state = {
    dateFrom: "", dateTo: "",
    daysMin: null, daysMax: null,
    amtMin: null, amtMax: null,        // 万元
    defTypes: new Set(),
    commercialOnly: false,
    groups: new Set(),
    provinces: new Set(),
    sources: new Set(),
    keyword: "",
    sort: "value_desc",
    page: 1,
    pageSize: 20
  };

  var filtered = ROWS.slice();

  // 线索价值：企业被告 > 商事案由 > 有涉案金额，同分再看谁先开庭
  function valueScore(r) {
    var s = 0;
    if (r.defType === "company" || r.defType === "mixed") s += 4;
    if (r.comm) s += 2;
    if (num(r.amount)) s += 1;
    return s;
  }

  /* ---------------- 工具 ---------------- */
  function $(id) { return document.getElementById(id); }
  function num(v) { return typeof v === "number" && isFinite(v); }
  function nval(v) { return (typeof v === "number" && isFinite(v)) ? v : NaN; }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
           "-" + String(d.getDate()).padStart(2, "0");
  }
  function dayDiff(a, b) {
    if (!a || !b) return null;
    var x = new Date(a + "T00:00:00"), y = new Date(b + "T00:00:00");
    if (isNaN(x) || isNaN(y)) return null;
    return Math.round((x - y) / 86400000);
  }
  function fmtMoney(v) {
    if (!num(v)) return '<span class="na">—</span>';
    if (v >= 1e8) return (v / 1e8).toFixed(2).replace(/\.?0+$/, "") + " 亿";
    if (v >= 1e4) return (v / 1e4).toFixed(v >= 1e5 ? 0 : 1).replace(/\.0$/, "") + " 万";
    return Math.round(v).toLocaleString("zh-CN");
  }
  function shortName(s, n) {
    s = s || "";
    return s.length > n ? s.slice(0, n) + "…" : s;
  }
  function daysOf(r) {
    // 以浏览器当天为基准重算，避免用导出时的快照日期
    return dayDiff(r.heaDate, todayStr());
  }

  /* ---------------- 筛选 ---------------- */
  function applyFilters() {
    var kw = state.keyword.trim().toLowerCase();
    var today = todayStr();

    filtered = ROWS.filter(function (r) {
      if (state.dateFrom && (r.heaDate || "") < state.dateFrom) return false;
      if (state.dateTo && (r.heaDate || "9999") > state.dateTo) return false;

      if (state.daysMin != null || state.daysMax != null) {
        var d = daysOf(r);
        if (d == null || d < 0) return false;
        if (state.daysMin != null && d < state.daysMin) return false;
        if (state.daysMax != null && d > state.daysMax) return false;
      }

      if (state.amtMin != null || state.amtMax != null) {
        if (!num(r.amount)) return false;
        if (state.amtMin != null && r.amount < state.amtMin * 1e4) return false;
        if (state.amtMax != null && r.amount > state.amtMax * 1e4) return false;
      }

      if (state.defTypes.size) {
        var t = r.defType || "unknown";
        if (!state.defTypes.has(t)) return false;
      }
      if (state.commercialOnly) {
        if (!r.comm) return false;
        if (r.heaDate && r.heaDate < today) return false;
      }
      if (state.groups.size) {
        var g = r.group || "未识别";
        if (!state.groups.has(g)) return false;
      }
      if (state.provinces.size) {
        if (!state.provinces.has(r.prov || "未识别")) return false;
      }
      if (state.sources.size) {
        if (!state.sources.has(r.src || "unknown")) return false;
      }
      if (kw) {
        var hay = [r.court, r.cause, r.plaintiff, r.defendant, r.caseNo,
                   r.room, r.snip].join(" ").toLowerCase();
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
      if (key === "value") {
        var sa = valueScore(a), sb = valueScore(b);
        if (sa !== sb) return (sa - sb) * dir;
        var ha = a.heaAt || "9999", hb = b.heaAt || "9999";
        if (ha !== hb) return ha < hb ? -1 : 1;
        return (b.id || 0) - (a.id || 0);
      }
      if (key === "hea") {
        var x = a.heaAt || "", y = b.heaAt || "";
        // 没有开庭时间的永远排最后，不随升降序翻转
        if (x && y) {
          if (x !== y) return x < y ? -dir : dir;
          return (b.id || 0) - (a.id || 0);
        }
        if (x) return -1;
        if (y) return 1;
        return (b.id || 0) - (a.id || 0);
      }
      if (key === "cause") {
        var cx = a.cause || "～", cy = b.cause || "～";
        return cx.localeCompare(cy, "zh") * dir;
      }
      var xv = nval(a[key]), yv = nval(b[key]);
      var hasX = !isNaN(xv), hasY = !isNaN(yv);
      if (hasX && hasY) {
        if (xv !== yv) return (xv - yv) * dir;
        return (b.id || 0) - (a.id || 0);
      }
      if (hasX) return -1;
      if (hasY) return 1;
      return (a.heaAt || "9999").localeCompare(b.heaAt || "9999");
    });
  }

  /* ---------------- 统计卡 ---------------- */
  function renderStats() {
    var n = filtered.length;
    var courts = new Set(), provs = new Set();
    var sumAmt = 0, amtCount = 0, entCount = 0, urgent = 0;

    filtered.forEach(function (r) {
      if (r.court) courts.add(r.court);
      if (r.prov) provs.add(r.prov);
      if (num(r.amount)) { sumAmt += r.amount; amtCount++; }
      if (r.defType === "company" || r.defType === "mixed") entCount++;
      var d = daysOf(r);
      if (d != null && d >= 15 && d <= 30) urgent++;
    });

    var cards = [
      { k: "开庭案件", v: n.toLocaleString("zh-CN"),
        d: n === ROWS.length ? "全量数据" : "占全量 " + ((n / (ROWS.length || 1)) * 100).toFixed(0) + "%" },
      { k: "企业被告", v: entCount.toLocaleString("zh-CN"),
        d: "占当前结果 " + (n ? ((entCount / n) * 100).toFixed(0) : 0) + "%" },
      { k: "15–30 天内开庭", v: urgent.toLocaleString("zh-CN"), d: "最紧急的应诉窗口" },
      { k: "涉案金额合计", v: fmtMoney(sumAmt), d: amtCount + " 条已披露金额" },
      { k: "覆盖法院", v: courts.size.toLocaleString("zh-CN"), d: "涉及 " + provs.size + " 个省级地区" }
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
    return { W: Math.max(host.clientWidth || 600, 240),
             H: Math.max(host.clientHeight || 200, 140) };
  }
  function emptyChart(host) {
    host.innerHTML = '<div class="empty" style="padding:66px 0">暂无数据</div>';
  }

  function drawBarChart(host, data) {
    host.innerHTML = "";
    if (!data.length || !data.some(function (d) { return d.v; })) { emptyChart(host); return; }
    var sz = chartSize(host), W = sz.W, H = sz.H;
    var PL = 34, PR = 12, PT = 16, PB = 26;
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H });
    var maxV = Math.max.apply(null, data.map(function (d) { return d.v; })) || 1;
    maxV = Math.ceil((maxV * 1.12) / 3) * 3 || 3;
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
      var x = PL + bw * i + bw * 0.18;
      var w = bw * 0.64;
      var rect = svgEl("rect", { x: x, y: PT + ih - h, width: w,
        height: Math.max(h, d.v ? 2 : 0), rx: 3, fill: d.color || "#0f766e", opacity: .88 });
      var ti = svgEl("title", {});
      ti.textContent = d.label + "：" + d.v + " 条";
      rect.appendChild(ti);
      svg.appendChild(rect);
      if (d.v) {
        var vt = svgEl("text", { x: x + w / 2, y: PT + ih - h - 5,
          "text-anchor": "middle", "font-size": 10, fill: "#475467" });
        vt.textContent = String(d.v);
        svg.appendChild(vt);
      }
      var lt = svgEl("text", { x: x + w / 2, y: H - 7, "text-anchor": "middle",
        "font-size": 10, fill: "#9aa1ad" });
      lt.textContent = d.label;
      svg.appendChild(lt);
    });
    host.appendChild(svg);
  }

  function drawHBarChart(host, data) {
    host.innerHTML = "";
    if (!data.length) { emptyChart(host); return; }
    var sz = chartSize(host), W = sz.W, H = sz.H;
    var PL = 92, PR = 38, PT = 10, PB = 12;
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H });
    var maxV = Math.max.apply(null, data.map(function (d) { return d.v; })) || 1;
    var iw = W - PL - PR, ih = H - PT - PB;
    var rowH = ih / data.length;

    data.forEach(function (d, i) {
      var y = PT + rowH * i;
      var label = svgEl("text", { x: PL - 8, y: y + rowH / 2 + 3.5,
        "text-anchor": "end", "font-size": 10.5, fill: "#475467" });
      label.textContent = d.label.length > 8 ? d.label.slice(0, 8) + "…" : d.label;
      svg.appendChild(label);

      svg.appendChild(svgEl("rect", { x: PL, y: y + rowH * 0.24, width: iw,
        height: rowH * 0.52, rx: 3, fill: "#f3f5f9" }));
      var w = Math.max((d.v / maxV) * iw, d.v ? 3 : 0);
      var rect = svgEl("rect", { x: PL, y: y + rowH * 0.24, width: w,
        height: rowH * 0.52, rx: 3, fill: d.color || "#0f766e", opacity: .85 });
      var ti = svgEl("title", {});
      ti.textContent = d.label + "：" + d.v + " 条";
      rect.appendChild(ti);
      svg.appendChild(rect);

      var vt = svgEl("text", { x: PL + w + 6, y: y + rowH / 2 + 3.5,
        "font-size": 10, fill: "#475467" });
      vt.textContent = String(d.v);
      svg.appendChild(vt);
    });
    host.appendChild(svg);
  }

  function renderCharts() {
    // 1) 开庭日程：按未来 8 周分桶
    var today = todayStr();
    var weeks = [];
    for (var i = 0; i < 8; i++) {
      weeks.push({ label: i === 0 ? "本周" : "+" + i + " 周", v: 0 });
    }
    filtered.forEach(function (r) {
      var d = dayDiff(r.heaDate, today);
      if (d == null || d < 0) return;
      var w = Math.floor(d / 7);
      if (w < 8) weeks[w].v++;
    });
    drawBarChart($("chartTrend"), weeks);
    var total = weeks.reduce(function (s, x) { return s + x.v; }, 0);
    $("trendHint").textContent = total ? "未来 8 周共 " + total + " 个庭" : "";

    // 2) 案由 TOP8
    var byCause = {};
    filtered.forEach(function (r) {
      if (!r.cause) return;
      byCause[r.cause] = (byCause[r.cause] || 0) + 1;
    });
    var causes = Object.keys(byCause).map(function (k) {
      return { label: k, v: byCause[k] };
    }).sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
    drawHBarChart($("chartCause"), causes);

    // 3) 地区 TOP8
    var byProv = {};
    filtered.forEach(function (r) {
      if (!r.prov) return;
      byProv[r.prov] = (byProv[r.prov] || 0) + 1;
    });
    var provs = Object.keys(byProv).map(function (k) {
      return { label: k, v: byProv[k] };
    }).sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
    drawHBarChart($("chartProv"), provs);
  }

  /* ---------------- 表格 ---------------- */
  function daysBadge(r) {
    var d = daysOf(r);
    if (d == null) return '<span class="days tbd">待定</span>';
    if (d < 0) return '<span class="days past">已开庭</span>';
    var cls = d <= 7 ? "hot" : d <= 15 ? "soon" : d <= 30 ? "plan" : "far";
    return '<span class="days ' + cls + '">' + (d === 0 ? "今天" : d + " 天") + "</span>";
  }

  function defCell(r) {
    if (!r.defendant) {
      return '<span class="na">未披露</span>';
    }
    var names = String(r.defendant).split(/[;；、,，]/).filter(Boolean);
    var first = names[0] || "";
    var extra = names.length > 1 ? " 等 " + names.length + " 个主体" : "";
    var mark = (r.defType === "company" || r.defType === "mixed")
      ? '<span class="ent">企业</span>' : "";
    return '<span class="party-name" title="' + esc(r.defendant) + '">' +
      esc(shortName(first, 16)) + esc(extra) + "</span>" + mark;
  }

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
      var g = r.group || "未识别";
      var gcls = g === "未识别" ? "g-none" : "g-" + g;
      var time = r.heaDate
        ? '<div class="hearing-time">' + esc((r.heaAt || r.heaDate).slice(5, 16)) +
          (r.est ? '<span class="est-mark" title="公告未载明具体时刻，按公告期+答辩期推算">推算</span>' : "") +
          "</div>"
        : '<div class="hearing-time na">未定期</div>';
      return "<tr>" +
        '<td class="c-hearing"><div class="hearing-cell">' + time +
          '<div class="hearing-sub">' + daysBadge(r) + "</div></div></td>" +
        '<td class="c-court"><div class="court-name">' + esc(shortName(r.court || "—", 18)) +
          '</div><div class="court-sub">' + esc(r.prov || "未识别") +
          (r.city ? " · " + esc(r.city) : "") + "</div></td>" +
        '<td class="c-cause">' + esc(r.cause || "—") +
          '<div class="court-sub"><span class="tag ' + gcls + '">' + esc(g) + "</span></div></td>" +
        '<td class="c-party">' + defCell(r) + "</td>" +
        '<td class="c-party"><span class="party-name" title="' + esc(r.plaintiff || "") + '">' +
          (r.plaintiff ? esc(shortName(r.plaintiff, 16)) : '<span class="na">未披露</span>') + "</span></td>" +
        '<td class="c-case"><span class="case-no">' + esc(r.caseNo || "—") + "</span></td>" +
        '<td class="c-num">' + (num(r.amount)
          ? '<span class="money' + (r.amount >= 1e6 ? " big" : "") + '">' + fmtMoney(r.amount) + "</span>"
          : '<span class="na">—</span>') + "</td>" +
        '<td class="c-room">' + esc(shortName(r.room || "—", 14)) + "</td>" +
        '<td class="c-type"><span class="tag">' + esc(SRC_LABEL[r.src] || r.src || "—") + "</span></td>" +
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
    var list = Array.from(nums).filter(function (n) { return n >= 1 && n <= pages; })
      .sort(function (a, b) { return a - b; });
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
    var key = state.sort.split("_")[0];
    Array.prototype.forEach.call(document.querySelectorAll("th.sortable"), function (th) {
      th.classList.remove("asc", "desc");
      if (th.dataset.sort === key) th.classList.add(state.sort.split("_")[1]);
    });
  }

  /* ---------------- 详情 ---------------- */
  function openDetail(idx) {
    var r = filtered[idx];
    if (!r) return;
    $("mTitle").textContent = r.court || "开庭公告详情";

    var d = daysOf(r);
    var rows = [
      ["案由", esc(r.cause || "未识别") + (r.group ? ' <span class="tag">' + esc(r.group) + "</span>" : "")],
      ["案号", esc(r.caseNo || "—")],
      ["开庭时间", r.heaAt ? "<b>" + esc(r.heaAt) + "</b>" +
        (r.est ? ' <span class="est-mark">推算</span>' : "") +
        (d != null ? "（" + (d < 0 ? "已开庭" : d + " 天后") + "）" : "") : "未定期"],
      ["法庭", esc(r.room || "—")],
      ["原告", esc(r.plaintiff || "未披露")],
      ["被告", esc(r.defendant || "未披露") +
        (r.defType ? "（" + (DEF_LABEL[r.defType] || r.defType) + "）" : "")],
      ["涉案金额", num(r.amount) ? "<b>" + fmtMoney(r.amount) + "</b>（" +
        Math.round(r.amount).toLocaleString("zh-CN") + " 元）" : "未披露",
        ],
      ["金额依据", esc(r.amtBasis || "—")],
      ["公告类型", esc(r.ntype || "—")],
      ["发布日期", esc(r.pub || "—")],
      ["数据源", esc(SRC_LABEL[r.src] || r.src || "—")],
      ["解析置信度", num(r.q) ? Math.round(r.q * 100) + "%" : "—"]
    ];
    var html = '<dl class="kv">' + rows.map(function (x) {
      return "<dt>" + x[0] + "</dt><dd>" + x[1] + "</dd>";
    }).join("") + "</dl>";
    html += '<div style="font-size:12px;color:var(--muted);margin-bottom:6px">公告正文（节选）</div>';
    html += '<div class="fulltext">' + esc(r.snip || "（无正文）") + "</div>";
    $("mContent").innerHTML = html;

    var link = $("mLink");
    if (r.url) { link.href = r.url; link.style.display = ""; }
    else link.style.display = "none";
    $("modal").hidden = false;
  }

  /* ---------------- CSV ---------------- */
  function exportCSV() {
    var head = ["开庭时间", "距开庭(天)", "法院", "省份", "城市", "案由", "案由分组",
                "原告", "被告", "被告类型", "案号", "涉案金额(元)", "法庭",
                "公告类型", "发布日期", "数据源", "公告链接"];
    var lines = [head.join(",")];
    filtered.forEach(function (r) {
      var d = daysOf(r);
      var cells = [
        r.heaAt || "", d == null ? "" : d, r.court, r.prov, r.city, r.cause,
        r.group, r.plaintiff, r.defendant, DEF_LABEL[r.defType] || "",
        r.caseNo, num(r.amount) ? Math.round(r.amount) : "", r.room,
        r.ntype, r.pub, SRC_LABEL[r.src] || r.src, r.url
      ];
      lines.push(cells.map(function (c) {
        var s = c == null ? "" : String(c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(","));
    });
    var blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "法院开庭公告_" + todayStr() + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  /* ---------------- chips ---------------- */
  function renderGroupChips() {
    var counts = {};
    ROWS.forEach(function (r) {
      var g = r.group || "未识别";
      counts[g] = (counts[g] || 0) + 1;
    });
    var list = GROUP_ORDER.filter(function (g) { return counts[g]; });
    if (counts["未识别"]) list.push("未识别");
    $("groupChips").innerHTML = list.map(function (g) {
      return '<button class="chip" data-group="' + esc(g) + '">' + esc(g) +
             '<span style="opacity:.55;margin-left:4px">' + counts[g] + "</span></button>";
    }).join("");
  }

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
      var counts = {};
      ROWS.forEach(function (r) {
        var k = r.src || "unknown";
        counts[k] = (counts[k] || 0) + 1;
      });
      list = Object.keys(counts).map(function (k) {
        return { key: k, label: SRC_LABEL[k] || k, n: counts[k] };
      }).sort(function (a, b) { return b.n - a.n; });
    }
    $("srcChips").innerHTML = list.map(function (s) {
      return '<button class="chip" data-src="' + esc(s.key) + '">' + esc(s.label) +
             '<span style="opacity:.55;margin-left:4px">' + s.n + "</span></button>";
    }).join("");
  }

  function renderAll() {
    renderStats();
    renderCharts();
    renderTable();
  }

  /* ---------------- 事件 ---------------- */
  function bind() {
    $("updatedAt").textContent = META.generatedAt
      ? "数据更新于 " + META.generatedAt + " · 共 " + (META.count || ROWS.length) + " 条"
      : "";

    [["fDateFrom", "dateFrom"], ["fDateTo", "dateTo"]].forEach(function (m) {
      $(m[0]).addEventListener("input", function (e) {
        state[m[1]] = e.target.value.trim();
        applyFilters();
      });
    });

    [["fAmtMin", "amtMin"], ["fAmtMax", "amtMax"]].forEach(function (m) {
      $(m[0]).addEventListener("input", function (e) {
        var v = e.target.value.trim();
        state[m[1]] = v === "" ? null : parseFloat(v);
        applyFilters();
      });
    });

    $("fDefType").addEventListener("change", function (e) {
      state.defTypes = new Set(e.target.value ? e.target.value.split(",") : []);
      applyFilters();
    });

    $("chipCommercial").addEventListener("click", function () {
      this.classList.toggle("on");
      state.commercialOnly = this.classList.contains("on");
      applyFilters();
    });

    $("fKeyword").addEventListener("input", function (e) {
      state.keyword = e.target.value;
      clearTimeout(this._t);
      this._t = setTimeout(applyFilters, 200);
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

    $("btnPreset").addEventListener("click", function () {
      // 精准口径：企业被告 + 商事 + 15~30 天
      state.defTypes = new Set(["company", "mixed"]);
      state.commercialOnly = true;
      state.daysMin = 15;
      state.daysMax = 30;
      state.dateFrom = state.dateTo = state.keyword = "";
      state.amtMin = state.amtMax = null;
      state.groups.clear();
      state.provinces.clear();
      state.sources.clear();
      $("fDefType").value = "company,mixed";
      $("chipCommercial").classList.add("on");
      $("fDateFrom").value = ""; $("fDateTo").value = "";
      $("fAmtMin").value = ""; $("fAmtMax").value = "";
      $("fKeyword").value = "";
      document.querySelectorAll(".chip.on").forEach(function (c) { c.classList.remove("on"); });
      $("chipCommercial").classList.add("on");
      document.querySelectorAll('.chip[data-days="15,30"]').forEach(function (c) { c.classList.add("on"); });
      applyFilters();
      document.querySelector(".table-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    $("btnReset").addEventListener("click", function () {
      state.dateFrom = state.dateTo = state.keyword = "";
      state.daysMin = state.daysMax = null;
      state.amtMin = state.amtMax = null;
      state.defTypes.clear();
      state.commercialOnly = false;
      state.groups.clear();
      state.provinces.clear();
      state.sources.clear();
      state.sort = "value_desc";
      state.page = 1;
      ["fDateFrom", "fDateTo", "fAmtMin", "fAmtMax", "fKeyword"].forEach(function (id) {
        $(id).value = "";
      });
      $("fDefType").value = "";
      $("fSort").value = "value_desc";
      document.querySelectorAll(".chip.on").forEach(function (c) { c.classList.remove("on"); });
      applyFilters();
    });

    $("btnToggleFilter").addEventListener("click", function () {
      var body = $("filterBody");
      var hidden = body.style.display === "none";
      body.style.display = hidden ? "" : "none";
      this.textContent = hidden ? "收起" : "展开";
    });

    document.addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b || b.id === "chipCommercial") return;

      if (b.dataset.days) {
        var p = b.dataset.days.split(",");
        state.daysMin = parseInt(p[0], 10);
        state.daysMax = parseInt(p[1], 10);
        state.dateFrom = state.dateTo = "";
        $("fDateFrom").value = ""; $("fDateTo").value = "";
        document.querySelectorAll('.chip[data-days]').forEach(function (c) { c.classList.remove("on"); });
        b.classList.add("on");
        applyFilters();
      } else if (b.dataset.amt) {
        var q = b.dataset.amt.split(",");
        state.amtMin = parseFloat(q[0]);
        state.amtMax = q[1] === "9999999" ? null : parseFloat(q[1]);
        $("fAmtMin").value = q[0];
        $("fAmtMax").value = q[1] === "9999999" ? "" : q[1];
        document.querySelectorAll('.chip[data-amt]').forEach(function (c) { c.classList.remove("on"); });
        b.classList.add("on");
        applyFilters();
      } else if (b.dataset.group) {
        var g = b.dataset.group;
        if (state.groups.has(g)) { state.groups.delete(g); b.classList.remove("on"); }
        else { state.groups.add(g); b.classList.add("on"); }
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
      // 开庭时间列先看临期（升序）；金额等数值列先看降序（最大的在最前）
      var dir;
      if (key === "hea") {
        dir = (cur[0] === key && cur[1] === "asc") ? "desc" : "asc";
      } else {
        dir = (cur[0] === key && cur[1] === "desc") ? "asc" : "desc";
      }
      state.sort = key + "_" + dir;
      $("fSort").value = state.sort;
      sortRows();
      state.page = 1;
      renderTable();
    });

    $("modal").addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) $("modal").hidden = true;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") $("modal").hidden = true;
    });
  }

  /* ---------------- 启动 ---------------- */
  window.__HEARING_DEBUG__ = function () {
    return { sort: state.sort, page: state.page, pageSize: state.pageSize,
             rows: filtered.slice(), state: state };
  };

  document.addEventListener("DOMContentLoaded", function () {
    renderGroupChips();
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

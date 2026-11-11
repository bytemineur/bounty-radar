/* 看板交互回归测试：注入到 index.html 后由 Chrome headless 执行 */
(function () {
  var OUT = [];
  function log(s) { OUT.push("TEST| " + s); }
  var ROWS = window.__BOUNTY_DATA__.rows;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function $id(i) { return document.getElementById(i); }
  function nval(v) { return (typeof v === "number" && isFinite(v)) ? v : NaN; }

  function setNum(id, v) { var e = $id(id); e.value = v; e.dispatchEvent(new Event("input")); }
  function setSel(id, v) { var e = $id(id); e.value = v; e.dispatchEvent(new Event("change")); }
  function setTxt(id, v) { var e = $id(id); e.value = v; e.dispatchEvent(new Event("input")); }
  function clickQ(sel) {
    var c = document.querySelector(sel);
    if (!c) { log("FAIL missing control " + sel); return false; }
    c.click();
    return true;
  }
  function cur() { return window.__BOUNTY_DEBUG__(); }
  function count() { var m = $id("resultCount").textContent.match(/(\d+)/); return m ? +m[1] : -1; }

  /* 独立参考实现：全部筛选 + 排序 */
  function ref(s) {
    var today = (function () {
      var d = new Date();
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0");
    })();
    var out = ROWS.filter(function (r) {
      if (s.dateFrom && (r.pub || "") < s.dateFrom) return false;
      if (s.dateTo && (r.pub || "9999") > s.dateTo) return false;
      if (s.subMin != null || s.subMax != null) {
        if (isNaN(nval(r.subject))) return false;
        if (s.subMin != null && r.subject < s.subMin * 1e4) return false;
        if (s.subMax != null && r.subject > s.subMax * 1e4) return false;
      }
      if (s.ratioMin != null || s.ratioMax != null) {
        if (isNaN(nval(r.ratio))) return false;
        if (s.ratioMin != null && r.ratio < s.ratioMin) return false;
        if (s.ratioMax != null && r.ratio > s.ratioMax) return false;
      }
      if (s.estMin != null || s.estMax != null) {
        if (isNaN(nval(r.est))) return false;
        if (s.estMin != null && r.est < s.estMin) return false;
        if (s.estMax != null && r.est > s.estMax) return false;
      }
      if (s.type && r.type !== s.type) return false;
      if (s.validOnly) { if (!r.vto || r.vto < today) return false; }
      if (s.prov && (r.prov || "未识别") !== s.prov) return false;
      if (s.kw) {
        var hay = ((r.court || "") + " " + (r.debtor || "") + " " + (r.caseNo || "") + " " + (r.body || "")).toLowerCase();
        if (hay.indexOf(s.kw.toLowerCase()) === -1) return false;
      }
      return true;
    });
    return out;
  }

  function checkIds(label, expect) {
    var got = cur().rows;
    var gi = got.map(function (r) { return r.id; }).join(",");
    var ei = expect.map(function (r) { return r.id; }).join(",");
    if (gi === ei) { log("PASS " + label + "  (" + got.length + " 条)"); return true; }
    // 找出第一处差异
    var k = 0;
    while (k < Math.min(got.length, expect.length) && got[k].id === expect[k].id) k++;
    log("FAIL " + label + " 期望 " + expect.length + " 条 / 实得 " + got.length +
        " 条；首处差异 idx=" + k + " 期望id=" + (expect[k] && expect[k].id) +
        " 实得id=" + (got[k] && got[k].id));
    return false;
  }

  function checkOrder(label, key, dir) {
    var rows = cur().rows;
    var vals = rows.map(function (r) { return nval(r[key]); });
    var bad = 0, prevSeenNull = false, nullNotLast = 0;
    for (var i = 0; i < vals.length; i++) {
      if (isNaN(vals[i])) { prevSeenNull = true; continue; }
      if (prevSeenNull) nullNotLast++;              // 有值出现在空值之后 → 空值没排最后
      if (i > 0 && !isNaN(vals[i - 1])) {
        var d = dir === "asc" ? vals[i] - vals[i - 1] : vals[i - 1] - vals[i];
        if (d < -1e-9) bad++;
      }
    }
    var head = vals.filter(function (v) { return !isNaN(v); }).slice(0, 3);
    if (!bad && !nullNotLast) {
      log("PASS 排序 " + label + "  " + rows.length + " 条，前三值 " + head.join(" / "));
    } else {
      log("FAIL 排序 " + label + "  逆序对=" + bad + " 空值未置尾=" + nullNotLast + " 前五=" +
          vals.slice(0, 5).join(","));
    }
  }

  /* 日期列按字符串比较，单独校验 */
  function checkDateOrder(label, dir) {
    var rows = cur().rows;
    var bad = 0, empty = 0, prevEmpty = false, emptyNotLast = 0;
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i].pub || "";
      if (!v) { empty++; prevEmpty = true; continue; }
      if (prevEmpty) emptyNotLast++;
      var p = i > 0 ? (rows[i - 1].pub || "") : "";
      if (p) {
        if (dir === "asc" ? v < p : v > p) bad++;
      }
    }
    log((bad || emptyNotLast ? "FAIL" : "PASS") + " 排序 " + label +
        "  逆序对=" + bad + " 空日期未置尾=" + emptyNotLast +
        " 首行=" + (rows[0] && rows[0].pub) + " 末行=" + (rows[rows.length - 1] && rows[rows.length - 1].pub));
  }

  function checkDom(label) {
    var rows = cur().rows;
    var trs = document.querySelectorAll("#tbody tr");
    var size = cur().pageSize;
    var expLen = Math.min(size, rows.length);
    if (trs.length !== expLen) { log("FAIL DOM " + label + " 行数 " + trs.length + " != " + expLen); return; }
    var bad = 0;
    for (var i = 0; i < Math.min(5, expLen); i++) {
      var court = trs[i].querySelector(".court-name").textContent;
      if (court !== (rows[i].court || "—")) bad++;
    }
    log((bad ? "FAIL" : "PASS") + " DOM " + label + " 前5行法院与数据一致" + (bad ? " 不符=" + bad : ""));
  }

  async function run() {
    var base = ROWS.length;
    log("数据总量 " + base + " 条");

    /* ---------- 1. 排序：表头点击 ---------- */
    var sorts = [
      ["subject", "执行标的"], ["ratio", "奖励比例"],
      ["est", "预估奖励"], ["cap", "封顶"], ["pub", "发布日期"]
    ];
    for (var i = 0; i < sorts.length; i++) {
      var key = sorts[i][0], label = sorts[i][1];
      var th = document.querySelector('th.sortable[data-sort="' + key + '"]');
      if (!th) { log("FAIL 表头不可点 " + label); continue; }
      th.click(); await sleep(30);
      if (cur().sort !== key + "_desc") log("FAIL 表头点击 " + label + " state.sort=" + cur().sort);
      if (!th.classList.contains("desc")) log("FAIL 表头 " + label + " 无降序箭头标记");
      if (key === "pub") checkDateOrder(label + " ↓", "desc"); else checkOrder(label + " ↓", key, "desc");
      checkDom(label + " ↓");

      th.click(); await sleep(30);
      if (cur().sort !== key + "_asc") log("FAIL 表头二次点击 " + label + " state.sort=" + cur().sort);
      if (!th.classList.contains("asc")) log("FAIL 表头 " + label + " 无升序箭头标记");
      if (key === "pub") checkDateOrder(label + " ↑", "asc"); else checkOrder(label + " ↑", key, "asc");
    }

    // 表头排序与下拉框应联动
    document.querySelector('th.sortable[data-sort="subject"]').click(); await sleep(30);
    log(($id("fSort").value === "subject_desc" ? "PASS" : "FAIL") +
        " 表头点击回写排序下拉 " + $id("fSort").value);

    /* ---------- 2. 排序下拉 ---------- */
    setSel("fSort", "subject_desc"); await sleep(30);
    checkOrder("下拉 执行标的↓", "subject", "desc");
    setSel("fSort", "est_asc"); await sleep(30);
    checkOrder("下拉 预估奖励↑", "est", "asc");

    /* ---------- 3. 日期区间 ---------- */
    $id("btnReset").click(); await sleep(30);
    setNum("fDateFrom", "2026-01-01"); await sleep(30);
    checkIds("发布日期 ≥ 2026-01-01", ref({ dateFrom: "2026-01-01" }));
    setNum("fDateTo", "2026-06-30"); await sleep(30);
    checkIds("发布日期 2026 上半年", ref({ dateFrom: "2026-01-01", dateTo: "2026-06-30" }));
    var dif = ROWS.filter(function (r) { return r.pub && r.pub >= "2026-01-01" && r.pub <= "2026-06-30"; }).length;
    log((count() === dif && dif > 0 ? "PASS" : "FAIL") + " 日期筛选计数 看板=" + count() + " 参考=" + dif);

    /* ---------- 4. 执行标的 ---------- */
    $id("btnReset").click(); await sleep(30);
    setNum("fSubMin", 500); await sleep(30);
    checkIds("执行标的 ≥ 500万", ref({ subMin: 500 }));
    setNum("fSubMax", 5000); await sleep(30);
    checkIds("执行标的 500万–5000万", ref({ subMin: 500, subMax: 5000 }));
    if (!clickQ('.chip[data-sub="50,500"]')) log("FAIL 缺 chip");
    await sleep(30);
    log((($id("fSubMin").value === "50" && $id("fSubMax").value === "500") ? "PASS" : "FAIL") +
        " 快捷 chip 50–500万 回填输入框 " + $id("fSubMin").value + "~" + $id("fSubMax").value);
    checkIds("快捷 chip 50–500万", ref({ subMin: 50, subMax: 500 }));
    if (!clickQ('.chip[data-sub="500,999999"]')) log("FAIL 缺 chip");
    await sleep(30);
    checkIds("快捷 chip 500万以上", ref({ subMin: 500 }));

    /* ---------- 5. 奖励比例 ---------- */
    $id("btnReset").click(); await sleep(30);
    setNum("fRatioMin", 10); await sleep(30);
    checkIds("奖励比例 ≥ 10%", ref({ ratioMin: 10 }));
    setNum("fRatioMax", 30); await sleep(30);
    checkIds("奖励比例 10%–30%", ref({ ratioMin: 10, ratioMax: 30 }));
    $id("btnReset").click(); await sleep(30);
    if (!clickQ('.chip[data-ratio=",5"]')) log("FAIL 缺 chip");
    await sleep(30);
    checkIds("快捷 chip ≤5%", ref({ ratioMax: 5 }));
    var n5 = ROWS.filter(function (r) { return !isNaN(nval(r.ratio)) && r.ratio <= 5; }).length;
    var lbl5 = document.querySelector('.chip[data-ratio=",5"]').textContent;
    log((lbl5 === "≤5%" ? "PASS" : "FAIL") + " 快捷 chip 文案与口径一致（" + lbl5 + "）");
    log((count() === n5 ? "PASS" : "FAIL") + " 快捷 ≤5% 计数 看板=" + count() + " 参考=" + n5);
    var chartTxt = $id("chartRatio").textContent;
    log((chartTxt.indexOf("≤5%") >= 0 && chartTxt.indexOf("6–10%") >= 0 ? "PASS" : "FAIL") +
        " 比例图表分桶与筛选口径一致");
    if (!clickQ('.chip[data-ratio="20,"]')) log("FAIL 缺 chip");
    await sleep(30);
    checkIds("快捷 chip ≥20%", ref({ ratioMin: 20 }));

    /* ---------- 6. 预估奖励 ---------- */
    $id("btnReset").click(); await sleep(30);
    setNum("fEstMin", 100000); await sleep(30);
    checkIds("预估奖励 ≥ 10万", ref({ estMin: 100000 }));
    if (!clickQ('.chip[data-est="1000000,"]')) log("FAIL 缺 chip");
    await sleep(30);
    checkIds("快捷 chip 预估 ≥100万", ref({ estMin: 1000000 }));

    /* ---------- 7. 类型 / 有效期 ---------- */
    $id("btnReset").click(); await sleep(30);
    setSel("fType", "property"); await sleep(30);
    checkIds("类型 = 财产线索", ref({ type: "property" }));
    $id("btnReset").click(); await sleep(30);
    if (!clickQ('.chip[data-valid="1"]')) log("FAIL 缺 chip");
    await sleep(30);
    checkIds("仅悬赏期内", ref({ validOnly: true }));

    /* ---------- 8. 关键词 ---------- */
    $id("btnReset").click(); await sleep(30);
    setTxt("fKeyword", "建设"); await sleep(320);
    checkIds("关键词 建设", ref({ kw: "建设" }));

    /* ---------- 9. 地区 ---------- */
    $id("btnReset").click(); await sleep(30);
    var provChip = document.querySelector('#provChips .chip[data-prov]');
    if (provChip) {
      var pv = provChip.dataset.prov;
      provChip.click(); await sleep(30);
      checkIds("地区 = " + pv, ref({ prov: pv }));
      provChip.click(); await sleep(30);
      log((count() === base ? "PASS" : "FAIL") + " 地区再点一次取消 回到 " + count() + "/" + base);
    } else log("FAIL 地区 chip 未渲染");

    /* ---------- 10. 组合筛选 ---------- */
    $id("btnReset").click(); await sleep(30);
    setNum("fRatioMin", 10);
    setNum("fSubMin", 50);
    await sleep(50);
    checkIds("组合：比例≥10% 且 标的≥50万", ref({ ratioMin: 10, subMin: 50 }));
    checkDateOrder("组合结果 按当前排序", "desc");

    /* ---------- 11. 分页 / 每页条数 ---------- */
    $id("btnReset").click(); await sleep(30);
    setSel("fPageSize", "50"); await sleep(40);
    log((document.querySelectorAll("#tbody tr").length === 50 ? "PASS" : "FAIL") +
        " 每页50 实际行数 " + document.querySelectorAll("#tbody tr").length);
    var p2 = document.querySelector('#pagerBtns button[data-p="2"]');
    if (p2) {
      p2.click(); await sleep(40);
      log((cur().page === 2 && $id("pageInfo").textContent.indexOf("第 2") === 0 ? "PASS" : "FAIL") +
          " 翻到第2页 " + $id("pageInfo").textContent);
    } else log("FAIL 分页按钮缺失");
    setSel("fPageSize", "20"); await sleep(30);

    /* ---------- 12. 重置 ---------- */
    $id("btnReset").click(); await sleep(40);
    log((count() === base && cur().sort === "pub_desc" ? "PASS" : "FAIL") +
        " 重置回全量 " + count() + "/" + base + " sort=" + cur().sort);

    /* ---------- 13. 详情弹窗 ---------- */
    setSel("fSort", "subject_desc"); await sleep(40);
    var btn = document.querySelector('#tbody button[data-idx="0"]');
    btn.click(); await sleep(40);
    var modalOpen = !$id("modal").hidden;
    var mText = $id("mContent").textContent;
    var top = cur().rows[0];
    log((modalOpen && mText.indexOf((top.debtor || "").slice(0, 4)) >= 0 ? "PASS" : "FAIL") +
        " 详情弹窗内容对应当前首行（" + (top.debtor || "—") + " / " + top.court + "）");
    $id("modal").hidden = true;

    document.title = "DONE";
    var pre = document.createElement("pre");
    pre.id = "testout";
    pre.textContent = OUT.join("\n");
    document.body.appendChild(pre);
  }

  window.addEventListener("load", function () {
    setTimeout(function () {
      run().catch(function (e) {
        var pre = document.createElement("pre");
        pre.id = "testout";
        pre.textContent = "TEST| CRASH " + (e && e.stack || e);
        document.body.appendChild(pre);
        document.title = "DONE";
      });
    }, 500);
  });
})();

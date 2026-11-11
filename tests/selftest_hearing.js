/* 开庭看板交互回归：注入 hearings.html 后运行，输出 TEST| 行供 run_ui_test.py 解析 */
(function () {
  "use strict";
  var out = [];
  function log(s) { out.push("TEST| " + s); }
  function ok(name, cond, extra) {
    log((cond ? "PASS " : "FAIL ") + name + (extra ? " :: " + extra : ""));
  }
  function dbg() { return window.__HEARING_DEBUG__(); }
  function rows() { return dbg().rows; }
  function $s(sel) { return document.querySelector(sel); }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
           "-" + String(d.getDate()).padStart(2, "0");
  }
  function days(r) {
    if (!r.heaDate) return null;
    var x = new Date(r.heaDate + "T00:00:00"), y = new Date(todayStr() + "T00:00:00");
    return Math.round((x - y) / 86400000);
  }

  function resetAll() { document.getElementById("btnReset").click(); }

  function start() {
  try {
    // ---------- 0. 数据加载 ----------
    ok("数据已加载", rows().length > 0, "全量 " + rows().length + " 条");
    ok("表格渲染 20 行", document.querySelectorAll("#tbody tr").length === 20,
       "实际 " + document.querySelectorAll("#tbody tr").length);

    var statsTxt = document.getElementById("stats").textContent;
    ok("统计卡含企业被告", statsTxt.indexOf("企业被告") >= 0);

    // ---------- 1. 开庭倒计时筛选 ----------
    resetAll();
    var chip = $s('.chip[data-days="15,30"]');
    ok("存在 15–30 天快捷筛选", !!chip);
    chip.click();
    var rs = rows();
    var bad = rs.filter(function (r) {
      var d = days(r);
      return d == null || d < 15 || d > 30;
    });
    ok("15–30 天筛选结果全部落在区间内", rs.length > 0 && bad.length === 0,
       "共 " + rs.length + " 条，越界 " + bad.length);

    // ---------- 2. 被告类型筛选 ----------
    resetAll();
    var sel = document.getElementById("fDefType");
    sel.value = "company,mixed";
    sel.dispatchEvent(new Event("change"));
    rs = rows();
    var badDef = rs.filter(function (r) {
      return r.defType !== "company" && r.defType !== "mixed";
    });
    ok("企业被告筛选只留企业/混合", rs.length > 0 && badDef.length === 0,
       "共 " + rs.length + " 条，越界 " + badDef.length);

    // ---------- 3. 涉案金额筛选 ----------
    resetAll();
    var amtChip = $s('.chip[data-amt="50,500"]');
    amtChip.click();
    rs = rows();
    var badAmt = rs.filter(function (r) {
      return typeof r.amount !== "number" || r.amount < 50 * 1e4 || r.amount > 500 * 1e4;
    });
    ok("50–500 万金额筛选生效", rs.length > 0 && badAmt.length === 0,
       "共 " + rs.length + " 条，越界 " + badAmt.length);

    // ---------- 4. 案由分组 ----------
    resetAll();
    var gc = $s('.chip[data-group="建筑工程"]');
    ok("存在案由分组 chip", !!gc);
    if (gc) {
      gc.click();
      rs = rows();
      var badG = rs.filter(function (r) { return r.group !== "建筑工程"; });
      ok("案由分组筛选生效", rs.length > 0 && badG.length === 0,
         "共 " + rs.length + " 条，越界 " + badG.length);
    }

    // ---------- 5. 表头排序：涉案金额 ----------
    resetAll();
    var th = $s('th[data-sort="amount"]');
    th.click();      // 首次点击 = 降序
    rs = rows();
    var nums = rs.map(function (r) { return r.amount; })
      .filter(function (v) { return typeof v === "number"; });
    var desc = true;
    for (var i = 1; i < nums.length; i++) if (nums[i] > nums[i - 1] + 1e-9) desc = false;
    ok("涉案金额表头降序排序", nums.length > 1 && desc,
       "可比 " + nums.length + " 条，首值 " + (nums[0] || 0));
    var hasMark = th.classList.contains("desc") || th.classList.contains("asc");
    ok("排序表头有方向标记", hasMark);

    // 再点一次 = 升序
    th.click();
    rs = rows();
    nums = rs.map(function (r) { return r.amount; })
      .filter(function (v) { return typeof v === "number"; });
    var asc = true;
    for (var j = 1; j < nums.length; j++) if (nums[j] < nums[j - 1] - 1e-9) asc = false;
    ok("涉案金额表头升序排序", nums.length > 1 && asc);

    // ---------- 6. 开庭时间排序 ----------
    resetAll();
    var th2 = $s('th[data-sort="hea"]');
    th2.click();
    rs = rows();
    var dates = rs.map(function (r) { return r.heaAt || "9999"; });
    var sortedAsc = true;
    for (var k = 1; k < dates.length; k++) if (dates[k] < dates[k - 1]) sortedAsc = false;
    ok("开庭时间排序生效", dates.length > 0 && sortedAsc, "首条 " + dates[0]);

    // ---------- 7. 关键词 ----------
    resetAll();
    var kw = document.getElementById("fKeyword");
    kw.value = "建设工程";
    kw.dispatchEvent(new Event("input"));
    // 关键词有 200ms 防抖
    log("WAIT 关键词防抖");
  } catch (e) {
    log("CRASH " + (e && e.message ? e.message : e));
  }

  // 第二部分：等防抖后再断言
  setTimeout(function () {
    try {
      var rs = rows();
      var bad = rs.filter(function (r) {
        var hay = [r.court, r.cause, r.plaintiff, r.defendant, r.caseNo, r.room, r.snip]
          .join(" ").toLowerCase();
        return hay.indexOf("建设工程") === -1;
      });
      ok("关键词筛选生效", rs.length > 0 && bad.length === 0,
         "共 " + rs.length + " 条，越界 " + bad.length);

      // ---------- 8. 一键精准筛选 ----------
      document.getElementById("btnReset").click();
      document.getElementById("btnPreset").click();
      rs = rows();
      var bad2 = rs.filter(function (r) {
        var d = days(r);
        var isEnt = r.defType === "company" || r.defType === "mixed";
        return !isEnt || !r.comm || d == null || d < 15 || d > 30;
      });
      ok("一键精准筛选（企业+商事+15~30天）", rs.length > 0 && bad2.length === 0,
         "共 " + rs.length + " 条，越界 " + bad2.length);

      // ---------- 9. 重置 ----------
      document.getElementById("btnReset").click();
      var total = rows().length;
      ok("重置后回到全量", total > 0 && total === window.__HEARING_DATA__.rows.length,
         "重置后 " + total);

      // ---------- 10. 分页 ----------
      var first = document.querySelector("#tbody tr").textContent;
      var next = document.querySelector('.pager-btns button[data-p="2"]');
      ok("存在第 2 页按钮", !!next);
      if (next) {
        next.click();
        var second = document.querySelector("#tbody tr").textContent;
        ok("翻页后内容变化", first !== second);
        ok("页码状态更新", document.getElementById("pageInfo").textContent.indexOf("第 2") >= 0,
           document.getElementById("pageInfo").textContent);
      }

      // ---------- 11. 详情弹窗 ----------
      document.querySelectorAll(".pager-btns button[data-p]")[0].click();
      var btn = document.querySelector("#tbody button[data-idx]");
      ok("存在详情按钮", !!btn);
      if (btn) {
        btn.click();
        var modal = document.getElementById("modal");
        ok("详情弹窗打开", !modal.hidden);
        var kvHtml = document.getElementById("mContent").textContent;
        ok("详情含案由与开庭时间",
           kvHtml.indexOf("案由") >= 0 && kvHtml.indexOf("开庭时间") >= 0);
        document.querySelector("#modal [data-close]").click();
        ok("弹窗可关闭", modal.hidden);
      }
    } catch (e) {
      log("CRASH " + (e && e.message ? e.message : e));
    }

    var pre = document.createElement("pre");
    pre.id = "testout";
    pre.style.display = "none";
    pre.textContent = out.join("\n");
    document.body.appendChild(pre);
  }, 600);
  }

  // 必须等页面自身的 DOMContentLoaded 初始化完成（渲染表格、生成 chips）再测
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

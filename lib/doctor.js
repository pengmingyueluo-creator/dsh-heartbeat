// dsh-heartbeat 诊断小窗（doctor）—— 完全独立于主挂件
//   ① 从最早一刻开始捕获 JS 错误（主挂件崩了也能记下来）
//   ② 常驻一个诊断小窗：主挂件正常 → 10 秒后自动隐藏；有问题 → 一直留着并显示原因
//   ③ 把诊断结果回报给宿主（POST /api/heartbeat/doctor）→ AI 可读 GET /api/heartbeat/doctor
//   ④ 提供「重启挂件」「整页重载」按钮；并监听宿主的 widgetRev 变化，自动重启主挂件
(function () {
  if (window.__dshhbDoctorInstalled) return;
  window.__dshhbDoctorInstalled = true;

  var API = window.__HB_API || '/api/heartbeat';
  var WIDGET_URL = '/heartbeat/widget.js';
  var startedAt = Date.now();
  var hidesAt = 0;          // 判定为"正常"后，到这个时间点才隐藏
  var lastReport = '', lastRev = null, problems = [];

  // ── 错误捕获（尽早）──
  var ERRORS = [];
  function pushErr(msg) {
    ERRORS.push({ at: Date.now(), msg: String(msg).slice(0, 200) });
    if (ERRORS.length > 10) ERRORS.shift();
  }
  try {
    window.addEventListener('error', function (e) {
      var m = (e && (e.message || (e.error && e.error.message))) || 'unknown error';
      if (e && e.target && e.target.tagName === 'SCRIPT') m = 'script 加载失败: ' + (e.target.src || '');
      pushErr(m);
    });
    window.addEventListener('unhandledrejection', function (e) {
      pushErr('promise 未处理: ' + ((e && e.reason && (e.reason.message || e.reason)) || 'unknown'));
    });
  } catch (e) {}

  // ── 小窗 DOM ──
  var box = document.createElement('div');
  box.id = 'dshhb-doctor';
  box.setAttribute('style', 'position:fixed;left:8px;bottom:96px;z-index:2147483646;width:min(300px,86vw);' +
    'background:rgba(11,11,12,.97);color:#e8e8ea;border:1px solid #2b2b31;border-left:4px solid #4c8dff;border-radius:8px;' +
    'padding:8px 9px;font:11px/1.45 ui-monospace,Menlo,monospace;box-shadow:0 6px 22px rgba(0,0,0,.6)');
  box.innerHTML =
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
      '<b style="flex:1" id="dshhb-doc-title">🩺 心跳诊断</b>' +
      '<span id="dshhb-doc-sec" style="color:#6b6b73"></span>' +
      '<span id="dshhb-doc-x" style="cursor:pointer;color:#8b8b93;padding:0 4px">✕</span>' +
    '</div>' +
    '<div id="dshhb-doc-body" style="color:#b9b9c0;word-break:break-all"></div>' +
    '<div style="display:flex;gap:4px;margin-top:6px">' +
      '<button id="dshhb-doc-fix" style="flex:1;background:#2b2b31;color:#ff9f0a;border:1px solid #ff9f0a;border-radius:5px;padding:4px;font:11px ui-monospace,Menlo,monospace;font-weight:700">🔄 重启挂件</button>' +
      '<button id="dshhb-doc-reload" style="flex:1;background:#1c1c1f;color:#b9b9c0;border:1px solid #2b2b31;border-radius:5px;padding:4px;font:11px ui-monospace,Menlo,monospace">♻️ 重载页面</button>' +
    '</div>';

  function mount() { try { (document.body || document.documentElement).appendChild(box); } catch (e) {} }
  if (document.body) mount(); else setTimeout(mount, 50);

  function $(id) { return document.getElementById(id); }
  function hiddenAncestor(el) {
    var n = el;
    while (n && n.style) { if (n.style.display === 'none' || n.style.visibility === 'hidden') return true; n = n.parentElement; }
    return false;
  }
  function restartWidget(full) {
    try {
      if (full) { location.reload(); return; }
      window.__dshHeartbeat = null;           // ← 解开"守卫占坑"死锁
      window.__dshHeartbeatPrev = null;
      window.__dshhbDoctorInstalled = true;   // 自己不再重复装
      var s = document.createElement('script');
      s.src = WIDGET_URL + '?ts=' + Date.now();
      (document.body || document.documentElement).appendChild(s);
      pushErr('（手动/自动重启挂件）');
    } catch (e) {}
  }

  // ── 诊断 ──
  var health = {};
  async function probe() {
    problems = [];
    var api = window.__HB_API;
    if (!api) problems.push('内联 prelude 没生效（window.__HB_API 为空）→ 已用兜底 /api/heartbeat');
    var chip = document.getElementById('dshhb-chipbal');
    var widgetAlive = !!chip && !hiddenAncestor(chip);
    var roots = document.querySelectorAll('[id="dshhb-chipbal"]').length;
    var rect = null;
    if (chip) {
      try {
        var r0 = chip.getBoundingClientRect();
        rect = { x: Math.round(r0.left), y: Math.round(r0.top), w: Math.round(r0.width), h: Math.round(r0.height) };
        health.rect = rect;
        var vw = window.innerWidth || 0, vh = window.innerHeight || 0;
        if (r0.right < 4 || r0.bottom < 4 || r0.left > vw - 4 || r0.top > vh - 4) {
          problems.push('主挂件被挪出屏幕（位置 ' + rect.x + ',' + rect.y + '，视口 ' + vw + 'x' + vh + '）→ 已尝试拉回');
          try {
            var w = chip.parentElement;   // wrap
            while (w && w !== document.body && !/fixed|absolute/.test(String(w.style.position))) w = w.parentElement;
            if (w && w.style) { w.style.left = '8px'; w.style.bottom = '96px'; w.style.right = 'auto'; w.style.top = 'auto'; w.style.display = ''; }
          } catch (e) {}
        }
      } catch (e) {}
    }
    if (roots > 1) problems.push('主挂件重复 ' + roots + ' 份（多次注入没回收干净）');
    if (!chip) problems.push('主挂件节点不存在（初始化中途崩了 / 未注入）');
    else if (hiddenAncestor(chip)) problems.push('主挂件被隐藏（display:none/visibility）');
    if (window.__dshHeartbeat && !widgetAlive) problems.push('守卫 window.__dshHeartbeat 占着坑但挂件不可见 ⇒ 会锁死后续注入');
    var syncEl = document.getElementById('dshhb-syncitems');
    var syncShown = syncEl && !hiddenAncestor(syncEl);
    var st = null;
    try {
      var r = await fetch(API + '/state', { cache: 'no-store', signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined });
      health.stateHttp = r.status;
      if (r.ok) { st = await r.json(); health.stateV = st.v; health.balance = st.balance ? st.balance.total : null; health.peak = st.peak ? st.peak.peak : null; health.tokens = st.tokens ? st.tokens.requests : null; }
      else problems.push('状态接口 HTTP ' + r.status);
    } catch (e) { health.stateHttp = 'ERR'; problems.push('状态接口请求失败: ' + ((e && e.message) || e)); }
    if (st && st.widgetRev != null) {
      if (lastRev === null) lastRev = st.widgetRev;
      else if (st.widgetRev !== lastRev) { lastRev = st.widgetRev; problems.push('收到重启指令（widgetRev 变化）→ 正在重启挂件'); restartWidget(false); }
    }
    health.widgetAlive = widgetAlive;
    health.syncShown = !!syncShown;
    health.errors = ERRORS.slice(-3);
    var ok = problems.length === 0 && widgetAlive && !syncShown;
    return { ok: ok, health: health, problems: problems.slice() };
  }

  function render(res, secLeft) {
    var b = $('dshhb-doc-body'); if (!b) return;
    var title = $('dshhb-doc-title');
    if (res.ok) { if (title) { title.textContent = '🩺 心跳正常'; title.style.color = '#3ddc84'; } }
    else { if (title) { title.textContent = '🩺 心跳异常'; title.style.color = '#ff5d5d'; } }
    var lines = [];
    if (res.ok) lines.push('主挂件正常 ✓ 状态接口 HTTP ' + health.stateHttp + ' ✓');
    for (var i = 0; i < res.problems.length; i++) lines.push('❌ ' + res.problems[i]);
    lines.push('挂件可见:' + (health.widgetAlive ? '是' : '否') + ' · 同步卡:' + (health.syncShown ? '在' : '无') + ' · 状态HTTP:' + health.stateHttp + ' · state.v:' + (health.stateV == null ? '–' : health.stateV));
    if (health.rect) lines.push('位置: x=' + health.rect.x + ' y=' + health.rect.y + ' 尺寸=' + health.rect.w + 'x' + health.rect.h + ' · 视口=' + (window.innerWidth || '?') + 'x' + (window.innerHeight || '?'));
    if (health.errors && health.errors.length) lines.push('最近错误: ' + health.errors[health.errors.length - 1].msg.slice(0, 110));
    b.innerHTML = lines.map(function (x) { return x.replace(/</g, '&lt;'); }).join('<br>');
    var s = $('dshhb-doc-sec'); if (s) s.textContent = secLeft > 0 ? (secLeft + 's 后隐藏') : '';
  }

  function report(res) {
    try {
      var q = 'ok=' + (res.ok ? '1' : '0') + '&http=' + encodeURIComponent(String(health.stateHttp)) +
        '&visible=' + (health.widgetAlive ? '1' : '0') + '&sync=' + (health.syncShown ? '1' : '0') +
        '&rect=' + encodeURIComponent(health.rect ? (health.rect.x + ',' + health.rect.y + ',' + health.rect.w + 'x' + health.rect.h) : '-') +
        '&vp=' + encodeURIComponent((window.innerWidth || '?') + 'x' + (window.innerHeight || '?')) +
        '&ver=' + encodeURIComponent(String(window.__HB_WIDGET_VER || '')) +
        '&problems=' + encodeURIComponent(res.problems.slice(0, 3).join(' | ').slice(0, 300)) +
        '&errors=' + encodeURIComponent((health.errors || []).slice(-2).map(function (e) { return e.msg; }).join(' | ').slice(0, 300));
      if (q === lastReport) return; lastReport = q;
      fetch(API + '/doctor?' + q, { method: 'POST', cache: 'no-store' }).catch(function () {});
    } catch (e) {}
  }

  var rounds = 0;
  async function loop() {
    rounds++;
    var res = await probe().catch(function (e) { return { ok: false, problems: ['诊断自身异常: ' + e.message], health: {} }; });
    if (res.ok) { if (!hidesAt) hidesAt = Date.now() + 10000; }
    else { hidesAt = 0; }
    var secLeft = hidesAt ? Math.max(0, Math.ceil((hidesAt - Date.now()) / 1000)) : 0;
    render(res, secLeft);
    if (hidesAt && Date.now() >= hidesAt) { try { if (box.parentNode) box.parentNode.removeChild(box); } catch (e) {} return; }
    if (rounds <= 200) report(res);
    setTimeout(loop, 1500);
  }

  try {
    $('dshhb-doc-x') && $('dshhb-doc-x').addEventListener('click', function () { try { box.parentNode.removeChild(box); } catch (e) {} });
    $('dshhb-doc-fix') && $('dshhb-doc-fix').addEventListener('click', function () { restartWidget(false); hidesAt = 0; pushErr('（点了重启挂件）'); });
    $('dshhb-doc-reload') && $('dshhb-doc-reload').addEventListener('click', function () { restartWidget(true); });
  } catch (e) {}
  window.__dshhbDoctor = { restart: restartWidget, errors: ERRORS, box: box };
  loop();
})();

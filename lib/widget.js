/* ─────────────────────────────────────────────────────────────
 * dsh-heartbeat 页面内挂件（小窗模式）—— 注入进 DSH 页面
 *
 * 结构（一个整体，拖动时一起移动）：
 *   [面板 ⌄]            ← 点胶囊展开（数据 + 设置 + ⛔ 接管）
 *   [🐳 ¥9.94 · 谷价 · 工作中]   ← 胶囊本体，拖动把手
 *   [⚠️ 正在操控手机  (⛔ 接管)]  ← 仅在我操控手机时出现
 *   [⛔ 余额 ¥9.94    (✕)]      ← 余额进橙/红区时出现；点一下可收起
 *   [工作控制        (⏸ 暂停工作)] ← 我在干活时出现；按下=暂停我的工作
 *
 * 【给要改这个文件的 AI】
 *   ① 改完必须把下面的 SELF_VER 加 1（挂件每 30 秒比对服务端版本并自更新；
 *      宿主 App 的 WebView 没有下拉刷新，这是唯一的热更新通道）。忘了 = 用户看不到改动。
 *   ② 数据来自 GET /api/heartbeat/state；暂停/接管走 POST /api/heartbeat/pause|interrupt
 *   ③ 注入的是裸 <script>：不要 import/require、不引外部库、保持 ES5 友好
 *   ④ DOM id 一律 dshhb- 前缀；别删 window.__dshHeartbeat 守卫（防重复注入）
 *   ⑤ 拖动要按真实尺寸钳制；拖动阈值 8px（否则点击会被判成拖动而失效）
 *   ⑥ 详细字段表/配方/坑：见包目录 AI-CUSTOMIZE.md
 * ───────────────────────────────────────────────────────────── */
// by 鹏冥月落 —— 原作者标记，**请勿删除**（删了会触发插件的"已被篡改"提示）
var SELF_VER = 99;
(function () {
  try {
  if (window.__dshHeartbeat) return;
  window.__dshHeartbeat = true;
  var API = window.__HB_API || '/api/heartbeat';
  var open = false, timer = null, last = null, cfg = null;
  var drag = null, moved = false;

  function $(id) { return document.getElementById(id); }
  function mk(tag, css, html) { var e = document.createElement(tag); if (css) e.setAttribute('style', css); if (html != null) e.innerHTML = html; return e; }
  function fmt(s) {
    s = Math.max(0, Math.floor(Number(s) || 0));   // 防御：永远只显示整数秒
    if (s == null) return '–'; var m = Math.floor(s / 60); return (m ? m + '分' : '') + (s % 60) + '秒'; }
  function hms(s) { if (s == null) return '–'; var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? h + '时' + m + '分' : m + '分' + (s % 60) + '秒'; }
  function set(id, v) { var e = $(id); if (e) e.textContent = v; }

  // z-index 用最大值：别的插件（桌宠/气泡等）可能盖在同位置，实测会让按钮点不到
  var FONT = 'font:12px/1.4 ui-monospace,Menlo,monospace', Z = 'z-index:2147483647';
  var BTN = 'background:#1c1c1f;color:#b9b9c0;border:1px solid #2b2b31;border-radius:5px;padding:5px 6px;font:11px ui-monospace,Menlo,monospace';
  var SMALLBTN = 'border-radius:10px;padding:3px 8px;font:11px ui-monospace,Menlo,monospace;font-weight:700;white-space:nowrap';
  var ROW = 'display:flex;justify-content:space-between;gap:6px;padding:2px 0';
  var ROWBAR = 'display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:12px;font:11px ui-monospace,Menlo,monospace;cursor:grab;touch-action:none';

  // ── 容器：胶囊 + 挂在它下面的行（整体一起移动）──
  var wrap = mk('div', 'position:fixed;left:8px;top:62%;' + Z + ';' + FONT + ';user-select:none;display:flex;flex-direction:column;max-width:min(268px,76vw)');
  var edge = mk('div', 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:2147482999;' +
    'box-shadow:inset 0 0 24px 6px rgba(255,59,48,.92);opacity:.22');
  try {
    var st = document.createElement('style');
    st.textContent = '@keyframes dshhbEdge{0%{opacity:0}8%{opacity:.95}20%{opacity:.12}32%{opacity:.95}44%{opacity:.12}56%{opacity:.85}70%{opacity:0}100%{opacity:0}}' + '@keyframes dshhbBlink{0%,100%{opacity:1}50%{opacity:.25}}' + '@keyframes dshhbSpin{to{transform:rotate(360deg)}}';
    (document.head || document.documentElement).appendChild(st);
  } catch (e) {}

  var chip = mk('div', 'background:#141417;color:#e8e8ea;border:1px solid #2b2b31;border-radius:14px;' +
    'padding:5px 10px;cursor:grab;touch-action:none;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,.5)');
  chip.innerHTML = '<span>🐳</span><b id="dshhb-chipbal" style="margin:0 4px;font-weight:700">–</b>' +
    '<span style="color:#6b6b73">·</span><b id="dshhb-chipband" style="margin-left:4px;font-weight:700">–</b>' +
    '<b id="dshhb-chipnext" style="margin-left:5px;font-weight:700;color:#8b8b93">–</b>';

  var rowPhone = mk('div', ROWBAR + ';background:#ff3b30;color:#fff',
    '<span id="dshhb-phonetext" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">正在操控手机</span>' +
    '<button id="dshhb-takeover" style="' + SMALLBTN + ';background:#111;color:#ff9f0a;border:1px solid #ff9f0a">⛔ 接管</button>');
  var rowBal = mk('div', ROWBAR + ';background:#ff3b30;color:#fff',
    '<span id="dshhb-baltext" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">余额</span>');
  var rowWork = mk('div', ROWBAR + ';background:#141417;color:#8b8b93;border:1px solid #2b2b31',
    '<span style="flex:1;display:flex;align-items:center;min-width:0">' +
      '<span id="dshhb-worktext" style="color:#8b8b93;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">空闲</span>' +
      '<span id="dshhb-spinwrap" title="按住我试试…（纯好玩）" style="display:none;flex:none;margin-left:6px;width:20px;height:20px;align-items:center;justify-content:center">' +
        '<span id="dshhb-ring0" style="width:13px;height:13px;border:2px solid #3ddc84;border-top-color:transparent;border-radius:50%;animation:dshhbSpin 1.6s linear infinite"></span>' +
        '<span id="dshhb-ring1" style="display:none;width:15px;height:15px;border:2px solid #5BE08A;border-top-color:transparent;border-radius:50%;animation:dshhbSpin 1.05s linear infinite"></span>' +
        '<span id="dshhb-ring2" style="display:none;width:16px;height:16px;border:2px solid #B7E24A;border-top-color:transparent;border-radius:50%;animation:dshhbSpin .85s linear infinite"></span>' +
        '<span id="dshhb-ring3" style="display:none;width:17px;height:17px;border:2px solid #FFD24A;border-top-color:transparent;border-radius:50%;animation:dshhbSpin .68s linear infinite"></span>' +
        '<span id="dshhb-ring4" style="display:none;width:18px;height:18px;border:2px solid #FFA53D;border-top-color:transparent;border-radius:50%;animation:dshhbSpin .52s linear infinite"></span>' +
        '<span id="dshhb-ring5" style="display:none;width:19px;height:19px;border:2px solid #FF7A34;border-top-color:transparent;border-radius:50%;animation:dshhbSpin .4s linear infinite"></span>' +
        '<span id="dshhb-ring6" style="display:none;width:19px;height:19px;border:2px solid #FF4D2E;border-top-color:transparent;border-radius:50%;animation:dshhbSpin .3s linear infinite"></span>' +
        '<span id="dshhb-ring7" style="display:none;width:20px;height:20px;border:2px solid #FF1E1E;border-top-color:transparent;border-radius:50%;animation:dshhbSpin .2s linear infinite"></span>' +
        '<span id="dshhb-spinboom" style="display:none;font-size:15px;line-height:1">💥</span>' +
      '</span>' +
    '</span>' +
    '<button id="dshhb-pause" style="' + SMALLBTN + ';background:#2b2b31;color:#ff9f0a;border:1px solid #ff9f0a;display:none">⏸ 暂停工作</button>');
  var rowCrit = mk('div', ROWBAR + ';background:#ff3b30;color:#fff;font-weight:700;display:none;' +
    'animation:dshhbBlink .9s ease-in-out infinite;border:1px solid #fff;flex-direction:column;' +
    'align-items:flex-start;gap:2px;white-space:normal;line-height:1.35',
    '<span id="dshhb-crit1" style="white-space:normal">余额严重不足</span>' +
    '<span id="dshhb-crit2" style="white-space:normal;font-weight:400">余额完全不够用</span>' +
    '<span id="dshhb-crit3" style="white-space:normal;font-weight:400;opacity:.92">API 调用会失败 · 结果可能丢失 · 自动化可能停在中途</span>');
  var rowDaily = mk('div', ROWBAR + ';background:#ff8c1a;color:#111',
    '<span id="dshhb-dailytext" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">今日已用</span>');
  var rows = mk('div', 'display:flex;flex-direction:column;gap:4px;margin-top:4px');
  rows.appendChild(rowPhone); rows.appendChild(rowBal); rows.appendChild(rowDaily); rows.appendChild(rowWork);
  rows.appendChild(rowCrit);   // 严重不足：最底下那条不断闪烁的红条

  var panel = mk('div', 'display:none;width:min(258px,74vw);max-height:44vh;overflow:auto;background:rgba(11,11,12,.97);' +
    'color:#e8e8ea;border:1px solid #2b2b31;border-radius:8px;padding:7px;margin-bottom:6px;font-size:11px;line-height:1.35;box-shadow:0 6px 22px rgba(0,0,0,.6)');
  panel.innerHTML =
    '<div style="' + ROW + '"><span style="color:#8b8b93">余额</span><b id="dshhb-bal">–</b></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">时段</span><b id="dshhb-band">–</b></div>' +
    '<div id="dshhb-bar" style="height:4px;background:#1c1c1f;border-radius:2px;overflow:hidden;margin:3px 0 4px"><div id="dshhb-barf" style="height:100%;width:0;background:#3ddc84"></div></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">距切换</span><b id="dshhb-next">–</b></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">状态</span><b id="dshhb-state">–</b></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">上下文压力</span><b id="dshhb-ctx">–</b></div>' +
    '<div id="dshhb-ctxbarwrap" style="height:6px;border-radius:3px;background:#1c1c20;overflow:hidden;margin:1px 0 5px">' +
      '<div id="dshhb-ctxbar" style="height:100%;width:0%;background:#3ddc84;transition:width .35s linear"></div>' +
    '</div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">今日峰值</span><b id="dshhb-peaktok">–</b></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">平均每会话</span><b id="dshhb-avgsess">–</b></div>' +
    '<div style="border:1px solid #1a1a1d;border-radius:6px;padding:5px 6px;margin:4px 0">' +
      '<div style="' + ROW + '"><span style="color:#8b8b93">今日原有</span><b id="dshhb-ds">–</b></div>' +
      '<div style="' + ROW + '"><span style="color:#8b8b93;white-space:nowrap" id="dshhb-todaylabel">今日已用</span><b id="dshhb-today" style="white-space:nowrap">–</b></div>' +
      '<div style="' + ROW + '"><span style="color:#8b8b93">剩余</span><b id="dshhb-left">–</b></div>' +
      '<div style="border-top:1px solid #1a1a1d;margin:3px 0"></div>' +
      '<div style="' + ROW + '"><span style="color:#6b6b73">估值</span><b id="dshhb-est" style="color:#b9b9c0">–</b></div>' +
      '<div id="dshhb-vizbar" style="display:flex;height:9px;border-radius:5px;overflow:hidden;margin:5px 0 3px;background:#1c1c1f">' +
        '<div id="dshhb-seg1" style="width:0;background:#ff8c1a"></div>' +   // 今日已用（橙）：从左往右
        '<div id="dshhb-seg0" style="width:0;background:#8b8b93"></div>' +   // 今日原有剩余（灰）
        '<div id="dshhb-seg2" style="width:0;background:#4c8dff"></div>' +   // 今日充值（蓝）
      '</div>' +
      '<div style="' + ROW + '"><span style="color:#6b6b73">今日已充值（估算）</span><b id="dshhb-topup" style="color:#4c8dff">–</b></div>' +
    '</div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">最近一轮</span><b id="dshhb-turn">–</b></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">本会话</span><b id="dshhb-sess">–</b></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">CPU / 内存</span><b id="dshhb-res">–</b></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">磁盘</span><b id="dshhb-disk">–</b></div>' +
    '<div style="background:#141417;border-radius:5px;padding:5px;margin:6px 0;word-break:break-all;color:#b9b9c0" id="dshhb-step">–</div>' +
    '<div style="' + ROW + ';color:#8b8b93;margin-bottom:6px"><span id="dshhb-clock">–</span><span id="dshhb-sent" style="display:none;color:#ffc53d">⚠️ 哨兵缺失</span></div>' +
    '<button id="dshhb-stop" style="display:block;width:100%;background:#2b2b31;color:#ff9f0a;border:1px solid #ff9f0a;border-radius:6px;padding:7px;font-weight:700;margin-bottom:6px">⛔ 我要接管 · 停止操控</button>' +
    '<div style="display:flex;gap:4px;margin-bottom:6px">' +
      '<button data-m="widget" style="flex:1;' + BTN + '">挂件</button>' +
      '<button data-m="stream" style="flex:1;' + BTN + '">串流</button>' +
      '<button data-m="both" style="flex:1;' + BTN + '">两者</button>' +
    '</div>' +
    '<div style="color:#6b6b73;font-size:10px;margin:-2px 0 5px;line-height:1.3">💡 想在<b style="color:#8b8b93">别的 App</b> 上也能按接管键？用 Chrome 小窗看串流页</div>' +
    '<div id="dshhb-costcard" style="border:1px solid #1a1a1d;border-radius:6px;padding:5px 6px;margin:4px 0">' +
      '<div style="color:#8b8b93;margin-bottom:3px">💸 最近 7 天 <span id="dshhb-week7sum" style="float:right;color:#6b6b73;font-weight:400">–</span></div>' +
      '<div id="dshhb-week7" style="display:flex;gap:3px;align-items:flex-end;height:42px"></div>' +
      '<div id="dshhb-month" style="color:#6b6b73;font-size:10px;margin-top:3px">–</div>' +
    '</div>' +
    '<div id="dshhb-logcard" style="border:1px solid #1a1a1d;border-radius:6px;padding:5px 6px;margin:4px 0">' +
      '<div style="color:#8b8b93;margin-bottom:3px">📱 最近操作 <span style="float:right;color:#6b6b73;font-weight:400" id="dshhb-logn">–</span></div>' +
      '<div id="dshhb-phonelog" style="color:#6b6b73;font-size:10px;line-height:1.5">（暂无记录）</div>' +
    '</div>' +
    '<div id="dshhb-tlcard" style="border:1px solid #1a1a1d;border-radius:6px;padding:5px 6px;margin:4px 0">' +
      '<div style="color:#8b8b93;margin-bottom:3px">💓 最近步骤</div>' +
      '<div id="dshhb-tl" style="color:#6b6b73;font-size:10px;line-height:1.5">（暂无记录）</div>' +
    '</div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">暂停备注</span>' +
      '<input id="dshhb-pausenote" placeholder="例如：我去吃饭" style="width:88px;background:#141417;color:#e8e8ea;border:1px solid #2b2b31;border-radius:4px;padding:2px 4px"></div>' +
    '<button id="dshhb-pausenote-go" style="display:block;width:100%;' + BTN + ';margin-bottom:4px">⏸ 带备注暂停</button>' +
    '<div id="dshhb-setbtn" style="cursor:pointer;color:#8b8b93;padding:3px 0;border-top:1px solid #1a1a1d"><span id="dshhb-tri">▶</span> ⚙ 设置</div>' +
    '<button id="dshhb-dump" style="display:block;width:100%;' + BTN + ';margin:4px 0 2px">📋 打印日志（校准用）</button>' +
    '<div id="dshhb-dumpmsg" style="color:#3ddc84;font-size:10px;word-break:break-all"></div>' +
    '<div id="dshhb-foot" style="color:#6b6b73;font-size:10px;text-align:center;margin:2px 0 4px;border-top:1px solid #1a1a1d;padding-top:4px">by:鹏冥月落</div>' +
    '<div id="dshhb-setbody" style="display:none;padding-top:4px">' +
      '<div style="' + ROW + '"><span style="color:#8b8b93">余额橙 &lt;</span><input id="dshhb-org" type="number" inputmode="decimal" style="width:54px;background:#141417;color:#e8e8ea;border:1px solid #2b2b31;border-radius:4px;padding:2px 4px"></div>' +
      '<div style="' + ROW + '"><span style="color:#8b8b93">余额红 &lt;</span><input id="dshhb-red" type="number" inputmode="decimal" style="width:54px;background:#141417;color:#e8e8ea;border:1px solid #2b2b31;border-radius:4px;padding:2px 4px"></div>' +
      '<div style="' + ROW + '"><span style="color:#8b8b93">串流端口</span><input id="dshhb-port" inputmode="numeric" style="width:64px;background:#141417;color:#e8e8ea;border:1px solid #2b2b31;border-radius:4px;padding:2px 4px" placeholder="0/auto"></div>' +
      '<div style="color:#6b6b73;font-size:10px;margin:2px 0 4px" id="dshhb-porthint">0=跟随 DSH；auto=自动找空闲</div>' +
      '<div style="' + ROW + '"><span style="color:#8b8b93">暂停转空闲(分)</span><input id="dshhb-pauseidle" inputmode="numeric" style="width:54px;background:#141417;color:#e8e8ea;border:1px solid #2b2b31;border-radius:4px;padding:2px 4px"></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">运转互动</span><input id="dshhb-egg" type="checkbox" style="width:16px;height:16px;accent-color:#4c8dff"></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">橙闪间隔(分)</span><input id="dshhb-flash" inputmode="decimal" style="width:54px;background:#141417;color:#e8e8ea;border:1px solid #2b2b31;border-radius:4px;padding:2px 4px" title="橙区边缘闪烁间隔，默认 10 分钟"></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">红闪间隔(分)</span><input id="dshhb-flashred" inputmode="decimal" style="width:54px;background:#141417;color:#e8e8ea;border:1px solid #2b2b31;border-radius:4px;padding:2px 4px" title="红区边缘闪烁间隔，默认 3 分钟（更急）"></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">空闲判定(秒)</span><input id="dshhb-idle" inputmode="decimal" style="width:54px;background:#141417;color:#e8e8ea;border:1px solid #2b2b31;border-radius:4px;padding:2px 4px" title="多久没动作算空闲，默认 15"></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">手机横幅(秒)</span><input id="dshhb-phonettl" inputmode="decimal" style="width:54px;background:#141417;color:#e8e8ea;border:1px solid #2b2b31;border-radius:4px;padding:2px 4px" title="操控结束后横幅再留多久，默认 8"></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">刷新间隔(秒)</span><input id="dshhb-refresh" inputmode="decimal" style="width:54px;background:#141417;color:#e8e8ea;border:1px solid #2b2b31;border-radius:4px;padding:2px 4px" title="0.5 ~ 10，默认 1"></div>' +
    '<div style="color:#6b6b73;font-size:10px;margin:-2px 0 4px">0.5 ~ 10 秒，默认 1 秒（省电就调大）</div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">上下文进度条</span><input id="dshhb-ctxbar" type="checkbox" style="width:16px;height:16px;accent-color:#4c8dff"></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">余额与消耗可视化</span><input id="dshhb-viz" type="checkbox" style="width:16px;height:16px;accent-color:#4c8dff"></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">今日已用口径</span><span style="display:flex;gap:4px">' +
      '<button data-tm="actual" style="' + BTN + ';font-size:10px">实际</button>' +
      '<button data-tm="estimate" style="' + BTN + ';font-size:10px">估算</button>' +
    '</span></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">日耗提醒 &gt;</span><input id="dshhb-daily" inputmode="decimal" style="width:54px;background:#141417;color:#e8e8ea;border:1px solid #2b2b31;border-radius:4px;padding:2px 4px"></div>' +
    '<div style="color:#8b8b93;margin:5px 0 2px">🧩 功能开关（1.3.0）</div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">🔥 谷价提醒</span><input id="dshhb-showpeak" type="checkbox" style="width:16px;height:16px;accent-color:#4c8dff"></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">📱 操控日志</span><input id="dshhb-showlog" type="checkbox" style="width:16px;height:16px;accent-color:#4c8dff"></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">💓 心跳时间线</span><input id="dshhb-showtl" type="checkbox" style="width:16px;height:16px;accent-color:#4c8dff"></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">⏸ 暂停备注</span><input id="dshhb-showpausenote" type="checkbox" style="width:16px;height:16px;accent-color:#4c8dff"></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">💸 花费统计</span><input id="dshhb-showcost" type="checkbox" style="width:16px;height:16px;accent-color:#4c8dff"></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">🧲 设置外显（胶囊下加条）</span><input id="dshhb-showquick" type="checkbox" style="width:16px;height:16px;accent-color:#4c8dff"></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">位置自检（开关）</span><input id="dshhb-poscheckon" type="checkbox" style="width:16px;height:16px;accent-color:#4c8dff"></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">位置自检(分)</span><input id="dshhb-poscheck" inputmode="numeric" style="width:54px;background:#141417;color:#e8e8ea;border:1px solid #2b2b31;border-radius:4px;padding:2px 4px" placeholder="1" title="每隔几分钟校验一次挂件位置，不合理自动校准回默认位置（1~10）"></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">月度预算(元)</span><input id="dshhb-budget" inputmode="decimal" style="width:54px;background:#141417;color:#e8e8ea;border:1px solid #2b2b31;border-radius:4px;padding:2px 4px"></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">挂件位置</span><span style="display:flex;gap:3px">' +
      '<button data-pos="tl" style="' + BTN + ';font-size:10px">左上</button>' +
      '<button data-pos="tr" style="' + BTN + ';font-size:10px">右上</button>' +
      '<button data-pos="bl" style="' + BTN + ';font-size:10px">左下</button>' +
      '<button data-pos="br" style="' + BTN + ';font-size:10px">右下</button>' +
    '</span></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">字号</span><input id="dshhb-fs" inputmode="decimal" style="width:54px;background:#141417;color:#e8e8ea;border:1px solid #2b2b31;border-radius:4px;padding:2px 4px" placeholder="11"></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">严重不足 &lt;</span><input id="dshhb-crit" inputmode="decimal" style="width:54px;background:#141417;color:#e8e8ea;border:1px solid #2b2b31;border-radius:4px;padding:2px 4px"></div>' +
    '<div style="' + ROW + '"><span style="color:#8b8b93">余额提醒常驻</span><input id="dshhb-balalert" type="checkbox" style="width:16px;height:16px;accent-color:#4c8dff"></div>' +
      '<div style="display:flex;gap:4px">' +
        '<button id="dshhb-save" style="flex:1;' + BTN + '">保存</button>' +
        '<button id="dshhb-resetpos" style="flex:1;' + BTN + '">重置位置</button>' +
      '</div>' +
      '<div id="dshhb-saved" style="color:#3ddc84;font-size:10px;margin-top:3px"></div>' +
    '</div>';

  // ── 同步门：宿主刚起来时数据都是空的（挂件会满屏 –），这时不显示挂件，先显示这张卡片 ──
  var syncEl = mk('div', 'display:none;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483647;' +
    'background:rgba(11,11,12,.97);border:1px solid #2b2b31;border-radius:10px;padding:14px 16px;' +
    'min-width:min(238px,76vw);font-size:12px;line-height:1.5;color:#e8e8ea;box-shadow:0 8px 30px rgba(0,0,0,.6)');
  syncEl.innerHTML = '<div style="font-size:13px;font-weight:700;margin-bottom:8px">' +
      '<span id="dshhb-spin" style="display:inline-block;margin-right:6px">🔄</span>正在同步…</div>' +
    '<div id="dshhb-syncitems" style="color:#8b8b93"></div>' +
    '<div style="color:#6b6b73;font-size:10px;margin-top:8px">同步完成后挂件会自动出现</div>';
  var sync = { done: false, startedAt: Date.now(), err: '', items: {} };
  try { sync.done = (Date.now() - Number(sessionStorage.getItem('dshhb-synced') || 0)) < 60000; } catch (e) {}
  wrap.appendChild(panel); wrap.appendChild(chip); wrap.appendChild(rows);
  var qbar = mk('div', 'display:none;flex-direction:row;gap:4px;margin-top:4px;flex-wrap:wrap;align-items:center');
  qbar.id = 'dshhb-qbar';
  qbar.innerHTML =
    '<button id="dshhb-q-pause" style="' + SMALLBTN + '" title="暂停 / 继续">⏸</button>' +
    '<button id="dshhb-q-stop" style="' + SMALLBTN + ';color:#ff9f0a;border-color:#ff9f0a" title="接管：停止操控">⛔</button>' +
    '<button id="dshhb-q-peak" style="' + SMALLBTN + '" title="谷价提醒开关">🔥</button>' +
    '<button id="dshhb-q-log" style="' + SMALLBTN + '" title="操控日志开关">📱</button>' +
    '<button id="dshhb-q-tl" style="' + SMALLBTN + '" title="心跳时间线开关">💓</button>' +
    '<button id="dshhb-q-cost" style="' + SMALLBTN + '" title="花费统计开关">💸</button>' +
    '<button id="dshhb-q-set" style="' + SMALLBTN + '" title="打开完整设置">⚙</button>';
  wrap.appendChild(qbar);
  var SYNC_GRACE_MS = 8000;   // 兜底：最多等 8 秒就放行，绝不把挂件卡在同步页
  var SYNC_ITEMS = [['balance', '余额'], ['peak', '峰谷时段'], ['tokens', '今日用量'], ['ctx', '会话上下文']];
  function syncCheck(j) {
    sync.items = {
      host: !!j,
      balance: !!(j && j.balance && j.balance.total != null),
      peak: !!(j && j.peak && j.peak.peak !== undefined),
      tokens: !!(j && j.tokens && j.tokens.requests != null),
      ctx: !!(j && j.ctx)
    };
    var lines = SYNC_ITEMS.map(function (it) { return (sync.items[it[0]] ? '✅ ' : '⏳ ') + it[1]; });
    if (sync.err) lines.push('⚠️ ' + sync.err);
    var el = $('dshhb-syncitems'); if (el) el.innerHTML = lines.join('<br>');
    // 必需项：心跳服务在 + 余额 + 峰谷时段；超过 25 秒先放行，别把用户卡住
    return (sync.items.host && sync.items.balance && sync.items.peak) || (Date.now() - sync.startedAt > 25000);
  }
  function syncDone() {
    sync.done = true;
    syncEl.style.display = 'none';
    wrap.style.display = 'flex';
    try { sessionStorage.setItem('dshhb-synced', String(Date.now())); } catch (e) {}
    applyPos(clampPos({ left: parseFloat(wrap.style.left), top: parseFloat(wrap.style.top) }));
  }
  function mount() {
    document.body.appendChild(edge);
    document.body.appendChild(syncEl);
    document.body.appendChild(wrap);
    if (!sync.done) {
      /* 不再隐藏主挂件（1.3.0）：未同步也要可见 */
      syncEl.style.display = 'block';
      var sp = $('dshhb-spin'); if (sp) sp.style.animation = 'dshhbSpin 1.2s linear infinite';
    }
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  // ── 位置：整块一起移动（胶囊和每条行都能当把手）──
  function clampPos(p) {
    var r = wrap.getBoundingClientRect(), m = 6;
    var w = Math.max(120, Math.round(r.width || 220)), h = Math.max(30, Math.round(r.height || 30));
    return { left: Math.min(Math.max(m, p.left), Math.max(m, window.innerWidth - w - m)),
             top: Math.min(Math.max(m, p.top), Math.max(m, window.innerHeight - h - m)) };
  }
  function applyPos(p) { wrap.style.left = p.left + 'px'; wrap.style.top = p.top + 'px'; wrap.style.bottom = 'auto'; }
  function defaultPos() { return clampPos({ left: 8, top: Math.round(window.innerHeight * 0.62) }); }
  function loadPos() {
    try {
      var p = JSON.parse(localStorage.getItem('dshhb-pos'));
      if (p && isFinite(p.left) && isFinite(p.top)) {
        if (p.left < -20 || p.top < -20 || p.left > window.innerWidth - 20 || p.top > window.innerHeight - 20) return defaultPos();
        return clampPos(p);
      }
    } catch (e) {}
    return defaultPos();
  }
  applyPos(loadPos());
  function onDrag(e) {
    if (!drag) return;
    if (!moved && (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 8)) {
      moved = true;
      eggCancelPending();          // 开始拖了 → 不要启动彩蛋
    }
    if (!moved) return;
    if (dragLocked) { e.preventDefault(); return; }   // 彩蛋期间：不许被拖走
    applyPos(clampPos({ left: e.clientX - drag.dx, top: e.clientY - drag.dy }));
    e.preventDefault();
  }
  function endDrag() {
    window.removeEventListener('pointermove', onDrag);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    if (drag && moved) { try { localStorage.setItem('dshhb-pos', JSON.stringify({ left: parseFloat(wrap.style.left), top: parseFloat(wrap.style.top) })); } catch (e) {} }
    drag = null;
  }
  function attachDrag(handle) {
    handle.addEventListener('pointerdown', function (e) {
      var t = e.target;
      if (t && t.closest && t.closest('button,input')) return;   // 按钮自己处理，别抢
      var r = wrap.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY }; moved = false;
      window.addEventListener('pointermove', onDrag); window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', endDrag);
      e.preventDefault(); e.stopPropagation();
    });
  }
  attachDrag(chip); attachDrag(rowPhone); attachDrag(rowBal); attachDrag(rowDaily); attachDrag(rowWork); attachDrag(rowCrit);
  // 「点了一下」的判定：**按下后 150ms 内位移不超过 8px** 就算点击。
  // 为什么不靠 click 事件：拖动把手在 pointerdown 里 preventDefault()，WebView 不会合成 click。
  // 为什么不靠 pointerup：实测（手机上的合成点击）有时只发 down、不发 up，等到 up 就永远不响应。
  // 而 pointerdown / touchstart 一定会有（长按彩蛋就是靠它），所以以它为准 + 位移取消 + up 兜底。
  function tapOn(el, fn) {
    var sx = 0, sy = 0, down = false, didMove = false, timer = null, fired = false;
    function own(e) {   // 点在子按钮/输入框上 → 交给它自己的处理器
      var t = e.target;
      return !(t && t !== el && t.closest && t.closest('button,input,textarea,select'));
    }
    function clearT() { if (timer) { clearTimeout(timer); timer = null; } }
    function fire() {
      if (fired) return; fired = true; clearT();
      // ★ 必须带上 this 与事件对象：这些处理器原来是 addEventListener 的回调，
      //   里面会写 e.stopPropagation() / var b = this —— 不带就会抛异常，
      //   表现就是「按钮闪了一下，然后什么都没发生」。
      var ev = { target: el, stopPropagation: function () {}, preventDefault: function () {} };
      try { fn.call(el, ev); } catch (err) { if (window.console) console.warn("[dsh-heartbeat] 控件处理异常", err); }
    }
    function press(x, y) {
      down = true; didMove = false; fired = false; sx = x; sy = y; clearT();
      timer = setTimeout(function () { timer = null; if (down && !didMove) fire(); }, 150);
    }
    function moved(x, y) { if (down && Math.abs(x - sx) + Math.abs(y - sy) > 8) { didMove = true; clearT(); } }
    function release(x, y) { if (!down) return; moved(x, y); down = false; clearT(); if (!didMove) fire(); }
    el.addEventListener('pointerdown', function (e) { if (own(e)) press(e.clientX, e.clientY); });
    window.addEventListener('pointermove', function (e) { moved(e.clientX, e.clientY); });
    window.addEventListener('pointerup', function (e) { release(e.clientX, e.clientY); });
    window.addEventListener('pointercancel', function () { down = false; clearT(); });
    el.addEventListener('touchstart', function (e) { var t = e.touches && e.touches[0]; if (t && own(e)) press(t.clientX, t.clientY); }, { passive: true });
    window.addEventListener('touchmove', function (e) { var t = e.touches && e.touches[0]; if (t) moved(t.clientX, t.clientY); }, { passive: true });
    window.addEventListener('touchend', function (e) { var t = e.changedTouches && e.changedTouches[0]; release(t ? t.clientX : sx, t ? t.clientY : sy); });
    window.addEventListener('touchcancel', function () { down = false; clearT(); });
  }

  // 长按「工作中」那一行 → 圆转得更快（纯好玩，没有实际作用）；松开立刻回正常速度
  // 「按住不放」彩蛋时间线（全部靠切换预建精灵，绝不修改正在跑的动画）：
  //   0~10s   轻加速（绿）
  //   10~20s  绿→黄绿→黄→橙→橙红→红，越红越快（6 档）
  //   20~25s  保持最红最快
  //   ≥25s    缩小停转 → 灰字 + 💥
  //   任何时刻松手 → 立刻回到绿色正常档
  var HOLD_RAMP_START = 10000, HOLD_RAMP_MS = 10000, HOLD_BOOM_AT = 25000;
  var ROWCOL = ['#3ddc84','#5BE08A','#B7E24A','#FFD24A','#FFA53D','#FF7A34','#FF4D2E','#FF1E1E'];
  var pressing = false, pressingAt = 0, holdTimer = null, curStep = 0;
  // 1 秒判定窗：按下后先等 1 秒 —— 这 1 秒内**还能拖动**；一旦开始拖，彩蛋就取消。
  // 满 1 秒没拖 → 彩蛋开始，同时**锁住拖动**（不然你想挪开视线时会把它拖走）。
  var EGG_DELAY_MS = 1000, dragLocked = false;
  var pendingEgg = false, pendingTimer = null, pendX = 0, pendY = 0;
  function eggCancelPending() {
    pendingEgg = false;
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
  }
  function eggEnabled() {
    try { var v = localStorage.getItem('dshhb-egg'); if (v === '0') return false; if (v === '1') return true; } catch (e) {}
    return !(last && last.settings && last.settings.eggInteractive === false);
  }
  function eggArm(x, y) {
    if (!eggEnabled()) return;   // 「运转互动」关掉时：长按什么都不做
    eggCancelPending();
    pendingEgg = true; pendX = x; pendY = y;
    var at = Date.now();
    pendingTimer = setTimeout(function () {
      pendingTimer = null;
      if (!pendingEgg) return;        // 期间被取消（拖动了 / 松手了）
      pendingEgg = false;
      dragLocked = true;              // 彩蛋期间禁止拖动
      holdStart(at);                  // 时间线从"按下"那一刻算起
    }, EGG_DELAY_MS);
  }
  var boomOn = false, boomTimer = null, eggDone = false, ashDone = false;
  var BOOM_MAX_MS = 5000;
  function spinShow(i) {
    for (var k = 0; k < 8; k++) { var r = $('dshhb-ring' + k); if (r) r.style.display = (i === k) ? 'block' : 'none'; }
    var boom = $('dshhb-spinboom'); if (boom) boom.style.display = (i === -2) ? 'inline' : 'none';
    curStep = i;
  }
  function holdPaint(i, boom) {
    var wt = $('dshhb-worktext');
    var col = boom ? '#8b8b93' : ROWCOL[i];
    if (wt) wt.style.color = col;
    rowWork.style.borderColor = boom ? '#2b2b31' : col;
    rowWork.style.background = boom ? '#141417' : 'rgba(20,20,23,.6)';
  }
  // 掉灰：屏幕上飘落一小会儿（1~2 秒），不挡操作（pointer-events:none）
  function ashRain() {
    try {
      var host = document.createElement('div');
      host.setAttribute('style', 'position:fixed;left:0;right:0;top:0;bottom:0;pointer-events:none;z-index:2147483002;overflow:hidden');
      for (var i = 0; i < 24; i++) {
        var p = document.createElement('div');
        var sz = 3 + Math.random() * 5, dur = (0.9 + Math.random() * 0.8).toFixed(2);
        p.setAttribute('style', 'position:absolute;top:-12px;left:' + (Math.random() * 100).toFixed(1) + '%;width:' + sz.toFixed(1) + 'px;height:' + sz.toFixed(1) + 'px;' +
          'background:rgba(205,205,210,' + (0.3 + Math.random() * 0.45).toFixed(2) + ');border-radius:2px;opacity:1;' +
          'transition:transform ' + dur + 's linear,opacity ' + dur + 's ease-in');
        host.appendChild(p);
        (function (el, d) {
          setTimeout(function () {
            el.style.transform = 'translateY(' + (window.innerHeight + 40) + 'px) rotate(' + Math.round(Math.random() * 540 - 270) + 'deg)';
            el.style.opacity = '0';
          }, 20 + Math.random() * 140);
        })(p, dur);
      }
      document.body.appendChild(host);
      setTimeout(function () { if (host.parentNode) host.parentNode.removeChild(host); }, 2600);
    } catch (e) {}
  }
  function startBoom() {
    boomOn = true; eggDone = true;
    spinShow(-2); holdPaint(0, true);
    if (!ashDone) { ashDone = true; ashRain(); }
    if (holdTimer) { clearInterval(holdTimer); holdTimer = null; }
    if (boomTimer) clearTimeout(boomTimer);
    boomTimer = setTimeout(function () { endBoom(); }, BOOM_MAX_MS);   // 至多 5 秒
  }
  function endBoom() {   // 5 秒到 / 被点一下 → 回到绿色正常转圈
    boomOn = false;
    if (boomTimer) { clearTimeout(boomTimer); boomTimer = null; }
    spinShow(0); holdPaint(0, false);
    try { tick(); } catch (e) {}
  }
  function holdTick() {
    if (!pressing || eggDone) return;
    var t = Date.now() - pressingAt;
    if (t >= HOLD_BOOM_AT) { startBoom(); return; }
    var i;
    if (t < HOLD_RAMP_START) i = 1;
    else i = 1 + Math.min(6, Math.floor((t - HOLD_RAMP_START) / (HOLD_RAMP_MS / 6)));
    spinShow(i); holdPaint(i, false);
  }
  function holdStart(fromAt) {
    if (boomOn) endBoom();                 // 点一下就能结束爆炸
    pressing = true; pressingAt = fromAt || Date.now(); eggDone = false; ashDone = false;
    holdTick();
    if (holdTimer) clearInterval(holdTimer);
    holdTimer = setInterval(holdTick, 160);
  }
  function holdEnd() {   // 松手：立刻回绿色正常档，并解锁拖动、清掉判定窗
    pressing = false; eggDone = false; pendingEgg = false; dragLocked = false;
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    if (holdTimer) { clearInterval(holdTimer); holdTimer = null; }
    if (boomTimer) { clearTimeout(boomTimer); boomTimer = null; }
    boomOn = false;
    rowWork.style.borderColor = '#2b2b31';
    rowWork.style.background = '#141417';
    spinShow(0);
    try { tick(); } catch (e) {}
  }
  // 看门狗：长按状态下如果抬起事件丢了（合成手势被中断等），工作行会被永久冻住 ✗
  // 所以按住状态最多存活 90 秒，到点自己复位 —— 保证工作行一定会跟着真实状态刷新。
  var EGG_HOLD_MAX_MS = 90000;
  function eggActive() {
    if (boomOn) return true;
    if (!pressing) return false;
    if (Date.now() - pressingAt > EGG_HOLD_MAX_MS) {
      pressing = false; eggDone = false; pendingEgg = false; dragLocked = false;
      if (holdTimer) { clearInterval(holdTimer); holdTimer = null; }
      return false;
    }
    return !eggDone;
  }

  function renderSpin() { if (pressing) holdTick(); else if (!boomOn) spinShow(0); }
  function bindPress(el) {
    if (!el) return;
    el.addEventListener('pointerdown', function (e) {
      if (e.target && e.target.closest && e.target.closest('button')) return;   // 别抢暂停键
      eggArm(e.clientX, e.clientY);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      el.addEventListener(ev, function () { holdEnd(); });
    });
    // 这个 WebView 里 pointer 事件不一定可靠 → 再绑一套 touch 事件
    el.addEventListener('touchstart', function (e) {
      if (e.target && e.target.closest && e.target.closest('button')) return;
      var t = e.touches && e.touches[0];
      eggArm(t ? t.clientX : 0, t ? t.clientY : 0);
    }, { passive: true });
    el.addEventListener('touchmove', function (e) {   // 动了就是在拖 → 取消彩蛋判定
      var t = e.touches && e.touches[0]; if (!t || !pendingEgg) return;
      if (Math.abs(t.clientX - pendX) + Math.abs(t.clientY - pendY) > 8) eggCancelPending();
    }, { passive: true });
    ['touchend', 'touchcancel'].forEach(function (ev) {
      el.addEventListener(ev, function () { holdEnd(); });
    });
  }
  bindPress(rowWork);
  bindPress($('dshhb-spinwrap'));
  // 兜底：在别处松手也要复原 —— 但**只在真的处于按住/待命/爆炸状态时才处理**，
  // 否则随便点一下页面都会触发一次强制刷新（曾表现为「点一下，空闲突然变绿」）。
  function releaseGuard() { if (pressing || pendingEgg || boomOn) holdEnd(); }
  window.addEventListener('pointerup', releaseGuard);
  window.addEventListener('pointercancel', releaseGuard);
  window.addEventListener('touchend', releaseGuard);
  window.addEventListener('touchcancel', releaseGuard);

  function blurOutside() {
    var a = document.activeElement;
    if (a && a !== document.body && !wrap.contains(a) && typeof a.blur === 'function') a.blur();
  }
  function layout() {   // 胶囊在下半屏 → 面板在上；在上半屏 → 面板在下（行始终贴着胶囊下方）
    var r = wrap.getBoundingClientRect();
    if (r.top < window.innerHeight / 2) { wrap.appendChild(panel); }
    else { wrap.insertBefore(panel, chip); }
  }
  function setOpen(v) {
    open = !!v;
    // ★ 关键：面板显隐必须第一个做，且下面每个收尾动作都独立隔离
    //   （以前 blurOutside/layout/applyPos 任一抛异常都会让"设置窗打不开"）
    try { if (panel && panel.style) panel.style.display = open ? 'block' : 'none'; } catch (e) {}
    try { if (open && typeof blurOutside === 'function') blurOutside(); } catch (e) {}
    try { if (open && typeof layout === 'function') layout(); } catch (e) {}
    try {
      var L = parseFloat(wrap.style.left), T = parseFloat(wrap.style.top);
      if (isFinite(L) && isFinite(T)) applyPos(clampPos({ left: L, top: T }));
    } catch (e) { try { wrap.style.display = ''; } catch (e2) {} }
    try { if (open && typeof renderExtrasW === 'function') renderExtrasW(last); } catch (e) {}
  }
  tapOn(chip, function () {
    var wasOpen = open;
    try { setOpen(!open); } catch (e) {}
    // 兜底：无论 setOpen 内部如何，都保证设置窗的显隐跟 open 一致
    try {
      var pn = $('dshhb-panel') || (panel || null);
      if (panel && panel.style) panel.style.display = (open ? '' : 'none');
      if (panel && open) { try { renderExtrasW(last); } catch (e) {} }
    } catch (e) {}
    if (!wasOpen) { try { verifyData(true); } catch (e) {} }
  });   // 展开/收起面板
  window.addEventListener('resize', function () { applyPos(clampPos({ left: parseFloat(wrap.style.left), top: parseFloat(wrap.style.top) })); });

  // ── 收起（静音）：余额行按级别记 10 分钟；手机行记 60 秒 ──
  var edgeSilenced = null, phoneMuteUntil = 0, edgeHideTimer = null;
  var FLASH_KEY_ORANGE = 'dshhb-lastflash', FLASH_KEY_RED = 'dshhb-lastflash-red';   // 橙/红各自独立计时
  function flashAllowed(min, key) {
    try { var last = Number(localStorage.getItem(key) || 0); return (Date.now() - last) >= min * 60000; } catch (e) { return true; }
  }
  function noteFlash(key) { try { localStorage.setItem(key, String(Date.now())); } catch (e) {} }
  function getFlashMin(isRedLvl) {   // 橙默认 10 分钟，红默认 3 分钟（更急），都能在设置里改
    var lsKey = isRedLvl ? 'dshhb-flashredmin' : 'dshhb-flashmin';
    var sKey = isRedLvl ? 'flashRedMin' : 'flashEveryMin';
    var dflt = isRedLvl ? 3 : 10;
    var v = null;
    try { v = Number(localStorage.getItem(lsKey)); } catch (e) {}
    if (!isFinite(v) || v < 1) v = (last && last.settings && last.settings[sKey] != null) ? Number(last.settings[sKey]) : dflt;
    if (!isFinite(v) || v < 1) v = dflt;
    return Math.min(1440, v);
  }
  var edgeOn = true;          // 「余额提醒常驻」：默认开。开=行常驻+边缘闪；关=可点掉+不闪边缘
  var balMute = null;         // 非常驻模式下点掉后按级别静音 10 分钟
  function silenceEdge() { edgeSilenced = lastLvl; edge.style.display = 'none'; edge.style.animation = 'none'; }
  function muteBal(lvl) { balMute = { level: lvl, until: Date.now() + 600000 }; try { localStorage.setItem('dshhb-guardmute', JSON.stringify(balMute)); } catch (e) {} }
  function balMuted(lvl) {
    if (balMute && balMute.level === lvl && Date.now() < balMute.until) return true;
    try { var m = JSON.parse(localStorage.getItem('dshhb-guardmute')); if (m && m.level === lvl && Date.now() < m.until) { balMute = m; return true; } } catch (e) {}
    return false;
  }
  tapOn(rowBal, function () {
    if (edgeOn) { silenceEdge(); }                                  // 常驻：点它只停边缘闪烁
    else { muteBal(lastLvl); rowBal.style.display = 'none'; }        // 非常驻：点它就是直接关掉提醒
  });
  var dailyMuteUntil = 0;   // 日耗提醒：点掉后 30 分钟不再出现
  tapOn(rowDaily, function () { dailyMuteUntil = Date.now() + 30 * 60000; rowDaily.style.display = 'none'; });
  tapOn(rowPhone, function () { phoneMuteUntil = Date.now() + 60000; rowPhone.style.display = 'none'; });  // 手机横幅仍可点掉（一次性提示）

  // ── 按钮 ──
  // 按钮按下反馈：闪一下蓝色。既是手感，也能一眼看出"到底有没有点到"。
  function flashBtn(el, color) {
    if (!el) return;
    var old = el.style.background, oldc = el.style.color;
    el.style.background = color || '#4c8dff'; el.style.color = '#fff';
    setTimeout(function () { el.style.background = old; el.style.color = oldc; }, 380);
  }
  tapOn($('dshhb-takeover'), function (e) {
    flashBtn($('dshhb-takeover'));
    e.stopPropagation();
    var b = this, wasInterrupt = b.getAttribute('data-mode') === 'clear';
    b.disabled = true; b.textContent = '已发送…';
    fetch(API + (wasInterrupt ? '/interrupt/clear' : '/interrupt'), { method: 'POST' }).catch(function () {}).then(function () {
      setTimeout(function () { b.disabled = false; }, 1500);
    });
  });
  tapOn($('dshhb-pause'), function (e) {
    flashBtn($('dshhb-pause'));
    e.stopPropagation();
    var b = this, wantPause = !(last && last.pause && last.pause.on);
    b.disabled = true; b.textContent = wantPause ? '已暂停…' : '已恢复…';
    fetch(API + (wantPause ? '/pause' : '/pause/clear'), { method: 'POST' }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      b.disabled = false; tick();
    }).catch(function () {
      b.disabled = false;
      b.textContent = '需重启宿主后生效';
      setTimeout(tick, 2500);
    });
  });
  Array.prototype.forEach.call(panel.querySelectorAll('[data-tm]'), function (b) {
    tapOn(b, function () { fetch(API + '/settings?todayMode=' + b.getAttribute('data-tm'), { method: 'POST' }).catch(function () {}).then(tick); });
  });
  Array.prototype.forEach.call(panel.querySelectorAll('[data-m]'), function (b) {
    tapOn(b, function () { fetch(API + '/mode?mode=' + b.getAttribute('data-m'), { method: 'POST' }).catch(function () {}).then(tick); });
  });
  tapOn($('dshhb-stop'), function (e) {
    flashBtn($('dshhb-stop'));
    e.stopPropagation();
    var b = this; b.disabled = true; b.textContent = '已发送…';
    fetch(API + '/interrupt', { method: 'POST' }).catch(function () {}).then(function () {
      setTimeout(function () { b.disabled = false; b.textContent = '⛔ 我要接管 · 停止操控'; }, 1800);
    });
  });
  tapOn($('dshhb-setbtn'), function () {
    var show = $('dshhb-setbody').style.display !== 'block';
    $('dshhb-setbody').style.display = show ? 'block' : 'none';
    $('dshhb-tri').textContent = show ? '▼' : '▶';
    applyPos(clampPos({ left: parseFloat(wrap.style.left), top: parseFloat(wrap.style.top) }));
  });
  tapOn($('dshhb-save'), function () {
    flashBtn($('dshhb-save'));
    var q = 'orangeBelow=' + encodeURIComponent($('dshhb-org').value) +
            '&redBelow=' + encodeURIComponent($('dshhb-red').value) +
            '&streamPort=' + encodeURIComponent($('dshhb-port').value || '0') +
            '&pauseIdleMin=' + encodeURIComponent($('dshhb-pauseidle').value || '5') +
            '&balanceAlert=' + ($('dshhb-balalert') && $('dshhb-balalert').checked ? '1' : '0') +
            '&criticalBelow=' + encodeURIComponent($('dshhb-crit').value || '1') +
            '&dailyCostAlert=' + encodeURIComponent($('dshhb-daily').value || '10') +
            '&viz=' + ($('dshhb-viz') && $('dshhb-viz').checked ? '1' : '0') +
            '&idleGraceSec=' + encodeURIComponent(clampNum($('dshhb-idle').value, 15, 1, 600)) +
            '&phoneTtlSec=' + encodeURIComponent(clampNum($('dshhb-phonettl').value, 8, 1, 600)) +
            '&flashEveryMin=' + encodeURIComponent(clampNum($('dshhb-flash').value, 10, 1, 1440)) +
            '&flashRedMin=' + encodeURIComponent(clampNum($('dshhb-flashred').value, 3, 1, 1440)) +
            '&eggInteractive=' + ($('dshhb-egg') && $('dshhb-egg').checked ? '1' : '0') +
            '&ctxBar=' + ($('dshhb-ctxbar') && $('dshhb-ctxbar').checked ? '1' : '0') +
      '&monthBudget=' + encodeURIComponent(($('dshhb-budget') && $('dshhb-budget').value) || '50') +
      '&showPeak=' + ($('dshhb-showpeak') && $('dshhb-showpeak').checked ? '1' : '0') +
      '&showPhoneLog=' + ($('dshhb-showlog') && $('dshhb-showlog').checked ? '1' : '0') +
      '&showTimeline=' + ($('dshhb-showtl') && $('dshhb-showtl').checked ? '1' : '0') +
      '&showPauseNote=' + ($('dshhb-showpausenote') && $('dshhb-showpausenote').checked ? '1' : '0') +
      '&showCost=' + ($('dshhb-showcost') && $('dshhb-showcost').checked ? '1' : '0') +
      '&quickBar=' + ($('dshhb-showquick') && $('dshhb-showquick').checked ? '1' : '0') +
      '&posCheckMin=' + encodeURIComponent(($('dshhb-poscheck') && $('dshhb-poscheck').value) || '1') +
      '&posCheck=' + ($('dshhb-poscheckon') && $('dshhb-poscheckon').checked ? '1' : '0');
    try { localStorage.setItem('dshhb-ctxbar', ($('dshhb-ctxbar') && $('dshhb-ctxbar').checked) ? '1' : '0'); } catch (e) {}
    try { localStorage.setItem('dshhb-egg', ($('dshhb-egg') && $('dshhb-egg').checked) ? '1' : '0'); } catch (e) {}
    try {
      localStorage.setItem('dshhb-flashmin', String(clampNum($('dshhb-flash').value, 10, 1, 1440)));
      localStorage.setItem('dshhb-flashredmin', String(clampNum($('dshhb-flashred').value, 3, 1, 1440)));
    } catch (e) {}
    var rs = Number($('dshhb-refresh').value);
    if (!isFinite(rs) || rs <= 0) rs = 1;
    rs = Math.min(10, Math.max(0.5, rs));
    try { localStorage.setItem('dshhb-refresh', String(Math.round(rs * 1000))); } catch (e) {}
    $('dshhb-refresh').value = rs;
    arm();
    fetch(API + '/settings?' + q, { method: 'POST' }).then(function (r) { return r.json(); }).then(function (j) {
      $('dshhb-saved').textContent = '已保存（独立端口 ' + (j.streamPortActual || 0) + '）';
      setTimeout(function () { $('dshhb-saved').textContent = ''; }, 3000); tick();
    }).catch(function () { $('dshhb-saved').textContent = '保存失败'; });
  });
  tapOn($('dshhb-resetpos'), function () {
    try { localStorage.removeItem('dshhb-pos'); localStorage.removeItem('dshhb-guardmute'); } catch (e) {}
    balMute = null; phoneMuteUntil = 0;
    applyPos(defaultPos());
  });
  panel.addEventListener('focusin', function (e) {
    if (e.target && /input|select|textarea/i.test(e.target.tagName || '')) {
      setTimeout(function () { applyPos(clampPos({ left: parseFloat(wrap.style.left), top: parseFloat(wrap.style.top) })); }, 250);
    }
  });

  // ── 自更新 ──
  var selfUpdateBusy = false, lastVerCheck = 0;
  async function checkVersion() {
    try {
      var url = (window.__HB_WIDGET_URL || (API.replace(/\/api\/heartbeat$/, '') + '/heartbeat/widget.js'));
      var t = await (await fetch(url + '?probe=' + Date.now(), { cache: 'no-store' })).text();
      var m = t.match(/var\s+SELF_VER\s*=\s*(\d+)/);
      if (!m || Number(m[1]) === SELF_VER) return;
      // ★ 换新代码之前先做语法校验：新版本如果有语法错，就放弃这次更新、**保留当前实例**
      //   （曾经因为一次坏更新把挂件自己拆掉过；只有明确是语法错才跳过，eval 被 CSP 禁掉时照常更新）
      try { new Function(t); } catch (e) {
        if (e && e.name === 'SyntaxError') { console.warn('[dsh-heartbeat] 新版语法有误，放弃本次热更', e.message); return; }
      }
      selfUpdate(Number(m[1]));
    } catch (e) {}
  }
  function selfUpdate(ver) {
    if (selfUpdateBusy) return;
    selfUpdateBusy = true;
    // ⚠️ 不要切断自己的轮询：旧实例继续每 1 秒巡检（既是看门狗，也给失败重试的机会）
    try {
      // 10 秒后若新实例还没接管（旧挂件仍在页面上），解除忙标记再试一次
      setTimeout(function () {
        try { if (wrap && wrap.parentNode) selfUpdateBusy = false; } catch (e) {}
      }, 10000);
    } catch (e) {}
    try {
      // ⚠️ 关键修复（1.3.0）：**先建后拆** —— 旧挂件留着，等新实例起来自己收尸。
      // 以前是"先拆后建"：只要新脚本没加载起来（404/被拦/慢），旧挂件已经删了 ⇒ 悬浮窗整个消失。
      window.__dshHeartbeatPrev = [wrap, edge, syncEl];   // syncEl 也要收，否则残留同步卡片
      window.__dshHeartbeat = null;
      var url = (window.__HB_WIDGET_URL || (API.replace(/\/api\/heartbeat$/, '') + '/heartbeat/widget.js')) + '?ts=' + ver;
      var sc = document.createElement('script');
      sc.src = url;
      sc.onerror = function () {
        selfUpdateBusy = false;
        // 再试一次（换个查询串绕缓存）；两次都失败就保留旧挂件，绝不留下"空窗"
        try { var s2 = document.createElement('script'); s2.src = url + '&r=1'; document.body.appendChild(s2); } catch (e) {}
      };
      document.body.appendChild(sc);
    } catch (e) { selfUpdateBusy = false; }
  }

  // ── 渲染 ──
  var lastLvl = null;
  function render(j) {
    var lvl = j.guard ? j.guard.level : 'ok';
    var isRed = (lvl === 'red' || lvl === 'critical');   // 严重不足(critical)也按红处理
    var stale = j.balance && j.balance.ageSec > 300;
    var bal = j.balance ? ('¥' + j.balance.total.toFixed(2)) : '?';
    var band = j.peak ? (j.peak.peak ? '峰价' : '谷价') : '?';
    var paused = !!(j.pause && j.pause.on);
    // 时长按设置走：宿主是旧版时用客户端值收窄（工作=空闲判定，手机横幅=手机横幅秒数）
    var graceS = clampNum(j.settings && j.settings.idleGraceSec, 15, 1, 600);
    var phoneTtlS = clampNum(j.settings && j.settings.phoneTtlSec, 8, 1, 600);
    // 进度秒数按"本地流逝"补上（否则轮询间隔一长，显示就会滞后到下一次刷新才跳变）
    var agoNow = (j.progressAgoSec != null) ? Math.floor(j.progressAgoSec + Math.max(0, (Date.now() - lastStateAt) / 1000)) : null;   // ★必须取整
    // 结束信号：新宿主给 j.ended；旧宿主还没有这个字段时，认 step 文本（兼容）
    var endedNow = (j.ended === true) || (j.step === '（本回合已结束）');
    var workLocal = !endedNow && ((agoNow != null && agoNow <= graceS) || (j.busyLeftSec > 0) || !!j.running);
    var idleLocal = (agoNow != null) ? Math.floor(Math.max(0, agoNow - graceS)) : Math.floor(Number(j.idleSec) || 0);
    var stateTxt = paused ? '⏸ 已暂停'
      : (j.interrupt && j.interrupt.on) ? '⛔ 中断中'
      : (workLocal ? ((j.busyLeftSec > 0 && j.progressAgoSec > graceS) ? ('忙 ' + j.busyLeftSec + 's') : '工作中') : ('空闲 ' + fmt(idleLocal)));

    // 胶囊
    var cb = $('dshhb-chipbal');
    if (cb) {
      cb.textContent = bal;
      cb.style.color = isRed ? '#ff3b30' : lvl === 'orange' ? '#ff8c1a' : (stale ? '#8b8b93' : '#3ddc84');
    }
    // 外框跟**余额**（绿 / 橙 / 红；读数太旧则灰）—— 工作状态不在这里了
    chip.style.borderColor = isRed ? '#ff3b30' : lvl === 'orange' ? '#ff8c1a' : (stale ? '#8b8b93' : '#3ddc84');
    var cbnd = $('dshhb-chipband');   // 胶囊上的时段：峰价红字 / 谷价绿字
    if (cbnd) { cbnd.textContent = band; cbnd.style.color = j.peak && j.peak.peak ? '#ff3b30' : '#3ddc84'; }

    // ① 手机操控行（+ 接管按钮）——只在需要时出现
    var interruptOn = !!(j.interrupt && j.interrupt.on);
    var phoneOn = !!(j.phone && j.phone.on && (j.phone.ageSec == null || j.phone.ageSec <= phoneTtlS));   // 超时就当停了，尽快消失
    if ((interruptOn || phoneOn) && Date.now() >= phoneMuteUntil) {
      rowPhone.style.display = 'flex';
      rowPhone.style.background = interruptOn ? '#ff9f0a' : '#ff3b30';
      rowPhone.style.color = interruptOn ? '#111' : '#fff';
      if (interruptOn) {
        set('dshhb-phonetext', '⛔ 中断已请求 · 等 agent 停手（' + (j.interrupt.ageSec || 0) + 's）· 点此行可收起');
        var tb = $('dshhb-takeover'); tb.textContent = '解除中断'; tb.setAttribute('data-mode', 'clear');
      } else {
        set('dshhb-phonetext', '⚠️ 正在操控手机 · 请勿触摸（' + (j.phone.text || '') + '）');
        var tb2 = $('dshhb-takeover'); tb2.textContent = '⛔ 接管'; tb2.setAttribute('data-mode', 'interrupt');
      }
    } else { rowPhone.style.display = 'none'; if (!phoneOn && !interruptOn) phoneMuteUntil = 0; }

    // ② 余额行（+ ✕）——橙/红区出现，点一下关掉
    // 余额提醒行**永远常驻**（橙/红区就显示，点它也只静音边缘闪）
    edgeOn = !j.settings || j.settings.balanceAlert !== false;      // 「余额提醒常驻」默认开
    var balMutedNow = !edgeOn && balMuted(lvl);                     // 非常驻模式下，点掉后 10 分钟内不再出现
    if ((isRed || lvl === 'orange') && !balMutedNow) {
      rowBal.style.display = 'flex';
      rowBal.style.background = isRed ? '#ff3b30' : '#ff8c1a';
      rowBal.style.color = isRed ? '#fff' : '#111';
      set('dshhb-baltext', (isRed ? '⛔ 余额 ' : '⚠️ 余额 ') + bal +
        '（<' + (isRed ? j.guard.redBelow : j.guard.orangeBelow) + '）');
    } else { rowBal.style.display = 'none'; if (lvl === 'ok') { edgeSilenced = null; balMute = null; } }

    // 边缘闪红（进红区闪 3 下后留一层淡红边）
    // 边缘闪烁：橙/红区各闪一组（3 下），然后**彻底消失**；
    // 关键是**按时间间隔**限制 —— 余额在阈值上下反复穿越时不会再疯狂重闪。
    var flashMin = getFlashMin(isRed);
    var wantEdge = edgeOn && (isRed || lvl === 'orange') && edgeSilenced !== lvl;
    if (wantEdge && flashAllowed(flashMin, isRed ? FLASH_KEY_RED : FLASH_KEY_ORANGE)) {
      noteFlash(isRed ? FLASH_KEY_RED : FLASH_KEY_ORANGE);
      edge.style.boxShadow = 'inset 0 0 24px 6px ' + (isRed ? 'rgba(255,59,48,.92)' : 'rgba(255,140,26,.92)');
      edge.style.display = 'block';
      edge.style.animation = 'none'; void edge.offsetWidth;
      edge.style.animation = 'dshhbEdge 1.8s ease-out 1 forwards';
      if (edgeHideTimer) clearTimeout(edgeHideTimer);
      edgeHideTimer = setTimeout(function () { edge.style.display = 'none'; edge.style.animation = 'none'; }, 2000);
    } else if (!wantEdge) {
      edge.style.display = 'none'; edge.style.animation = 'none';
    }
    lastLvl = lvl;

    // ③ 工作状态行：空闲=灰 / 工作中=绿 / 已暂停=红（暂停时给出橙色/白色按钮）
    rowWork.style.display = 'flex';
    var pb = $('dshhb-pause'), wt = $('dshhb-worktext');
    if (eggActive()) {   // 彩蛋进行中：渲染不许插手；带 90 秒看门狗，事件丢了也会自动恢复
      var swEgg = $('dshhb-spinwrap'); if (swEgg) swEgg.style.display = 'inline-block';
    } else if (paused) {
      rowWork.style.background = '#ff3b30'; rowWork.style.borderColor = '#ff3b30';
      wt.style.color = '#fff';
      wt.textContent = '已暂停 · 等你说继续' + (j.pause && j.pause.ageSec ? ('（' + fmt(j.pause.ageSec) + '前按下）') : '');
      var spn3 = $('dshhb-spinwrap'); if (spn3) { spn3.style.display = 'none'; holdEnd(); }
      pb.style.display = 'inline-block'; pb.textContent = '▶ 继续工作'; pb.style.color = '#fff'; pb.style.borderColor = '#fff';
    } else if (workLocal) {
      rowWork.style.background = '#141417'; rowWork.style.borderColor = '#2b2b31';
      wt.style.color = '#3ddc84';
      wt.textContent = '工作中' + (j.busyLeftSec > 0 && j.progressAgoSec > graceS ? ('（还要忙 ' + j.busyLeftSec + 's）') : '');
      var spn = $('dshhb-spinwrap'); if (spn) spn.style.display = 'inline-block';
      renderSpin();   // 按住期间保持当前档位，没按就是正常档
      pb.style.display = 'inline-block'; pb.textContent = '⏸ 暂停工作'; pb.style.color = '#ff9f0a'; pb.style.borderColor = '#ff9f0a';
    } else {
      rowWork.style.background = '#141417'; rowWork.style.borderColor = '#2b2b31';
      wt.style.color = '#8b8b93';
      var staleH = (agoNow != null && agoNow > 3600) && !endedNow;
      if (endedNow) {
        wt.textContent = '空闲';
      } else if (staleH) {
        wt.textContent = '⏰ 心跳停了 ' + fmt(agoNow) + '（agent 没调 hb？）';
        wt.style.color = '#ff8c1a';
      } else {
        wt.textContent = '空闲' + (idleLocal ? (' · 已 ' + fmt(idleLocal)) : '');
      }
      var spn2 = $('dshhb-spinwrap'); if (spn2) { spn2.style.display = 'none'; holdEnd(); }
      pb.style.display = 'none';
    }

    // ③.5 今日花费提醒（超过阈值时出现，点一下静音 30 分钟）
    var dailyAlert = (j.settings && j.settings.dailyCostAlert != null) ? Number(j.settings.dailyCostAlert) : 10;
    var todayCost = (j.todayActual || j.today || null) ? ((j.settings && j.settings.todayMode === 'estimate')
      ? ((j.todayActual || j.today).cost + ((j.turn && j.turn.lastStepCost) || 0))
      : (j.todayActual || j.today).cost) : null;
    var dsRec = dayStartLocal(j.balance ? j.balance.total : null);
    if (todayCost != null && dailyAlert > 0 && todayCost > dailyAlert && Date.now() >= dailyMuteUntil) {
      rowDaily.style.display = 'flex';
      set('dshhb-dailytext', '💸 今日已用 ¥' + todayCost.toFixed(2) + '（>' + dailyAlert + '）· 点我收起');
    } else rowDaily.style.display = 'none';

    // ④ 余额严重不足：最底下一条不断闪烁的红条（常驻，关不掉）
    var critBelow = (j.settings && j.settings.criticalBelow != null) ? Number(j.settings.criticalBelow) : 1;
    var isCrit = !!(j.guard && j.guard.critical) || !!(j.balance && j.balance.total < critBelow);   // 兜底：宿主还没重启也能判
    if (isCrit) {
      rowCrit.style.display = 'flex';
      set('dshhb-crit1', '🚨 余额严重不足 ¥' + j.balance.total.toFixed(2) + '（<' + critBelow + '）');
      set('dshhb-crit2', '余额完全不够用 → API 调用会失败、任务中断');
      set('dshhb-crit3', '进行中的操作可能半途而废；手机自动化可能停在中途');
    } else rowCrit.style.display = 'none';

    // 面板细节
    if (!open) return;
    Array.prototype.forEach.call(panel.querySelectorAll('[data-m]'), function (b) {
      var on = b.getAttribute('data-m') === j.mode;
      b.style.color = on ? '#4c8dff' : '#b9b9c0'; b.style.borderColor = on ? '#4c8dff' : '#2b2b31'; b.style.fontWeight = on ? '700' : '400';
    });
    if (j.settings) {
      if (document.activeElement !== $('dshhb-org')) $('dshhb-org').value = j.settings.orangeBelow;
      if (document.activeElement !== $('dshhb-red')) $('dshhb-red').value = j.settings.redBelow;
      if (document.activeElement !== $('dshhb-port')) $('dshhb-port').value = j.settings.streamPort;
      if (document.activeElement !== $('dshhb-daily')) $('dshhb-daily').value = (j.settings.dailyCostAlert != null ? j.settings.dailyCostAlert : 10);
      if (document.activeElement !== $('dshhb-crit')) $('dshhb-crit').value = (j.settings.criticalBelow != null ? j.settings.criticalBelow : 1);
      if (document.activeElement !== $('dshhb-pauseidle')) $('dshhb-pauseidle').value = (j.settings.pauseIdleMin != null ? j.settings.pauseIdleMin : 5);
      var cba = $('dshhb-balalert'); if (cba) cba.checked = (j.settings.balanceAlert !== false);
      var cvz = $('dshhb-viz'); if (cvz) cvz.checked = (j.settings.viz !== false);
      var ceg = $('dshhb-egg'); if (ceg) ceg.checked = eggEnabled();
      var ccb = $('dshhb-ctxbar'); if (ccb) ccb.checked = ctxBarEnabled();
      var cff = $('dshhb-flash');
      if (cff && document.activeElement !== cff) cff.value = getFlashMin(false);
      var cfr = $('dshhb-flashred');
      if (cfr && document.activeElement !== cfr) cfr.value = getFlashMin(true);
      var cif = $('dshhb-idle');
      if (cif && document.activeElement !== cif) cif.value = (getGraceSec());
      var cpt = $('dshhb-phonettl');
      if (cpt && document.activeElement !== cpt) cpt.value = (getPhoneTtlSec());
      var crf = $('dshhb-refresh');
      if (crf && document.activeElement !== crf) crf.value = (getRefreshMs() / 1000);
      $('dshhb-porthint').textContent = '0=跟随 DSH；auto=自动找空闲' + (j.streamPortActual ? ('（当前独立监听 ' + j.streamPortActual + '）') : '');
    }
    var b2 = $('dshhb-bal');
    b2.textContent = bal + (j.balance && j.balance.ageSec > 60 ? (' · ' + fmt(j.balance.ageSec) + '前') : '');
    b2.style.color = isRed ? '#ff3b30' : lvl === 'orange' ? '#ff8c1a' : '#3ddc84';
    var bd = $('dshhb-band'); bd.textContent = band + (j.peak && j.peak.weekend ? '（周末）' : ''); bd.style.color = j.peak && j.peak.peak ? '#ff3b30' : '#3ddc84';
    if (j.peak) { $('dshhb-barf').style.width = (j.peak.bandPct || 0) + '%'; $('dshhb-barf').style.background = j.peak.peak ? '#ff3b30' : '#3ddc84'; }
    set('dshhb-next', j.peak && j.peak.nextInSec != null ? hms(j.peak.nextInSec) + '后转' + (j.peak.nextPeak ? '峰' : '谷') : '–');
    var sEl = $('dshhb-state'); sEl.textContent = stateTxt; sEl.style.color = paused ? '#3ddc84' : j.working ? '#3ddc84' : '#8b8b93';
    set('dshhb-ctx', j.ctx && j.ctx.pressPct != null ? (j.ctx.pressPct + '% · ' + (j.ctx.surface / 1000).toFixed(0) + 'k') : '–');
    // 上下文进度条：绿 <60% / 橙 <85% / 红 ≥85%；可在设置里关掉
    var cbw = $('dshhb-ctxbarwrap');
    if (cbw) cbw.style.display = ctxBarEnabled() ? 'block' : 'none';
    if (cbw && ctxBarEnabled() && j.ctx && j.ctx.pressPct != null) {
      var cpct = Math.max(0, Math.min(100, Number(j.ctx.pressPct) || 0));
      var cbar = $('dshhb-ctxbar');
      if (cbar) {
        cbar.style.width = cpct + '%';
        cbar.style.background = cpct >= 85 ? '#ff3b30' : (cpct >= 60 ? '#ff8c1a' : '#3ddc84');
      }
    }
    var st = lastStats;   // 由 tick() 预先取好（render 是同步函数，不能 await）
    set('dshhb-peaktok', (st && st.peak != null) ? (fmtTok(st.peak) + (st.peakHour != null ? ('（' + String(st.peakHour).padStart(2, '0') + ':00 那一小时）') : '')) : '–');
    set('dshhb-avgsess', (st && st.avgSession != null) ? (fmtTok(st.avgSession) + '（' + (st.sessions || 0) + ' 个会话）') : '–');
    var tEl = $('dshhb-today');
    var act = j.todayActual || j.today || null;
    var inflight = (j.turn && j.turn.lastStepCost) ? j.turn.lastStepCost : 0;
    var est = act ? { cost: act.cost + inflight, tokens: act.tokens, requests: act.requests } : null;
    var tm = (j.settings && j.settings.todayMode === 'estimate') ? 'estimate' : 'actual';
    var used = tm === 'estimate' ? (est || act) : (act || est);
    if (tEl) {
      tEl.textContent = used ? ('¥' + used.cost.toFixed(2) + ' · ' + (used.tokens / 1e6).toFixed(1) + 'M') : '–';
      tEl.style.color = (used && dailyAlert > 0 && used.cost > dailyAlert) ? '#ff8c1a' : '#e8e8ea';
    }
    var dsB = (j.dayStart && j.dayStart.balance != null) ? j.dayStart.balance : dsRec.balance;
    var topup = (j.todayTopup != null) ? j.todayTopup : topupLocal(j.balance ? j.balance.total : null, used ? used.cost : 0);
    var usedC = used ? used.cost : 0;
    var viz = !j.settings || j.settings.viz !== false;
    var vizEl = $('dshhb-vizbar');
    if (vizEl) {
      vizEl.style.display = viz ? 'flex' : 'none';
      var denom = Math.max((dsB || 0) + topup, usedC) || 1;
      $('dshhb-seg0').style.width = (Math.max(0, (dsB || 0) - usedC) / denom * 100) + '%';
      $('dshhb-seg1').style.width = (Math.min(usedC, denom) / denom * 100) + '%';
      $('dshhb-seg2').style.width = (topup / denom * 100) + '%';
    }
    var tLbl = $('dshhb-todaylabel'); if (tLbl) tLbl.textContent = '今日已用（' + (tm === 'estimate' ? '估算' : '实际') + '）';
    var tpEl = $('dshhb-topup');
    if (tpEl) { tpEl.textContent = topup > 0 ? ('¥' + topup.toFixed(2)) : '¥0.00'; tpEl.style.display = viz ? 'block' : 'none'; }
    set('dshhb-ds', dsB != null ? ('¥' + dsB.toFixed(2)) : '–');
    set('dshhb-left', j.balance ? ('¥' + j.balance.total.toFixed(2)) : '–');
    var eEl = $('dshhb-est'); if (eEl) eEl.textContent = est ? ('¥' + est.cost.toFixed(2)) : '–';
    Array.prototype.forEach.call(panel.querySelectorAll('[data-tm]'), function (b) {
      var on = b.getAttribute('data-tm') === tm;
      b.style.color = on ? '#4c8dff' : '#b9b9c0'; b.style.borderColor = on ? '#4c8dff' : '#2b2b31'; b.style.fontWeight = on ? '700' : '400';
    });
    set('dshhb-turn', j.turn ? ('第' + j.turn.n + '轮 ¥' + j.turn.cost.toFixed(4)) : '–');
    set('dshhb-sess', j.tokens && j.tokens.sessionCost != null ? ('¥' + j.tokens.sessionCost.toFixed(3) + ' · ' + j.tokens.sessionRequests + ' 请求') : '–');
    set('dshhb-res', (j.cpuPct == null ? '?' : j.cpuPct + '%') + ' / ' + (j.rssMB == null ? '?' : j.rssMB + 'MB'));
    set('dshhb-disk', j.disk ? (j.disk.freeGB + 'GB (' + j.disk.usedPct + '%)') : '?');
    set('dshhb-step', (j.running ? ('▶ ' + j.running) : (j.working ? (j.step || '（思考中）') : '（空闲 · 等你说话）')));
    set('dshhb-clock', (j.bjTime || '') + ' ' + (j.bjDate || ''));
    $('dshhb-sent').style.display = (j.sentinel && j.sentinel.installed) ? 'none' : 'inline';
  }

  // 「今日」兜底：宿主还是旧版时 state 里没有 today，就自己拉统计接口按北京日期汇总小时桶
  var todayCache = { at: 0, data: null };
  var lastStateAt = Date.now();
  var lastStats = null;
  var topupCache = { topup: 0 };
  function topupLocal(balTotal, usedCost) {   // 与宿主同款增量法：余额多出来的部分 = 一次充值
    var BJ = 8 * 3600 * 1000, today = new Date(Date.now() + BJ).toISOString().slice(0, 10);
    var rec = null;
    try { rec = JSON.parse(localStorage.getItem('dshhb-topup')); } catch (e) {}
    if (!rec || rec.date !== today) rec = { date: today, topup: 0, lastBalance: null, lastUsed: null, seeded: true };
    if (!rec.seeded && rec.lastBalance != null && rec.lastUsed != null && balTotal != null) {
      var excess = (rec.lastUsed - usedCost) - (rec.lastBalance - balTotal);
      rec.raw = Math.round(((rec.raw || 0) + excess) * 100) / 100;
      rec.topup = Math.max(0, rec.raw);
    }
    rec.seeded = false;
    if (balTotal != null) { rec.lastBalance = balTotal; rec.lastUsed = usedCost; }
    try { localStorage.setItem('dshhb-topup', JSON.stringify(rec)); } catch (e) {}
    topupCache = rec;
    return rec.topup || 0;
  }
  function dayStartLocal(bal) {
    var BJ = 8 * 3600 * 1000, today = new Date(Date.now() + BJ).toISOString().slice(0, 10);
    var rec = null;
    try { rec = JSON.parse(localStorage.getItem('dshhb-daystart')); } catch (e) {}
    if (!rec || rec.date !== today) {
      rec = { date: today, balance: bal };
      try { localStorage.setItem('dshhb-daystart', JSON.stringify(rec)); } catch (e) {}
    }
    return rec;
  }
  async function todayFallback() {
    if (Date.now() - todayCache.at < 30000) return todayCache.data;
    try {
      var r = await fetch(API.replace(/\/api\/heartbeat$/, '') + '/api/token-usage-stats', { cache: 'no-store' });
      var j2 = await r.json();
      var BJ = 8 * 3600 * 1000, key = new Date(Date.now() + BJ).toISOString().slice(0, 10);
      var req = 0, tok = 0, cost = 0, n = 0, peak = 0, peakHour = null;
      (j2.series || []).forEach(function (b) {
        if (!b || !b.totals) return;
        if (new Date(b.startTime + BJ).toISOString().slice(0, 10) !== key) return;
        req += Number(b.totals.requestCount) || 0; tok += Number(b.totals.totalTokens) || 0; cost += Number(b.totals.cost) || 0; n++;
        var bt = Number(b.totals.totalTokens) || 0;
        if (bt > peak) { peak = bt; peakHour = new Date(b.startTime + BJ).getUTCHours(); }
      });
      // 会话平均：取 topSessions 里「今天动过」的会话（每个会话的累计 token）
      var sess = (j2.topSessions || []).filter(function (s) {
        return s && s.totals && s.lastTime && new Date(s.lastTime + BJ).toISOString().slice(0, 10) === key;
      });
      var sessTok = sess.reduce(function (a, s) { return a + (Number(s.totals.totalTokens) || 0); }, 0);
      var data = n > 0 ? {
        requests: req, tokens: tok, cost: cost,
        peak: peak, peakHour: peakHour,
        sessions: sess.length, avgSession: sess.length ? Math.round(sessTok / sess.length) : null,
        avgRequest: req > 0 ? Math.round(tok / req) : null
      } : (j2.totals ? { requests: j2.totals.requestCount, tokens: j2.totals.totalTokens, cost: j2.totals.cost } : null);
      todayCache = { at: Date.now(), data: data };
    } catch (e) { todayCache = { at: Date.now(), data: todayCache.data }; }
    return todayCache.data;
  }

  function fmtTok(n) {   // 197090 → 197k；1234567 → 1.23M
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return Math.round(n / 1e3) + 'k';
    return String(n);
  }
  function clampNum(v, dflt, min, max) { var n = Number(v); if (!isFinite(n) || n <= 0) n = dflt; return Math.min(max, Math.max(min, n)); }
  function ctxBarEnabled() {
    try { var v = localStorage.getItem('dshhb-ctxbar'); if (v === '0') return false; if (v === '1') return true; } catch (e) {}
    return !(last && last.settings && last.settings.ctxBar === false);
  }
  function getGraceSec() { return clampNum(last && last.settings && last.settings.idleGraceSec, 15, 1, 600); }
  function getPhoneTtlSec() { return clampNum(last && last.settings && last.settings.phoneTtlSec, 8, 1, 600); }
  function getRefreshMs() {   // 刷新间隔：0.5s ~ 10s，默认 1s（存在 localStorage，立即生效）
    var v = null;
    try { v = Number(localStorage.getItem('dshhb-refresh')); } catch (e) {}
    if (!isFinite(v) || v < 500 || v > 10000) v = 1000;
    return v;
  }
  function arm() { try { window.clearInterval(timer); } catch (e) {} timer = setInterval(tick, getRefreshMs()); }

  async function tick() {
    try {
      var r = await fetch(API + '/state', { cache: 'no-store', signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(4000) : undefined });
      if (!r.ok) {
        // FIX 1.3.0：以前这里直接 return，接口一异常同步卡片就永久卡住、主挂件永不出现
        sync.err = '心跳接口 HTTP ' + r.status + '（已等 ' + Math.round((Date.now() - sync.startedAt) / 1000) + 's，超 ' + (SYNC_GRACE_MS / 1000) + 's 自动放行）';
        syncCheck(null);
        if (!sync.done && Date.now() - sync.startedAt > SYNC_GRACE_MS) syncDone();
        return;
      }
      var j = await r.json();
      lastStateAt = Date.now();
      if (!sync.done) {
        sync.err = '';
        var okSync = syncCheck(j);
        // FIX 1.3.0：★ 未同步也不再 return（以前直接 return ⇒ 主挂件永远不渲染）
        //   现在：到时间就正式放行；没到时间也继续往下渲染，只是把同步卡片留在屏幕上做提示。
        if (okSync || Date.now() - sync.startedAt > SYNC_GRACE_MS) syncDone();
      }
      if (!j.today) { var tf = await todayFallback(); if (tf) j.today = tf; }
      // 今日峰值 / 会话平均：宿主有就用宿主的，没有就自己从统计接口算
      lastStats = (j.todayPeak != null)
        ? { peak: j.todayPeak, peakHour: j.todayPeakHour, avgSession: j.avgSession, sessions: j.sessionCount }
        : await todayFallback();
      last = j;
      try { render(j); } catch (e) { if (window.console) console.warn('[dsh-heartbeat] 渲染异常（已忽略，下次轮询重试）', e); }
      try { renderExtrasW(j); } catch (e) { if (window.console) console.warn('[dsh-heartbeat] 扩展渲染异常', e); }
      try {
        if (!(j.settings && j.settings.posCheck)) return;   // ★开关没开就不自检（默认关）
        var pmin = Number((j.settings && j.settings.posCheckMin) || 1);
        if (!(pmin >= 1 && pmin <= 10)) pmin = 1;
        if (!lastPosCheck) lastPosCheck = Date.now();
        if (Date.now() - lastPosCheck >= pmin * 60000) { lastPosCheck = Date.now(); checkPos(); }
      } catch (e) {}
      if (j.widgetVersion && window.__HB_WIDGET_VER && j.widgetVersion !== window.__HB_WIDGET_VER) { selfUpdate(j.widgetVersion); return; }
      if (Date.now() - lastVerCheck > 30000) { lastVerCheck = Date.now(); checkVersion(); }
    } catch (e) {
      if (!sync.done) {
        sync.err = '心跳服务未就绪，重试中…' + (e && e.message ? (' / ' + e.message) : '');
        syncCheck(null);
        if (Date.now() - sync.startedAt > SYNC_GRACE_MS) syncDone();
      }
    }
  }

  // ═══ 新增：峰价倒计时 / 7 天花费 / 操控日志 / 步骤时间线 / 外观 ═══
  function hhmmW(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function moneyW(v) { return '¥' + (Number(v) || 0).toFixed(2); }
  function applySkinW() {
    var fs = 11, posv = 'bl';
    try { var f = Number(localStorage.getItem('dshhb-fs')); if (f >= 9 && f <= 16) fs = f; posv = localStorage.getItem('dshhb-pos-preset') || 'bl'; } catch (e) {}
    try { wrap.style.fontSize = fs + 'px'; } catch (e) {}
    try {
      var m = 8, W = window.innerWidth || 360, H = window.innerHeight || 640;
      if (posv === 'tl') { wrap.style.left = m + 'px'; wrap.style.top = m + 'px'; wrap.style.right = 'auto'; wrap.style.bottom = 'auto'; }
      else if (posv === 'tr') { wrap.style.right = m + 'px'; wrap.style.top = m + 'px'; wrap.style.left = 'auto'; wrap.style.bottom = 'auto'; }
      else if (posv === 'br') { wrap.style.right = m + 'px'; wrap.style.bottom = m + 'px'; wrap.style.left = 'auto'; wrap.style.top = 'auto'; }
      else { wrap.style.left = m + 'px'; wrap.style.top = Math.max(m, H - 170) + 'px'; wrap.style.right = 'auto'; wrap.style.bottom = 'auto'; }
    } catch (e) {}
    // 位置钳制：历史保存的拖动坐标可能把挂件顶出屏幕 ⇒ 拉回可视区
    try {
      var vw = window.innerWidth || 360, vh = window.innerHeight || 640;
      var r = wrap.getBoundingClientRect();
      if (r.right < 8 || r.bottom < 8 || r.left > vw - 8 || r.top > vh - 8 || r.width === 0) {
        wrap.style.left = '8px'; wrap.style.bottom = '96px'; wrap.style.right = 'auto'; wrap.style.top = 'auto'; wrap.style.display = '';
      }
    } catch (e) {}
  }
  // ── 位置自检（用户要求）：每隔 posCheckMin 分钟校验一次自己的位置是否合理，不合理就校准回默认位置 ──
  var lastPosCheck = 0;
  function resetPos() {
    try {
      wrap.style.left = '8px'; wrap.style.right = 'auto'; wrap.style.bottom = 'auto'; wrap.style.display = '';
      wrap.style.top = Math.max(8, (window.innerHeight || 700) - 170) + 'px';
      try { localStorage.setItem('dshhb-pos-preset', 'bl'); } catch (e) {}
      try { localStorage.setItem('dshhb-pos', JSON.stringify({ left: 8, top: Math.max(0, (window.innerHeight || 700) - 170) })); } catch (e) {}
    } catch (e) {}
  }
  var badStreak = 0;
  function checkPos() {
    try {
      var vw = window.innerWidth || 0, vh = window.innerHeight || 0;
      if (vw < 100 || vh < 100) return true;                      // 视口不可信 ⇒ 不判定
      if (!wrap) return true;
      if (wrap.style.display === 'none') return true;              // 自己没显示 ⇒ 不判定（别误弹）
      var r = wrap.getBoundingClientRect();
      if (!(r.width > 4 && r.height > 4)) return true;             // 尺寸为 0（还没渲染完）⇒ 不判定 ★关键
      var visW = Math.min(r.right, vw) - Math.max(r.left, 0);
      var visH = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      var vis = Math.max(0, visW) * Math.max(0, visH);
      var ratio = vis / Math.max(1, r.width * r.height);
      // 只有「明显不在屏幕里」才算不合法：可见面积 < 30% 或 中心点出视口
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var centerOut = (cx < 4 || cy < 4 || cx > vw - 4 || cy > vh - 4);
      var bad = (ratio < 0.15) || centerOut;   // 阈值再放宽：可见不足 15% 或中心出屏才算离谱
      badStreak = bad ? (badStreak + 1) : 0;
      if (badStreak >= 3) { badStreak = 0; resetPos(); return false; }   // 连续三次都离谱才校准（更防抖）
      return true;
    } catch (e) { return true; }
  }
  // 打开大窗时校验数据；大量 – ⇒ 强制重载所有数据接口（用户要求）
  var DASH_IDS = ['dshhb-bal', 'dshhb-band', 'dshhb-next', 'dshhb-state', 'dshhb-ctx', 'dshhb-today', 'dshhb-sess', 'dshhb-turn'];
  function dashCount() {
    var n = 0;
    for (var i = 0; i < DASH_IDS.length; i++) {
      var e = $(DASH_IDS[i]);
      if (e && /^\s*[–-]\s*$/.test(String(e.textContent || ''))) n++;
    }
    return n;
  }
  async function verifyData(force) {   // 注意：绝不能让异常冒泡到点击处理里
    try {
      var bad = dashCount();
      if (!force && bad < 3) return bad;
      lastStats = null;
      await tick();
      try { renderExtrasW(last); } catch (e) {}
      if (dashCount() >= 3) setTimeout(function () { try { tick(); } catch (e) {} }, 900);
      return dashCount();
    } catch (e) { return -1; }
  }
  function renderExtrasW(j) {
    var sw = j.settings || {};
    // 重卡片按时间节流（≥3 秒才重建一次）——不再依赖 open 状态，避免影响设置窗
    var __now = Date.now();
    if (renderExtrasW.last && __now - renderExtrasW.last < 3000) return;
    renderExtrasW.last = __now;
    var showCardW = function (id, val) { var e = $(id); if (e) e.style.display = (val !== false) ? '' : 'none'; };
    showCardW('dshhb-costcard', sw.showCost); showCardW('dshhb-logcard', sw.showPhoneLog); showCardW('dshhb-tlcard', sw.showTimeline);
    if (sw.showPauseNote === false) { var pg = $('dshhb-pausenote-go'); if (pg) pg.style.display = 'none'; var pn2 = $('dshhb-pausenote'); if (pn2 && pn2.parentElement) pn2.parentElement.style.display = 'none'; }
    var cbs = [['dshhb-showpeak', sw.showPeak], ['dshhb-showlog', sw.showPhoneLog], ['dshhb-showtl', sw.showTimeline],
               ['dshhb-showpausenote', sw.showPauseNote], ['dshhb-showcost', sw.showCost], ['dshhb-showquick', sw.quickBar]];
    for (var ci = 0; ci < cbs.length; ci++) { var ce = $(cbs[ci][0]); if (ce && document.activeElement !== ce) ce.checked = (cbs[ci][1] !== false); }
    var ft = $('dshhb-foot');
    if (ft && j.authorship) {
      ft.innerHTML = 'by:鹏冥月落 · v' + (j.authorship.version || j.authorship.official || '?') +
        (j.authorship.tampered ? ' <b style=\"color:#ff5d5d\">⚠️ 原作者标记被移除</b>' : '');
    }
    var pco = $('dshhb-poscheckon'); if (pco && document.activeElement !== pco) pco.checked = !!sw.posCheck;
    var pce = $('dshhb-poscheck'); if (pce && document.activeElement !== pce) pce.value = (sw.posCheckMin != null ? sw.posCheckMin : 1);
    var qb = $('dshhb-qbar');
    if (qb) {
      qb.style.display = (sw.quickBar !== false && sw.quickBar) ? 'flex' : 'none';
      var pt = function (id, val) { var b = $(id); if (b) { b.style.color = (val !== false) ? '#3ddc84' : '#6b6b73'; b.style.borderColor = (val !== false) ? '#3ddc84' : '#2b2b31'; } };
      pt('dshhb-q-peak', sw.showPeak); pt('dshhb-q-log', sw.showPhoneLog); pt('dshhb-q-tl', sw.showTimeline); pt('dshhb-q-cost', sw.showCost);
      var pbq = $('dshhb-q-pause'); if (pbq) pbq.textContent = window.__hbPaused ? '▶' : '⏸';
    }
    // ① 峰价倒计时（胶囊 + 面板）
    var cn = $('dshhb-chipnext'), nx = $('dshhb-next');
    if (j.peak && j.peak.nextInSec != null && (!j.settings || j.settings.showPeak !== false)) {
      var t = hms(j.peak.nextInSec), peak = !!j.peak.peak;
      if (cn) { cn.textContent = (peak ? '🔥' : '🌙') + t; cn.style.color = peak ? '#ff5d5d' : '#3ddc84'; }
      if (nx) {
        nx.textContent = t + '后转' + (j.peak.nextPeak ? '峰' : '谷');
        nx.style.color = peak ? '#ff5d5d' : '#3ddc84';
      }
      // 峰价时在步骤框上挂一句"省一半"
      var stp = $('dshhb-step');
      if (stp && peak && String(stp.innerHTML || '').indexOf('现在峰价') === -1) {
        stp.innerHTML = String(stp.innerHTML || '') + '<div style="color:#ff9f0a;margin-top:3px">\ud83d\udd25 \u73b0\u5728\u5cf0\u4ef7 \u00b7 ' + t + ' \u540e\u8f6c\u8c37\u4ef7\uff0c\u5927\u6d3b\u7b49\u4e00\u7b49\u4fbf\u5b9c\u4e00\u534a</div>';
      }
    } else if (cn) { cn.textContent = ''; }
    // ② 7 天花费
    var wk = $('dshhb-week7');
    if (wk && j.cost && j.cost.week) {
      var c = j.cost.week, mx = 0.01, sum = 0;
      for (var i = 0; i < c.length; i++) { var v = Number(c[i].cost) || 0; if (v > mx) mx = v; sum += v; }
      var tk = new Date(Date.now() + 28800000).toISOString().slice(0, 10), h = '';
      for (var i2 = 0; i2 < c.length; i2++) {
        var v2 = Number(c[i2].cost) || 0, hh = Math.max(2, Math.round(v2 / mx * 36));
        var isT = c[i2].date === tk;
        h += '<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center" title="' + c[i2].date + ' ' + moneyW(v2) + '">' +
             '<i style="display:block;width:100%;height:' + hh + 'px;background:' + (isT ? '#4c8dff' : '#3a3a42') + ';border-radius:2px 2px 0 0"></i>' +
             '<span style="font-size:8px;color:#6b6b73">' + c[i2].date.slice(8) + '</span></div>';
      }
      wk.innerHTML = h;
      var ws = $('dshhb-week7sum'); if (ws) ws.textContent = '合 ' + moneyW(sum);
      var mb = (j.settings && j.settings.monthBudget != null) ? Number(j.settings.monthBudget) : 50;
      var mm = (j.cost.month || 0), ml = $('dshhb-month');
      if (ml) {
        ml.textContent = '本月累计 ' + moneyW(mm) + (mb > 0 ? ' / 预算 ' + moneyW(mb) : '');
        ml.style.color = (mb > 0 && mm > mb) ? '#ff5d5d' : '#6b6b73';
      }
      var bi = $('dshhb-budget'); if (bi && document.activeElement !== bi) bi.value = mb;
    }
    // ③ 手机操控日志（最近 3 条）
    var pl = $('dshhb-phonelog');
    if (pl) {
      var arr = j.phoneLog || [];
      if (!arr.length) pl.textContent = '（暂无记录）';
      else {
        var o = '';
        for (var k = 0; k < Math.min(3, arr.length); k++) {
          var a = String(arr[k].args || '').replace(/^\S+\s*/, '');
          o += '<div style="border-bottom:1px dashed #1f1f23">' + hhmmW(arr[k].at) + ' <b style="color:#ff9f0a">' + String(arr[k].cmd || '') + '</b> ' + a + '</div>';
        }
        pl.innerHTML = o;
      }
      var ln = $('dshhb-logn'); if (ln) ln.textContent = arr.length ? (arr.length + ' 条') : '';
    }
    // ④ 步骤时间线（最近 4 步 + 耗时）
    var tl = $('dshhb-tl');
    if (tl) {
      var hs = j.history || [];
      if (!hs.length) tl.textContent = '（暂无记录）';
      else {
        var o2 = '';
        for (var k2 = 0; k2 < Math.min(4, hs.length); k2++) {
          var cur = hs[k2], prev = hs[k2 + 1];
          var dur = prev ? Math.round((cur.at - prev.at) / 1000) : null;
          o2 += '<div><span style="color:#4c8dff">' + hhmmW(cur.at) + '</span> ' + String(cur.step || '').replace(/</g, '&lt;') +
                (dur != null ? ' <span style="color:#6b6b73">(' + fmt(dur) + ')</span>' : '') + '</div>';
        }
        tl.innerHTML = o2;
      }
    }
    // ⑤ 暂停中的备注
    if (j.pause && j.pause.on && j.pause.note) {
      var wt2 = $('dshhb-worktext'); if (wt2) wt2.textContent = '已暂停 · ' + j.pause.note;
    }
  }
  // 外观：位置 / 字号
  function bindSkinW() {
    var bs = document.querySelectorAll('[data-pos]');
    for (var i = 0; i < bs.length; i++) {
      tapOn(bs[i], function () { try { localStorage.setItem('dshhb-pos-preset', this.getAttribute('data-pos')); } catch (e) {} applySkinW(); });
    }
    var fe = $('dshhb-fs');
    if (fe) tapOn(fe, function () {
      var v = Number(fe.value); if (!(v >= 9 && v <= 16)) v = 11;
      try { localStorage.setItem('dshhb-fs', String(v)); } catch (e) {}
      applySkinW();
    });
    var go = $('dshhb-pausenote-go');
    if (go) tapOn(go, function () {
      var ni = $('dshhb-pausenote'), note = ni ? (ni.value || '') : '';
      fetch(API + '/pause?note=' + encodeURIComponent(note), { method: 'POST' }).catch(function () {}).then(tick);
    });
  }

  function bindQuickBar() {
    var post = function (q) { return fetch(API + '/settings?' + q, { method: 'POST' }).catch(function () {}).then(tick); };
    var tog = function (id, key) { var b = $(id); if (!b) return; tapOn(b, function () { var cur = (last && last.settings) ? last.settings[key] : true; post(key + '=' + (cur === false ? '1' : '0')); }); };
    tog('dshhb-q-peak', 'showPeak'); tog('dshhb-q-log', 'showPhoneLog'); tog('dshhb-q-tl', 'showTimeline'); tog('dshhb-q-cost', 'showCost');
    tapOn($('dshhb-q-set'), function () { flashBtn($('dshhb-q-set')); setOpen(true); });
    tapOn($('dshhb-q-pause'), function () {
      var ni = $('dshhb-pausenote'), note = ni ? (ni.value || '') : '';
      fetch(API + (window.__hbPaused ? '/pause/clear' : ('/pause?note=' + encodeURIComponent(note))), { method: 'POST' }).catch(function () {}).then(tick);
    });
    tapOn($('dshhb-q-stop'), function () { fetch(API + '/interrupt', { method: 'POST' }).catch(function () {}).then(tick); });
  }
  // 新实例接管后，再回收上一个实例的节点（延迟一点，保证新挂件先出现在页面上）
  try {
    var __prev = window.__dshHeartbeatPrev; window.__dshHeartbeatPrev = null;
    if (__prev) setTimeout(function () {
      __prev.forEach(function (n) { if (n && n !== wrap && n !== edge && n.parentNode) n.parentNode.removeChild(n); });
    }, 400);
  } catch (e) {}
  async function doDump() {
    var msg = $('dshhb-dumpmsg');
    try {
      var out = {
        ts: Date.now(), selfVer: SELF_VER, widgetVer: window.__HB_WIDGET_VER, api: API,
        ua: (navigator && navigator.userAgent) || '', vp: (window.innerWidth || 0) + 'x' + (window.innerHeight || 0),
        href: String((window.location && location.href) || ''), dash: (typeof dashCount === 'function' ? dashCount() : -1),
        errors: ((window.__dshhbDoctor && window.__dshhbDoctor.errors) || []).slice(-10),
        ls: {}, state: last || null,
      };
      try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^dshhb-/.test(k)) out.ls[k] = localStorage.getItem(k); } } catch (e) {}
      var r = await fetch(API + '/dump', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(out) });
      var j = await r.json();
      if (msg) msg.textContent = (j && j.ok) ? ('✅ 已保存：' + j.file) : ('❌ 保存失败：' + ((j && j.error) || '宿主未重启？'));
    } catch (e) { if (msg) msg.textContent = '❌ ' + ((e && e.message) || e); }
  }
  bindSkinW(); bindQuickBar(); applySkinW(); try { tapOn($('dshhb-dump'), function () { flashBtn($('dshhb-dump')); doDump(); }); } catch (e) {}
  tick(); arm();
  setTimeout(function () { if (last && last.settings && last.settings.posCheck) checkPos(); }, 4000);   // 位置自检开关默认关
  try { fetch(API + '/rev?ver=' + SELF_VER, { method: 'POST' }).catch(function () {}); } catch (e) {}   // 上报本机改动计数
  } catch (err) {
    // ⚠️ 绝不静默：崩了也要①解开守卫（否则 doctor/看门狗都被挡）②在屏幕上留下可见提示
    try { window.__dshHeartbeat = null; } catch (e2) {}
    try {
      var eb = document.createElement('div');
      eb.id = 'dshhb-init-error';
      eb.setAttribute('style', 'position:fixed;left:8px;bottom:96px;z-index:2147483645;' +
        'background:#2a1113;color:#ffb4b4;border:1px solid #5a1f22;border-left:4px solid #ff3b30;border-radius:8px;' +
        'padding:8px 9px;font:11px/1.45 ui-monospace,Menlo,monospace;max-width:86vw;word-break:break-all');
      eb.innerHTML = '🩺 <b>心跳挂件初始化失败</b>（守卫已自动释放，doctor 会尝试重启）<br>' +
        String((err && err.message) || err).slice(0, 220) +
        '<br><span style="color:#8b8b93">点 doctor 的「🔄 重启挂件」或重载页面</span>';
      (document.body || document.documentElement).appendChild(eb);
    } catch (e3) {}
  }
})();

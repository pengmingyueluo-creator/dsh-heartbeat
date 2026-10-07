// dsh-heartbeat 数据核心 —— 标准版（dsh-heartbeat.js）与插件版共用同一份，避免逻辑漂移。
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const PAGE_VERSION = 35;
// ── 原作者标记（**不许删**）与版本显示规则 ──
//   显示格式： <正统版本>（<本机用 AI 改过的小版本数>）
//   正统版本跟随本仓库发布；括号里的数字每台机器各自计数，官方发新版会归零。
const AUTHOR = '鹏冥月落';
// 官方公钥（只用于**验证**凭据，推导不出私钥；私钥只在作者工作区 ✓）
const OFFICIAL_PUB_JWK = {"kty": "EC", "x": "G8TV488F7iwwqd6_mjCVO7KnFRjFaedqP8LQSSYRmgc", "y": "WRBTheog3AsZ7X6W7-VvKBa5Q5y2gfmjjNQ6_f6Y024", "crv": "P-256"};
const OFFICIAL_VERSION = (() => { try { return require('../package.json').version || '0.0.0'; } catch { return '0.0.0'; } })();

// 状态目录解析规则（extras/ 里的脚本用同一套规则，务必保持一致）：
//   ① $DSH_HEARTBEAT_DIR 显式指定
//   ② 老布局：状态文件跟工作区放一起（存在 .dsh-heartbeat.json / .dsh-interrupt.json）
//   ③ 新装默认：$DSH_HOME/heartbeat（通常是 ~/.dsh/heartbeat）
function resolveWorkdir() {
  if (process.env.DSH_HEARTBEAT_DIR) return process.env.DSH_HEARTBEAT_DIR;
  const legacy = process.env.DSH_HEARTBEAT_LEGACY || '/sdcard/123云盘/ds工作区';
  try {
    if (fs.existsSync(path.join(legacy, '.dsh-heartbeat.json')) || fs.existsSync(path.join(legacy, '.dsh-interrupt.json'))) return legacy;
  } catch {}
  return path.join(process.env.DSH_HOME || path.join(process.env.HOME || '/root', '.dsh'), 'heartbeat');
}

function createCore(opts) {
  const WORKDIR = opts.workdir || resolveWorkdir();
  const DSH_HOME = opts.dshHome || process.env.DSH_HOME || path.join(process.env.HOME || '/root', '.dsh');
  const HARNESS = opts.harness || process.env.DSH_HEARTBEAT_HARNESS || 'http://127.0.0.1:3080';
  const PHONE_BRIDGE = process.env.DSH_HEARTBEAT_BRIDGE || 'http://127.0.0.1:3099';
  try { fs.mkdirSync(WORKDIR, { recursive: true }); } catch {}   // 新装时目录可能还不存在
  const MODEL = 'deepseek-flash';
  const BJ_MS = 8 * 3600 * 1000;
  const IDLE_GRACE_MS = 30000;
  const MAX_BUSY_MS = 15 * 60 * 1000;
  const PROJ_DIR = path.join(DSH_HOME, 'storages/session_projcache/sessions');
  const STATUS_FILE = path.join(WORKDIR, '.dsh-heartbeat.json');
  const PHONE_OP_FILE = path.join(WORKDIR, '.dsh-phone-last.json');
  const PHONE_HBP_FILE = path.join(WORKDIR, '.dsh-heartbeat-phone.json');
  const INTERRUPT_FILE = path.join(WORKDIR, '.dsh-interrupt.json');
  const PAUSE_FILE = path.join(WORKDIR, '.dsh-pause.json');
  const DAYSTART_FILE = path.join(WORKDIR, '.dsh-daystart.json');
  const TOPUP_FILE = path.join(WORKDIR, '.dsh-topup.json');
  const TURN_FILE = path.join(WORKDIR, '.dsh-turnacc.json');
  const PHONE_LOG_FILE = path.join(WORKDIR, '.dsh-phone-log.jsonl');      // 手机操控日志（哨兵逐条 append）
  const HISTORY_FILE = path.join(WORKDIR, '.dsh-heartbeat-history.json'); // 心跳时间线
  const COST_HISTORY_FILE = path.join(WORKDIR, '.dsh-cost-history.json'); // 每日花费（画 7 天柱状图）
  const WIDGET_REV_FILE = path.join(WORKDIR, '.dsh-widget-rev.json');  // AI 重启指令（rev 变化 ⇒ 前端重启挂件）
  const DOCTOR_FILE = path.join(WORKDIR, '.dsh-doctor.json');
  const LOCALREV_FILE = path.join(WORKDIR, '.dsh-localrev.json');   // 本机小改计数（版本号括号里的数）
  const ART_FILE = path.join(__dirname, '.dshhe-art.json');         // 出处凭据 + 自改标记（藏在插件深处，界面不显示）
  const DUMP_DIR = path.join(WORKDIR, 'dumps');
  const INBOX_FILE = path.join(WORKDIR, '.dsh-inbox.jsonl');
  const FOCUS_FILE = path.join(WORKDIR, '.dsh-focus.json');
  const TODO_FILE = path.join(WORKDIR, '.dsh-todo.json');
  const HOLIDAY_FILE = path.join(WORKDIR, '.dsh-holidays.json');   // ★节假日表（可改 ✓ 内置表仅作兜底）
  // 法定节假日（全天谷价 ✓）—— ⚠️ 每年国务院公布后才准确，请在 .dsh-holidays.json 里核对/覆盖
  const HOLIDAYS_BUILTIN = {
    '2026-01-01': '元旦', '2026-01-02': '元旦', '2026-01-03': '元旦',
    '2026-02-15': '春节', '2026-02-16': '春节', '2026-02-17': '春节', '2026-02-18': '春节',
    '2026-02-19': '春节', '2026-02-20': '春节', '2026-02-21': '春节',
    '2026-04-04': '清明', '2026-04-05': '清明', '2026-04-06': '清明',
    '2026-05-01': '劳动节', '2026-05-02': '劳动节', '2026-05-03': '劳动节', '2026-05-04': '劳动节', '2026-05-05': '劳动节',
    '2026-06-19': '端午', '2026-06-20': '端午', '2026-06-21': '端午',
    '2026-09-25': '中秋', '2026-09-26': '中秋', '2026-09-27': '中秋',
    '2026-10-01': '国庆', '2026-10-02': '国庆', '2026-10-03': '国庆', '2026-10-04': '国庆',
    '2026-10-05': '国庆', '2026-10-06': '国庆', '2026-10-07': '国庆', '2026-10-08': '国庆',
    '2027-01-01': '元旦', '2027-01-02': '元旦', '2027-01-03': '元旦'
  };
  const MAKEUP_BUILTIN = [];   // 调休上班的周末（那些天照样峰价 ✓）—— 同样可在文件里覆盖         // agent 当前计划（前端展示 ✓）
  const ASK_FILE = path.join(WORKDIR, '.dsh-ask.json');           // agent 提问（前端弹 ✅/❌ ✓）
  const FERR_FILE = path.join(WORKDIR, '.dsh-fetch-errors.jsonl');
  const LASTSAVE_FILE = path.join(WORKDIR, '.dsh-settings-last.json');
  const WRITES_LOG = path.join(WORKDIR, '.dsh-settings-writes.jsonl');
  const BACKUP_DIR = path.join(WORKDIR, 'backups');
  const UI_FILE = path.join(WORKDIR, '.dsh-ui-log.jsonl');
  const REPORT_FILE = path.join(WORKDIR, '.dsh-daily-report.json');   // 每日心流日报（当天只生成一次）
  const BADGE_FILE = path.join(WORKDIR, '.dsh-badges.json');
  const CLOCK_FILE = path.join(WORKDIR, '.dsh-clock-offset.json');   // 时钟偏移（本机=宿主时钟不准 ⇒ 修"按天"逻辑 ✓ 别人默认 0 ✓）          // 心流徽章   // ★操作监听（只读）：谁在页面上动了哪个开关/按钮   // ★全量备份（AI 改前先备份 ✓ 出大事一键回档 ✓）   // ★谁改过设置（含调用栈，抓现行用 ✓）   // 上一次成功保存的完整快照（校验用 ✓）// 接口失败滚动记录（排障 ✓）      // 串流页「切回 DSH」请求（agent 下次 hb 读到就切）   // 小窗/串流页给 agent 的留言（agent 每次 hb 会读）                     // 一键导出的校准日志（别人出 bug 把这文件夹发回来即可）          // 前端诊断回报（AI 可读）
  const MODE_FILE = path.join(DSH_HOME, 'heartbeat-mode.json');
  const SETTINGS_FILE = path.join(DSH_HOME, 'heartbeat-settings.json');
  const GUARD_FILE = path.join(DSH_HOME, 'heartbeat-guard.json');
  const DEFAULT_SETTINGS = { mode: 'both', streamPort: 0, orangeBelow: 10, redBelow: 5, pauseIdleMin: 5, balanceAlert: true, criticalBelow: 1, dailyCostAlert: 10, todayMode: 'actual', viz: true, idleGraceSec: 15, phoneTtlSec: 8, flashEveryMin: 10, flashRedMin: 3, eggInteractive: true, ctxBar: true, monthBudget: 50,
    // 1.3.0 新功能的开关（默认全开；quickBar=设置外显，默认关）
    showPeak: true, showPhoneLog: true, showTimeline: true, showPauseNote: false /* 关闭时=普通暂停，不显示备注框 */, showCost: true, showEcg: true, refreshSec: 1, showFlow: false /* 心流日报+徽章：默认关 ✓ 用户偏好精确数据 ✓ */, showBudgetGuard: false /* 预算门：默认关 ✓ 防误烧别人余额 ✓ */, showReplay: false /* 花费/操控回放：默认关 ✓ */, uiMonitor: true /* 操作监听：默认开 ✓ */, sensitiveApps: '', aiRead: false /* AI 只读端口查询：默认关（防 AI 持续轮询烧 token ✓）*/ , quickBar: false, posCheck: false, posCheckMin: 1 /* 挂件位置自检间隔（分钟）1~10 */ };
  const net = require('node:net');
  const ENV_SESSION = process.env.DSH_SESSION_ID || '';
  const STARTED = Date.now();

  // ── 宿主进程 / 资源 ──
  let cachedPid = '';
  function hostPid() {
    if (cachedPid && fs.existsSync('/proc/' + cachedPid + '/status')) return cachedPid;
    cachedPid = '';
    for (const name of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(name)) continue;
      let cmd = ''; try { cmd = fs.readFileSync('/proc/' + name + '/cmdline', 'utf8'); } catch { continue; }
      if (!cmd.includes('dsh') || !cmd.includes('--profile')) continue;
      let env = ''; try { env = fs.readFileSync('/proc/' + name + '/environ', 'utf8'); } catch { continue; }
      if (!env.includes('DEEPSEEK_API_KEY=')) continue;
      cachedPid = name; break;
    }
    return cachedPid;
  }
  function rssMB() {
    const pid = hostPid(); if (!pid) return null;
    try { const m = fs.readFileSync('/proc/' + pid + '/status', 'utf8').match(/VmRSS:\s+(\d+) kB/); return m ? Math.round(Number(m[1]) / 1024) : null; } catch { return null; }
  }
  let cpuSample = { at: 0, ticks: 0 };
  function cpuPct() {
    const pid = hostPid(); if (!pid) return null;
    try {
      const raw = fs.readFileSync('/proc/' + pid + '/stat', 'utf8');
      const rest = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
      const ticks = Number(rest[11]) + Number(rest[12]);
      const now = Date.now();
      let pct = null;
      if (cpuSample.at && now > cpuSample.at) {
        pct = Math.round(((ticks - cpuSample.ticks) / ((now - cpuSample.at) / 1000)) * 10) / 10;
        if (!Number.isFinite(pct) || pct < 0) pct = 0;
      }
      cpuSample = { at: now, ticks };
      return pct;
    } catch { return null; }
  }
  function disk() {
    try {
      const s = fs.statfsSync('/');
      const total = s.blocks * s.bsize, free = s.bavail * s.bsize;
      return { freeGB: +(free / 1073741824).toFixed(1), usedPct: Math.round((1 - free / total) * 100) };
    } catch { return null; }
  }
  function runningCmd() {                       // 缺陷6：取最近启动的子进程
    const pid = hostPid(); if (!pid) return null;
    let best = null;
    for (const name of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(name)) continue;
      let raw; try { raw = fs.readFileSync('/proc/' + name + '/stat', 'utf8'); } catch { continue; }
      const rest = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
      if (Number(rest[1]) !== Number(pid)) continue;
      let cmd = ''; try { cmd = fs.readFileSync('/proc/' + name + '/cmdline', 'utf8').replace(/\0/g, ' ').trim(); } catch { continue; }
      if (!cmd || cmd.includes('dsh-heartbeat')) continue;
      const start = Number(rest[19]) || 0;
      if (!best || start > best.start) best = { start, cmd };
    }
    if (!best) return null;
    return best.cmd.length > 100 ? best.cmd.slice(0, 100) + '…' : best.cmd;
  }

  // ── 余额（优先用 harness 的 credentials 服务；否则读宿主 environ）──
  let keyFromCtx = '';
  async function apiKey() {
    if (keyFromCtx) return keyFromCtx;
    try {
      const r = opts.ctx && opts.ctx.credentials && await opts.ctx.credentials.resolve('DEEPSEEK_API_KEY');
      if (r && r.value) { keyFromCtx = r.value; return keyFromCtx; }
    } catch { /* 退回 /proc */ }
    const pid = hostPid(); if (!pid) return '';
    try {
      const env = fs.readFileSync('/proc/' + pid + '/environ', 'utf8').split('\0');
      const line = env.find((l) => l.startsWith('DEEPSEEK_API_KEY='));
      return line ? line.slice('DEEPSEEK_API_KEY='.length) : '';
    } catch { return ''; }
  }
  let balCache = { at: 0, data: null };
  async function balance() {
    if (Date.now() - balCache.at < 60000 && balCache.data) return balCache.data;
    balCache.at = Date.now();
    const key = await apiKey();
    if (!key) return balCache.data;
    try {
      const r = await fetch('https://api.deepseek.com/user/balance', { headers: { authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(6000) });
      const j = await r.json();
      const list = j.balance_infos || [];
      const b = list.find((x) => x.currency === 'CNY') || list[0];
      if (b) balCache.data = { currency: b.currency, total: Number(b.total_balance), at: Date.now() };
    } catch { /* 保留上次 */ }
    return balCache.data;
  }

  // ── 峰谷价：内置价目表 + 可选从本地插件接口刷新 ──
  const FALLBACK_BOOK = {
    currency: 'CNY',
    peakSchedule: { weekendOffpeak: true, intervals: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
    pricing: {
      'deepseek-flash': { peak: { uncachedInputPerMillion: 2, cacheReadPerMillion: 0.04, cacheWritePerMillion: 0, outputPerMillion: 8 },
                          offpeak: { uncachedInputPerMillion: 1, cacheReadPerMillion: 0.02, cacheWritePerMillion: 0, outputPerMillion: 4 } },
      'deepseek-v4-pro': { peak: { uncachedInputPerMillion: 9, cacheReadPerMillion: 0.3, cacheWritePerMillion: 0, outputPerMillion: 27 },
                           offpeak: { uncachedInputPerMillion: 4.5, cacheReadPerMillion: 0.15, cacheWritePerMillion: 0, outputPerMillion: 13.5 } },
    },
  };
  let priceCache = { at: 0, data: null };
  async function priceBook() {
    if (Date.now() - priceCache.at < 600000 && priceCache.data) return priceCache.data;
    try {
      const r = await fetch(HARNESS + '/api/token-usage-stats/pricing', { signal: AbortSignal.timeout(2000) });
      const j = await r.json();
      if (j && j.pricing) { priceCache = { at: Date.now(), data: j }; return j; }
    } catch { /* 用内置表 */ }
    priceCache = { at: Date.now(), data: FALLBACK_BOOK };
    return FALLBACK_BOOK;
  }
  const toMin = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
  // ── 节假日 / 调休 判定（用户要求：法定节假日全天谷价 ✓）──
  function holidayTable() {
    let hol = Object.assign({}, HOLIDAYS_BUILTIN), mk = MAKEUP_BUILTIN.slice();
    try {
      const f = JSON.parse(fs.readFileSync(HOLIDAY_FILE, 'utf8'));
      if (f && f.holidays) hol = Object.assign(hol, f.holidays);
      if (f && Array.isArray(f.makeup)) mk = f.makeup;
    } catch {}
    return { hol, mk };
  }
  function dayKind(dateKey, dow) {
    const { hol, mk } = holidayTable();
    if (hol[dateKey]) return { holiday: hol[dateKey], off: true, makeup: false };
    if (mk.indexOf(dateKey) >= 0) return { holiday: null, off: false, makeup: true };   // 调休上班 ⇒ 照峰价 ✓
    if (dow === 0 || dow === 6) return { holiday: null, off: true, makeup: false };      // 周末 ⇒ 全天谷价 ✓
    return { holiday: null, off: false, makeup: false };
  }
  function boundaries(dow, intervals) {
    if (dow === 0 || dow === 6) return [];
    const pts = [];
    for (const { start, end } of intervals) pts.push({ m: toMin(start), peak: true }, { m: toMin(end), peak: false });
    return pts.sort((a, b) => a.m - b.m);
  }
  function peakNow(now, book) {
    const sch = (book && book.peakSchedule) || FALLBACK_BOOK.peakSchedule;
    const intervals = sch.intervals || [];
    const weekendOff = sch.weekendOffpeak !== false;
    const bj = new Date(now + BJ_MS);
    const dow = bj.getUTCDay(), minutes = bj.getUTCHours() * 60 + bj.getUTCMinutes();
    const weekend = dow === 0 || dow === 6;
    let peak = weekendOff && weekend ? false : intervals.some(({ start, end }) => minutes >= toMin(start) && minutes < toMin(end));
    // ★节假日例外（用户要求）：法定节假日 ⇒ 全天谷价 ✓；调休上班的周末 ⇒ 照峰价 ✓
    const __bjDate = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    const __dk = (typeof dayKind === 'function') ? dayKind(__bjDate, dow) : { holiday: null, off: false, makeup: false };
    const __offAll = !!__dk.off;
    if (__offAll) peak = false;   // ★节假日/周末 ⇒ 全天谷价 ✓

    const dayIdx = Math.floor((now + BJ_MS) / 86400000);
    const all = [];
    for (let d = -2; d < 9; d++) {
      const dayStart = (dayIdx + d) * 86400000 - BJ_MS;
      const dw = new Date(dayStart + BJ_MS).getUTCDay();
      for (const p of boundaries(dw, intervals)) all.push({ t: dayStart + p.m * 60000, peak: p.peak });
    }
    all.sort((a, b) => a.t - b.t);
    const prev = [...all].reverse().find((p) => p.t <= now && p.peak === peak);
    const next = all.find((p) => t0(p) > now && p.peak !== peak);
    function t0(p) { return p.t; }
    const span = prev && next ? next.t - prev.t : 0;
    const pct = span > 0 ? Math.min(100, Math.max(0, Math.round(((now - prev.t) / span) * 100))) : 0;
    const pk = ((book && book.pricing) || FALLBACK_BOOK.pricing)[MODEL] || {};
    return {
      peak, weekend, weekendOffpeak: weekendOff, bandPct: pct, allDayOffpeak: !!__offAll, holidayName: (__dk && __dk.holiday) || null, makeupDay: !!(__dk && __dk.makeup),
      nextInSec: __offAll ? null : (next ? Math.round((next.t - now) / 1000) : null),   // all-day same price => no countdown
            nextPeak: __offAll ? null : (next ? next.peak : null),
      price: peak ? pk.peak : pk.offpeak,
    };
  }

  // ── 进度 / 会话（缺陷1：会话 id 动态）──
  function progressRaw() { try { return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch { return {}; } }
  function currentSessionId() {
    const fromStatus = progressRaw().sessionId;
    if (fromStatus) return fromStatus;
    if (ENV_SESSION) return ENV_SESSION;
    try {
      let best = null;
      for (const f of fs.readdirSync(PROJ_DIR)) {
        if (!f.endsWith('.json')) continue;
        const st = fs.statSync(path.join(PROJ_DIR, f));
        if (!best || st.mtimeMs > best.mtimeMs) best = { f, mtimeMs: st.mtimeMs };
      }
      return best ? best.f.replace(/\.json$/, '') : '';
    } catch { return ''; }
  }
  function progress() {
    const j = progressRaw();
    const rawBusy = Number(j.busyMs) || 0;
    return {
      step: j.step || '', at: j.at || 0,
      busyMs: Math.min(rawBusy, MAX_BUSY_MS), busyCapped: rawBusy > MAX_BUSY_MS,
      agoSec: Math.round((Date.now() - (j.at || 0)) / 1000),
    };
  }
  function sessionCtx() {
    const sid = currentSessionId();
    if (!sid) return null;
    try {
      const rows = (JSON.parse(fs.readFileSync(path.join(PROJ_DIR, sid + '.json'), 'utf8')).record || {}).rows || {};
      const cp = rows.contextPressure && rows.contextPressure.val;
      const tu = rows.tokenUsage && rows.tokenUsage.val;
      if (!cp && !tu) return null;
      const pct = (n, d) => (n != null && d ? Math.round((n / d) * 1000) / 10 : null);
      return {
        sessionId: sid,
        ctxPct: cp ? pct(cp.surfaceTokens, cp.contextWindow) : null,
        pressPct: cp ? pct(cp.pressureTokens, cp.contextWindow) : null,
        surface: cp ? cp.surfaceTokens : null, window: cp ? cp.contextWindow : null,
        totals: tu ? tu.totals : null,
        last: tu && tu.last ? { turn: tu.last.turn, step: tu.last.step, buckets: tu.last.buckets } : null,
      };
    } catch { return null; }
  }

  // ── 每轮消耗（缺陷5：落盘）──
  let turnAcc = { turn: null, step: null, cost: 0, prev: [] };
  try { const s = JSON.parse(fs.readFileSync(TURN_FILE, 'utf8')); if (s && typeof s.turn !== 'undefined') turnAcc = s; } catch {}
  function saveTurn() { try { fs.writeFileSync(TURN_FILE, JSON.stringify(turnAcc) + '\n'); } catch {} }
  function noteTurn(turn, step, cost) {
    if (turn == null) return null;
    if (turnAcc.turn !== turn) {
      if (turnAcc.turn !== null) turnAcc.prev = [...turnAcc.prev, { turn: turnAcc.turn, cost: turnAcc.cost }].slice(-3);
      turnAcc = { turn, step, cost, prev: turnAcc.prev }; saveTurn();
    } else if (turnAcc.step !== step) { turnAcc.step = step; turnAcc.cost += cost; saveTurn(); }
    return { n: turnAcc.turn, step: turnAcc.step, cost: turnAcc.cost, lastStepCost: cost, prev: turnAcc.prev };
  }

  // ── 哨兵 / 中断 / 手机活动（缺陷7）──
  function sentinelStatus() {
    for (const p of ['/usr/local/sbin/phone', '/usr/local/bin/phone']) {
      try { if (fs.readFileSync(p, 'utf8').includes('手机操控哨兵')) return { installed: true, path: p }; } catch {}
    }
    return { installed: false, path: null };
  }
  function interruptState() {
    try {
      const j = JSON.parse(fs.readFileSync(INTERRUPT_FILE, 'utf8'));
      const age = Math.round((Date.now() - (j.at || 0)) / 1000);
      return j.on && age <= 600 ? { on: true, ageSec: age, reason: j.reason || '' } : { on: false };
    } catch { return { on: false }; }
  }
  function setInterrupt(on) {
    fs.writeFileSync(INTERRUPT_FILE, JSON.stringify({ on, at: Date.now(), reason: on ? '小窗按钮' : '' }) + '\n');
    return { ok: true };
  }
  // ── 今日原有：每天第一次拿到余额时记一笔（"每日第 1 条会话读取一遍余额"）──
  function dayStart(bal) {
    const BJ = 8 * 3600 * 1000;
    const today = new Date(Date.now() + BJ).toISOString().slice(0, 10);
    let rec = null;
    try { rec = JSON.parse(fs.readFileSync(DAYSTART_FILE, 'utf8')); } catch {}
    if (!rec || rec.date !== today) {
      if (bal != null) {
        rec = { date: today, balance: bal.total, at: Date.now() };
        try { fs.writeFileSync(DAYSTART_FILE, JSON.stringify(rec) + '\n'); } catch {}
      } else if (!rec) rec = { date: today, balance: null };
    }
    return rec;
  }

  // ── 暂停工作（用户在挂件上按的 ⏸；agent 在每一步之间检查，发现置位就停手等确认）──
  // ── 作者标记 / 版本号（正统版本 + 本机小改次数）──
  function localRevRec() { try { return JSON.parse(fs.readFileSync(LOCALREV_FILE, 'utf8')) || {}; } catch { return {}; } }
  function noteWidgetVer(ver) {
    const a = artInfo();
    const offVer = Number(a.officialWidgetVer) || 0;
    const v = Number(ver) || 0;
    const rec = localRevRec();
    let seen = Array.isArray(rec.seen) ? rec.seen.slice() : [];
    let localRev = Number(rec.localRev) || 0;
    const isOfficial = !v || !offVer || v === offVer;          // ★ 等于官方基线 ⇒ 就是官方版
    if (rec.official !== OFFICIAL_VERSION || rec.offVer !== offVer) { seen = []; localRev = 0; }   // 换官方版 ⇒ 重新计数
    if (isOfficial) { localRev = 0; seen = []; }               // ★ 官方版：括号永远 0
    else if (seen.indexOf(v) === -1) { seen = seen.concat([v]).slice(-50); localRev = seen.length; }  // 自改：按"不同的非官方版本数"计
    const out = { official: OFFICIAL_VERSION, offVer, widgetVer: v || rec.widgetVer || 0, localRev, seen, isOfficial, at: Date.now() };
    try { fs.writeFileSync(LOCALREV_FILE, JSON.stringify(out) + '\n'); } catch {}
    return out;
  }
  // ── 出处凭据（自改标记）：藏在插件深处，界面不显示；改装者必须往里追加记录 ──
  function artInfo() {
    try { return JSON.parse(fs.readFileSync(ART_FILE, 'utf8')) || {}; } catch { return { author: AUTHOR, modifyLog: [] }; }
  }
  // ── 一键导出校准日志（大框里的「打印日志」按钮）──
  function saveDump(body) {
    try {
      fs.mkdirSync(DUMP_DIR, { recursive: true });
      const bj = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const name = 'heartbeat-dump-' + bj + '.json';
      const p = path.join(DUMP_DIR, name);
      const a = artInfo();
      const ml = Array.isArray(a.modifyLog) ? a.modifyLog : [];
      const pack = {
        at: Date.now(), bjTime: bj, plugin: 'dsh-heartbeat', author: AUTHOR, official: OFFICIAL_VERSION,
        selfModified: ml.length > 0, modifyLog: ml.slice(-20),
        artFile: ART_FILE, officialArt: { author: a.author, officialVersion: a.officialVersion },
        authorship: authorship(), official: officialBuild(), client: body || {},
      };
      fs.writeFileSync(p, JSON.stringify(pack, null, 1) + '\n');
      // ★顺便导出 CSV（用户要求：导出并入"打印日志" ✓ 可直接用 Excel 打开 ✓）
      try {
        let csv1 = '日期,花费(元),词元数\n';
        try { const ch = JSON.parse(fs.readFileSync(COST_HISTORY_FILE, 'utf8')); (ch.week || []).forEach((d) => { csv1 += d.date + ',' + (d.cost || 0) + ',' + (d.tokens || 0) + '\n'; }); } catch {}
        fs.writeFileSync(path.join(DUMP_DIR, 'cost-history.csv'), csv1);
        const rp = dailyReport();
        let csv2 = '项目,值\n';
        if (rp) { csv2 += '日期,' + rp.day + '\n花费(元),' + (rp.cost == null ? '' : rp.cost) + '\n步数,' + (rp.steps || 0) + '\n手机操作,' + (rp.phoneOps || 0) + '\n徽章,' + (rp.badges || []).join('|') + '\n'; }
        fs.writeFileSync(path.join(DUMP_DIR, 'daily-report.csv'), csv2);
        pack.csv = ['cost-history.csv', 'daily-report.csv'];
      } catch (e) {}
      return { ok: true, file: p, dir: DUMP_DIR, name };
    } catch (e) { return { ok: false, error: String(e) }; }
  }
  // ── 小窗留言信箱：串流页/挂件写 ⇒ agent 下次 `hb` 读到 ⇒ 用 /inbox/done 标记已读 ──
  // ── 串流页「↩ 切回 DSH」：前端置标记 ⇒ agent 下次 hb 读到 ⇒ 立刻切前台（用户主动点的 ✓ 无需预告 ✓）──
  function requestFocus(by) {
    try { fs.writeFileSync(FOCUS_FILE, JSON.stringify({ at: Date.now(), by: String(by || '串流页').slice(0, 20), app: 'com.dshmobile.probe' }) + '\n'); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  }
  function focusPending() { try { return JSON.parse(fs.readFileSync(FOCUS_FILE, 'utf8')); } catch { return null; } }
  function focusClear() { try { fs.unlinkSync(FOCUS_FILE); return { ok: true }; } catch { return { ok: true }; } }
  function say(text, from) {
    const t = String(text == null ? '' : text).trim();
    if (!t) return { ok: false, error: '空消息' };
    const rec = { at: Date.now(), from: String(from || '小窗').slice(0, 20), text: t.slice(0, 2000), done: false };
    try { fs.appendFileSync(INBOX_FILE, JSON.stringify(rec) + '\n'); } catch (e) { return { ok: false, error: String(e) }; }
    return { ok: true, at: rec.at };
  }
  function inbox(n, onlyNew) {
    try {
      return fs.readFileSync(INBOX_FILE, 'utf8').split('\n').filter(Boolean).slice(-(n || 50)).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).filter((r) => !onlyNew || !r.done);
    } catch { return []; }
  }
  function inboxDone(at) {
    try {
      const lines = fs.readFileSync(INBOX_FILE, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      for (const r of lines) if (!at || r.at <= Number(at)) r.done = true;
      fs.writeFileSync(INBOX_FILE, lines.slice(-300).map((r) => JSON.stringify(r)).join('\n') + '\n');
      return { ok: true, marked: lines.filter((r) => r.done).length };
    } catch (e) { return { ok: false, error: String(e) }; }
  }
  // ── agent 当前计划（用户要求：不用问就知道我在干嘛）──
  function setTodo(items, note) {
    const arr = (Array.isArray(items) ? items : String(items || '').split('\n')).map((x) => String(x).trim()).filter(Boolean).slice(0, 20);
    const rec = { at: Date.now(), items: arr, note: String(note || '').slice(0, 200) };
    try { fs.writeFileSync(TODO_FILE, JSON.stringify(rec) + '\n'); return { ok: true, n: arr.length }; } catch (e) { return { ok: false, error: String(e) }; }
  }
  function todo() { try { return JSON.parse(fs.readFileSync(TODO_FILE, 'utf8')); } catch { return null; } }
  // ── agent 提问（前端出现 ✅/❌ 按钮，答案落进收件箱 ⇒ agent 下次 hb 收到 ✓）──
  function ask(q, opts) {
    const o = Array.isArray(opts) && opts.length ? opts.map((x) => String(x).slice(0, 20)).slice(0, 4) : ['同意', '拒绝'];
    const rec = { at: Date.now(), q: String(q || '').slice(0, 300), options: o, answer: null, answeredAt: null };
    try { fs.writeFileSync(ASK_FILE, JSON.stringify(rec) + '\n'); return { ok: true }; } catch (e) { return { ok: false, error: String(e) }; }
  }
  function askState() { try { return JSON.parse(fs.readFileSync(ASK_FILE, 'utf8')); } catch { return null; } }
  function answerAsk(text, by) {
    const cur = askState(); if (!cur) return { ok: false, error: '没有待回答的问题' };
    cur.answer = String(text || '').slice(0, 40); cur.answeredAt = Date.now(); cur.by = String(by || '小窗').slice(0, 20);
    try { fs.writeFileSync(ASK_FILE, JSON.stringify(cur) + '\n'); } catch (e) { return { ok: false, error: String(e) }; }
    say('【回答】' + cur.answer + ' ← 问题：' + cur.q, by || '小窗');     // 答案进收件箱 ⇒ agent 下次 hb 读到 ✓
    return { ok: true, answer: cur.answer };
  }
  function askClear() { try { fs.unlinkSync(ASK_FILE); return { ok: true }; } catch { return { ok: true }; } }
  // ── 接口失败滚动记录 ──
  function noteFetchError(where, err) {
    try { fs.appendFileSync(FERR_FILE, JSON.stringify({ at: Date.now(), where: String(where || '').slice(0, 40), err: String(err || '').slice(0, 200) }) + '\n'); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  }
  function fetchErrors(n) {
    try { return fs.readFileSync(FERR_FILE, 'utf8').split('\n').filter(Boolean).slice(-(n || 20)).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }
    catch { return []; }
  }
  // ── 燃尽预测：按今天已用速度估算"还能用多久 / 今天预计花多少"──
  function burn(bal, usedToday) {
    try {
      const bjNow = new Date(Date.now() + 8 * 3600e3);
      const hoursToday = bjNow.getUTCHours() + bjNow.getUTCMinutes() / 60;
      if (!(hoursToday > 0.2)) return null;
      const rate = Number(usedToday || 0) / hoursToday;               // 元/小时
      if (!(rate > 0.001)) return null;
      const left = Number(bal || 0) / rate;
      return { ratePerHour: Math.round(rate * 100) / 100, hoursLeft: Math.round(left * 10) / 10,
               projectToday: Math.round(rate * 24 * 100) / 100, exhaustedAt: Math.round(Date.now() + left * 3600e3) };
    } catch { return null; }
  }
  // ── 一键体检（给 AI / 给人）──
  function selfcheck() {
    const st = { files: {}, tail: {} };
    const chk = (k, p) => { try { const s = fs.statSync(p); st.files[k] = { ok: true, size: s.size, ageSec: Math.round((Date.now() - s.mtimeMs) / 1000) }; } catch { st.files[k] = { ok: false }; } };
    chk('status', STATUS_FILE); chk('settings', path.join(WORKDIR, '.dsh-heartbeat-settings.json'));
    chk('daystart', DAYSTART_FILE); chk('inbox', INBOX_FILE); chk('todo', TODO_FILE); chk('ask', ASK_FILE);
    st.fetchErrors = fetchErrors(5); st.todo = todo(); st.ask = askState();
    st.author = authorship(); st.official = officialBuild(); st.inboxNew = inbox(20, true).length;
    try { const w = fs.readFileSync(path.join(__dirname, 'widget.js'), 'utf8'); st.widget = { selfVer: Number((w.match(/SELF_VER = (\d+)/) || [])[1] || 0), hasEcg: w.includes('dshhb-ecg'), hasAsk: w.includes('dshhb-ask') }; } catch {}
    return st;
  }
  // ── 今日每小时花费（给前端画/看 ✓）──
  function hoursCost(series) {
    try {
      const BJ = 8 * 3600e3, day = new Date(Date.now() + BJ).toISOString().slice(0, 10);
      const out = [];
      for (const b of (series || [])) {
        const d = new Date(b.startTime + BJ).toISOString();
        if (d.slice(0, 10) !== day) continue;
        out.push({ h: Number(d.slice(11, 13)), cost: Math.round((b.totals && b.totals.cost || 0) * 10000) / 10000, req: (b.totals && b.totals.requestCount) || 0 });
      }
      return out.sort((a, b) => a.h - b.h);
    } catch { return []; }
  }
  // ── 敏感 App 名单：命中就提醒（不阻止，只让用户知道 ✓）──
  function sensitiveHit(text) {
    try {
      const list = String(settings().sensitiveApps || '').split(/[,\s]+/).filter(Boolean);
      const t2 = String(text || '');
      for (const k of list) if (t2 && t2.includes(k)) return k;
      return null;
    } catch { return null; }
  }
  // ── ★备份：把"当前可用状态"全量存一份（AI 改前必做 ✓ 用户也可手动 ✓）──
  function backupNow(reason, by) {
    try {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const bj = new Date(Date.now() + 8 * 3600e3).toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const tag = String(reason || 'manual').replace(/[^\w\u4e00-\u9fa5-]/g, '').slice(0, 20) || 'manual';
      const name = bj + '__' + tag;
      const dir = path.join(BACKUP_DIR, name);
      fs.mkdirSync(dir, { recursive: true });
      const files = {};
      // 1) 插件源码（lib/ 全部 ✓ 这是"能不能跑"的核心 ✓）
      const libDir = path.join(__dirname);
      for (const f of fs.readdirSync(libDir)) {
        if (!/\.(cjs|js|html)$/.test(f)) continue;
        fs.copyFileSync(path.join(libDir, f), path.join(dir, 'lib__' + f));
        files['lib/' + f] = fs.statSync(path.join(libDir, f)).size;
      }
      // 2) 关键状态文件（设置/模式/暂停/中断/基线 ✓）
      const stateFiles = { SETTINGS: path.join(WORKDIR, '.dsh-heartbeat-settings.json'), MODE: MODE_FILE, PAUSE: path.join(WORKDIR, '.dsh-pause.json'), INTERRUPT: INTERRUPT_FILE, DAYSTART: DAYSTART_FILE, LASTSAVE: LASTSAVE_FILE };
      for (const k of Object.keys(stateFiles)) {
        try { fs.copyFileSync(stateFiles[k], path.join(dir, 'state__' + k)); files['state/' + k] = fs.statSync(stateFiles[k]).size; } catch {}
      }
      const manifest = { at: Date.now(), bj: bj, name: name, reason: String(reason || 'manual'), by: String(by || 'manual').slice(0, 30),
        official: OFFICIAL_VERSION, author: AUTHOR, files: files,
        versions: { page: PAGE_VERSION, pkg: OFFICIAL_VERSION } };
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
      // ★保留策略：只留最近 BACKUP_KEEP 份（默认 20 ✓ 本机磁盘常年 97% 满 ✓）
      try {
        const BACKUP_KEEP = 20;
        const all = fs.readdirSync(BACKUP_DIR).sort();
        while (all.length > BACKUP_KEEP) {
          const old = all.shift();
          try { fs.rmSync(path.join(BACKUP_DIR, old), { recursive: true, force: true }); } catch (e) {}
        }
      } catch (e) {}
      return { ok: true, name: name, dir: dir, files: Object.keys(files).length, manifest: manifest };
    } catch (e) { return { ok: false, error: String(e) }; }
  }
  // ── ★每日自动备份：当天没备过就自动备一份（防"忘了备份就改" ✓ 幂等 ✓）──
  function autoBackupIfDue() {
    try {
      const todayBJ = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
      const list = backupList(30);
      const done = list.some((b) => b && b.bj && String(b.bj).slice(0, 10) === todayBJ && String(b.reason || '').indexOf('auto') === 0);
      if (done) return { ok: true, skipped: true, reason: '今天已经自动备份过 ✓' };
      return Object.assign({ auto: true }, backupNow('auto-daily-' + todayBJ, 'auto'));
    } catch (e) { return { ok: false, error: String(e) }; }
  }
  function backupList(n) {
    try {
      return fs.readdirSync(BACKUP_DIR).filter((d) => { try { return fs.statSync(path.join(BACKUP_DIR, d)).isDirectory(); } catch { return false; } })
        .sort().reverse().slice(0, n || 20).map((d) => {
          let m = null; try { m = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, d, 'manifest.json'), 'utf8')); } catch {}
          return { name: d, at: m ? m.at : null, bj: m ? m.bj : null, reason: m ? m.reason : '?', by: m ? m.by : '?', files: m ? Object.keys(m.files || {}).length : 0 };
        });
    } catch { return []; }
  }
  function backupRestore(name) {
    try {
      const dir = path.join(BACKUP_DIR, String(name));
      const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      const restored = [];
      // 回档前先自动再备份一次"回档前状态"（双保险 ✓）
      backupNow('pre-restore', 'auto');
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith('lib__')) {
          const target = path.join(__dirname, f.slice(5));
          fs.copyFileSync(path.join(dir, f), target); restored.push('lib/' + f.slice(5));
        }
      }
      const map = { SETTINGS: path.join(WORKDIR, '.dsh-heartbeat-settings.json'), MODE: MODE_FILE, PAUSE: path.join(WORKDIR, '.dsh-pause.json'), INTERRUPT: INTERRUPT_FILE, DAYSTART: DAYSTART_FILE, LASTSAVE: LASTSAVE_FILE };
      for (const f of fs.readdirSync(dir)) {
        if (!f.startsWith('state__')) continue;
        const k = f.slice(7); if (map[k]) { try { fs.copyFileSync(path.join(dir, f), map[k]); restored.push('state/' + k); } catch {} }
      }
      return { ok: true, name: name, restored: restored, manifest: man };
    } catch (e) { return { ok: false, error: String(e) }; }
  }
  // ── ★操作监听（只读）：记录"谁在页面上动了什么"（只记开关/按钮名 + 开关状态，不记输入框内容 ✓）──
  function noteUI(kind, name, val, by) {
    try {
      if (settings().uiMonitor === false) return { ok: true, skipped: '监听已关闭' };   // 用户关掉 ⇒ 不记 ✓
      const rec = { at: Date.now(), bj: new Date(Date.now() + 8 * 3600e3).toISOString().replace('T', ' ').slice(0, 19),
                    kind: String(kind || '').slice(0, 12), name: String(name || '').slice(0, 40),
                    val: String(val == null ? '' : val).slice(0, 40), by: String(by || 'self').slice(0, 20), ip: '' };
      fs.appendFileSync(UI_FILE, JSON.stringify(rec) + '\n');
      try {   // 只留最近 500 条（省空间 ✓）
        const all = fs.readFileSync(UI_FILE, 'utf8').split('\n').filter(Boolean);
        if (all.length > 500) fs.writeFileSync(UI_FILE, all.slice(-500).join('\n') + '\n');
      } catch (e) {}
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e) }; }
  }
  function uiLog(n) {
    try { return fs.readFileSync(UI_FILE, 'utf8').split('\n').filter(Boolean).slice(-(n || 50)).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }
    catch { return []; }
  }
  // ── ★每日心流日报（用户要求 ✓ 自带零依赖 ✓）：统计昨日花费/步数/手机操作/峰谷占比 ──
  // ── ★时钟接口（正式 ✓ 不是临时开关）：本机宿主时钟不准时，用它把"按天"逻辑校准到真实时间 ──
  //   设计：① 默认 offsetMin=0（完全透明，谁都不受影响 ✓）
  //         ② 范围 ±1440 分钟（±24 小时 ✓ 超出拒绝 ✓ 防手滑）
  //         ③ 可用参考时间反算：告诉它"现在真实是几点"，它算出该偏移多少 ✓（自包含、不依赖网络 ✓）
  function clockInfo() {
    const off = clockOffsetMs();
    const raw = Date.now();
    const now = raw + off;
    return { ok: true,
      offsetMin: Math.round(off / 60000),
      rawUtc: new Date(raw).toISOString().slice(0, 19).replace('T', ' '),
      nowUtc: new Date(now).toISOString().slice(0, 19).replace('T', ' '),
      nowBj: new Date(now + 8 * 3600e3).toISOString().slice(0, 19).replace('T', ' '),
      bjDate: new Date(now + 8 * 3600e3).toISOString().slice(0, 10),
      transparent: off === 0,
      file: CLOCK_FILE };
  }
  function setClockFromRef(refStr) {   // 参考时间（北京时间 "YYYY-MM-DD HH:MM[:SS]"）⇒ 反算偏移
    try {
      const m = String(refStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
      if (!m) return { ok: false, error: '参考时间格式应为 北京时间 YYYY-MM-DD HH:MM[:SS]' };
      const wantUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5], +(m[6] || 0));   // 北京 ⇒ UTC
      const off = wantUtc - Date.now();
      if (!(Math.abs(off) <= 86400000)) return { ok: false, error: '算出的偏移超过 ±24 小时，拒绝（请核对参考时间）' };
      const r = setClockOffsetMin(Math.round(off / 60000));
      return Object.assign(r, clockInfo(), { fromRef: refStr });
    } catch (e) { return { ok: false, error: String(e) }; }
  }
  function mkdirpIfNeeded() { try { if (!fs.existsSync(WORKDIR)) fs.mkdirSync(WORKDIR, { recursive: true }); } catch (e) {} }
  function clockOffsetMs() { try { const j = JSON.parse(fs.readFileSync(CLOCK_FILE, 'utf8')); const v = Number(j.offsetMin); return Number.isFinite(v) ? v * 60000 : 0; } catch { return 0; } }
  function nowMs() { return Date.now() + clockOffsetMs(); }        // ★统一时间源：按天/日期键全走它 ✓
  function setClockOffsetMin(min) { const v0 = Number(min) || 0; if (!(Math.abs(v0) <= 1440)) return { ok: false, error: '偏移需在 ±1440 分钟（±24 小时）内' }; try { mkdirpIfNeeded(); fs.writeFileSync(CLOCK_FILE, JSON.stringify({ offsetMin: v0, at: Date.now() }, null, 1) + String.fromCharCode(10)); return { ok: true, offsetMin: Number(min) || 0 }; } catch (e) { return { ok: false, error: String(e) }; } }
  function bjDay(offset) { return new Date(nowMs() + 8 * 3600e3 - (offset || 0) * 86400000).toISOString().slice(0, 10); }
  // ── ★预算门（纯本地算术 ✓ 零 API 调用 ⇒ 不烧 token ✓ 默认关）
  // ── ★设置导出/导入（C-b ✓ 便携：别人一键搬配置 ✓ 只认已知键 ⇒ 防注入垃圾 ✗）
  function exportSettings() {
    try { return { ok: true, version: 1, at: Date.now(), app: 'dsh-heartbeat', settings: settings() }; } catch (e) { return { ok: false, error: String(e) }; }
  }
  function importSettings(json) {
    try {
      const j = (typeof json === 'string') ? JSON.parse(json) : json;
      const src = (j && j.settings) ? j.settings : j;
      if (!src || typeof src !== 'object') return { ok: false, error: '导入内容不是设置对象' };
      const known = Object.keys(DEFAULT_SETTINGS), patch = {}, ignored = [];
      for (const k of Object.keys(src)) { if (known.indexOf(k) >= 0) patch[k] = src[k]; else ignored.push(k); }
      if (!Object.keys(patch).length) return { ok: false, error: '没有可导入的已知设置键', ignored: ignored };
      const r = saveSettings(patch);
      return Object.assign(r, { imported: Object.keys(patch), ignored: ignored });
    } catch (e) { return { ok: false, error: String(e) }; }
  }
  function budgetCheck(est, kind) {
    try {
      if (settings().showBudgetGuard !== true) return { ok: true, enabled: false, note: '预算门未开启（默认关 ✓）' };
      const g = (() => { try { return JSON.parse(fs.readFileSync(path.join(WORKDIR, '.dsh-heartbeat-guard.json'), 'utf8')); } catch { return {}; } })();
      const bal = Number(g.balance || 0);
      const e = Number(est || 0);
      const pct = bal > 0 ? e / bal : 1;
      const level = pct >= 1 ? 'deny' : (pct >= 0.2 ? 'warn' : 'ok');
      return { ok: level !== 'deny', enabled: true, balance: bal, est: e, ratio: Number(pct.toFixed(3)), level: level,
               kind: String(kind || '').slice(0, 24),
               advice: level === 'deny' ? '预计花费超过余额 ⇒ 建议先充值或缩小任务 ✗' : (level === 'warn' ? '预计花费超过余额 20% ⇒ 建议先问用户 ✓' : '预计花费占余额比例正常 ✓') };
    } catch (e) { return { ok: false, error: String(e) }; }
  }
  // ── ★回放（纯本地拼装 ✓ 零 API ✓ 默认关）：把"花费 + 手机操控 + 步骤"合成一条时间线
  function replayData(n) {
    try {
      if (settings().showReplay !== true) return { ok: true, enabled: false, note: '回放未开启（默认关 ✓）' };
      const items = [];
      try { (JSON.parse(fs.readFileSync(COST_HISTORY_FILE, 'utf8')).week || []).forEach((d) => items.push({ at: d.date + 'T23:59:59', kind: 'cost', text: '花费 ¥' + (d.cost || 0).toFixed(2) })); } catch {}
      try { phoneLog(n || 50).forEach((r) => items.push({ at: new Date(r.at).toISOString(), kind: 'phone', text: '[手机] ' + (r.cmd || '') + ' ' + (r.args || '') })); } catch {}
      try { (JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) || []).forEach((r) => items.push({ at: new Date(r.at).toISOString(), kind: 'step', text: '▶ ' + (r.step || '') })); } catch {}
      items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
      return { ok: true, enabled: true, count: items.length, items: items.slice(0, n || 50) };
    } catch (e) { return { ok: false, error: String(e) }; }
  }
  function dailyReport(force) {
    try {
      const day = bjDay(1);                                   // 昨天
      let cache = null; try { cache = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8')); } catch {}
      if (!force && cache && cache.day === day) return cache;  // 当天已生成 ⇒ 直接给 ✓
      let cost = null, tokens = 0;
      try { const ch = JSON.parse(fs.readFileSync(COST_HISTORY_FILE, 'utf8')); (ch.week || []).forEach((d) => { if (d.date === day) { cost = d.cost; tokens = d.tokens || 0; } }); } catch {}
      let phoneOps = 0, steps = 0;
      try { phoneLog(500).forEach((r) => { if (bjDay(0) !== new Date(r.at + 8 * 3600e3).toISOString().slice(0, 10) && new Date(r.at + 8 * 3600e3).toISOString().slice(0, 10) === day) phoneOps++; }); } catch {}
      try { const h = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); (Array.isArray(h) ? h : (h.items || [])).forEach((r) => { if (new Date(r.at + 8 * 3600e3).toISOString().slice(0, 10) === day) steps++; }); } catch {}
      const rep = { day: day, at: Date.now(), cost: cost, tokens: tokens, phoneOps: phoneOps, steps: steps,
                    balance: null, badges: [] };
      try { const g = JSON.parse(fs.readFileSync(path.join(WORKDIR, '.dsh-heartbeat-guard.json'), 'utf8')); rep.balance = g.balance; } catch {}
      rep.badges = badgesOf(rep);
      try { fs.writeFileSync(REPORT_FILE, JSON.stringify(rep) + '\n'); } catch {}
      return rep;
    } catch (e) { return null; }
  }
  function reportLine(r) {
    if (!r || r.cost == null) return '';
    return '📊 昨日心流：¥' + (Number(r.cost) || 0).toFixed(2) + ' · ' + (r.steps || 0) + ' 步 · ' + (r.phoneOps || 0) + ' 次手机操作' + (r.badges && r.badges.length ? (' · 徽章 ' + r.badges.length) : '');
  }
  // ── ★心流徽章（用户要求 ✓ 全部本地判定，不依赖任何其它插件 ✓）──
  function badgeAll() {
    const out = {}; try { const j = JSON.parse(fs.readFileSync(BADGE_FILE, 'utf8')); return j.earned || {}; } catch { return {}; }
  }
  function badgeSave(o) { try { fs.writeFileSync(BADGE_FILE, JSON.stringify({ earned: o }, null, 1) + '\n'); } catch {} }
  function badgeAllList() { try { return Object.keys(badgeAll()); } catch (e) { return []; } }
  function refreshFlow() {   // ★开窗/手动触发：重算日报+徽章（写盘一次 ✓ 不在 tick 里做 ✓）
    try { const rep = dailyReport(true); const bs = badgesOf(rep); return { ok: true, report: rep, badges: bs }; } catch (e) { return { ok: false, error: String(e) }; }
  }
  function badgesOf(rep) {
    const got = [];
    try {
      const guard = (() => { try { return JSON.parse(fs.readFileSync(path.join(WORKDIR, '.dsh-heartbeat-guard.json'), 'utf8')); } catch { return {}; } })();
      const todayCost = Number((guard && guard.dailyCost) || 0);
      const hist = phoneLog(200).length;
      const bal = Number((guard && guard.balance) || 0);
      const earned = badgeAll();
      const give = (name, cond, emoji) => { if (!cond) return; if (!earned[name]) { earned[name] = Date.now(); badgeSave(earned); } got.push((emoji || '') + name); };
      give('零事故', (fetchErrors(50).filter((e) => bjDay(0) === new Date(e.at + 8 * 3600e3).toISOString().slice(0, 10)).length === 0), '🛡');
      give('手机操盘手', hist >= 50, '📱');
      give('有备无患', backupList(50).filter((b) => String(b.bj || '').slice(0, 10) === bjDay(1)).length >= 3, '💾');
      give('小步快跑', todayCost > 0 && todayCost < 5, '🐾');
      give('余额卫士', bal >= 5, '💰');
      if (!got.length) { const all = Object.keys(earned); if (all.length) got.push('已获 ' + all.length + ' 枚'); }
    } catch (e) {}
    return got;
  }
  function listDumps(n) {
    try { return fs.readdirSync(DUMP_DIR).filter((f) => /\.json$/.test(f)).sort().slice(-(n || 20)).reverse().map((f) => path.join(DUMP_DIR, f)); }
    catch { return []; }
  }
  // 篡改检测：widget.js 里必须留着作者标记，删了就在界面上暴露
  function tampered() {
    try {
      const w = fs.readFileSync(path.join(__dirname, 'widget.js'), 'utf8');
      return !w.includes(AUTHOR);
    } catch { return false; }
  }
  // ── 官改 / 自改 判定：验证 lib/.dshhe-art.json 里的 ES256 凭据 ──
  //   凭据由作者私钥签发（私钥只存作者工作区），别人改了挂件 ⇒ 版本变了 ⇒ 凭据对不上 ⇒ 判为自改
  function officialBuild() {
    try {
      const a = artInfo();
      const cred = a.officialCredential;
      if (!cred || !cred.payload || !cred.signature) return { official: false, reason: '没有官方凭据' };
      const pub = require('node:crypto').createPublicKey({ key: OFFICIAL_PUB_JWK, format: 'jwk' });
      const ok = require('node:crypto').verify('sha256', Buffer.from(cred.payload), {
        key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(cred.signature, 'base64url'));
      if (!ok) return { official: false, reason: '凭据签名无效' };
      const p = JSON.parse(Buffer.from(cred.payload, 'base64url').toString('utf8'));
      const w = fs.readFileSync(path.join(__dirname, 'widget.js'), 'utf8');
      const cur = Number((w.match(/SELF_VER = (\d+)/) || [])[1] || 0);
      if (p.widgetVer !== cur) return { official: false, reason: '挂件被改过（SELF_VER ' + cur + ' ≠ 官方 ' + p.widgetVer + '）', signedFor: p.widgetVer };
      if (p.version !== OFFICIAL_VERSION) return { official: false, reason: '版本号被改过', signedFor: p.version };
      if (!w.includes(AUTHOR)) return { official: false, reason: '作者标记被移除' };
      return { official: true, by: p.author, version: p.version, widgetVer: p.widgetVer, issuedAt: p.issuedAt };
    } catch (e) { return { official: false, reason: String(e && e.message || e) }; }
  }
  function authorship() {
    const rec = localRevRec();
    return { author: AUTHOR, official: OFFICIAL_VERSION, localRev: Number(rec.localRev) || 0,
             isOfficial: Number(rec.widgetVer) === Number((artInfo().officialWidgetVer) || 0) || !Number(rec.widgetVer),
             version: OFFICIAL_VERSION + '（' + (Number(rec.localRev) || 0) + '）', tampered: tampered() };
  }
  // ── 挂件重启信号（AI 用 POST /api/heartbeat/restart 递增；前端看到变化就重启挂件）──
  function widgetRev() { try { return JSON.parse(fs.readFileSync(WIDGET_REV_FILE, 'utf8')).rev || 0; } catch { return 0; } }
  function bumpWidgetRev() {
    const rev = widgetRev() + 1;
    try { fs.writeFileSync(WIDGET_REV_FILE, JSON.stringify({ rev, at: Date.now() }) + '\n'); } catch {}
    return { ok: true, rev };
  }
  function saveDoctor(q) {
    try { fs.writeFileSync(DOCTOR_FILE, JSON.stringify({ at: Date.now(), query: String(q || '').slice(0, 1200) }) + '\n'); return { ok: true }; } catch (e) { return { ok: false, error: String(e) }; }
  }
  function readDoctor() { try { return JSON.parse(fs.readFileSync(DOCTOR_FILE, 'utf8')); } catch { return null; } }
  // ── 手机操控日志（哨兵逐条 append 到这个 jsonl）──
  function phoneLog(limit) {
    try {
      const lines = fs.readFileSync(PHONE_LOG_FILE, 'utf8').split('\n');
      const out = [];
      for (let i = lines.length - 1; i >= 0 && out.length < (limit || 12); i--) {
        const ln = lines[i].trim(); if (!ln) continue;
        try { const j = JSON.parse(ln); if (j && j.at) out.push({ at: j.at, cmd: String(j.cmd || ''), args: String(j.args || '').slice(0, 60) }); } catch {}
      }
      return out;
    } catch { return []; }
  }
  // ── 心跳时间线（进度文本一变就记一条，最多 40 条）──
  function progressHistory(p) {
    let rec = { last: null, items: [] };
    try { const j = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); if (j && Array.isArray(j.items)) rec = j; } catch {}
    const key = String(p.step || '') + '|' + String(p.at || 0);
    if (p.step && key !== rec.last) {
      rec.items = [...(rec.items || []), { at: p.at || Date.now(), step: String(p.step).slice(0, 90) }].slice(-40);
      rec.last = key;
      try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(rec) + '\n'); } catch {}
    }
    return (rec.items || []).slice(-12).reverse();
  }
  // ── 每日花费（积累成历史，画 7 天柱状图 + 月度累计）──
  function costHistory(cum) {
    const BJ = 8 * 3600 * 1000;
    const todayKey = new Date(Date.now() + BJ).toISOString().slice(0, 10);
    let days = {};
    try { const j = JSON.parse(fs.readFileSync(COST_HISTORY_FILE, 'utf8')); if (j && j.days) days = j.days; } catch {}
    if (cum && cum.today) {
      const prev = days[todayKey] || {};
      const cost = Math.round((cum.today.cost || 0) * 10000) / 10000;
      if (prev.cost !== cost || !prev.at || Date.now() - prev.at > 60000) days[todayKey] = { cost, tokens: cum.today.tokens || 0, at: Date.now() };
    }
    const keys = Object.keys(days).sort();
    if (keys.length > 60) { const keep = {}; keys.slice(-60).forEach((k) => { keep[k] = days[k]; }); days = keep; }
    try { fs.writeFileSync(COST_HISTORY_FILE, JSON.stringify({ days }) + '\n'); } catch {}
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const k = new Date(Date.now() + BJ - i * 86400000).toISOString().slice(0, 10);
      week.push({ date: k, cost: (days[k] && days[k].cost) || 0 });
    }
    const ym = todayKey.slice(0, 7);
    let month = 0;
    for (const k of Object.keys(days)) if (k.slice(0, 7) === ym) month += Number(days[k].cost) || 0;
    return { week, month: Math.round(month * 100) / 100 };
  }
  function pauseState() {
    try {
      const j = JSON.parse(fs.readFileSync(PAUSE_FILE, 'utf8'));
      if (!j.on) return { on: false };
      const ageSec = Math.round((Date.now() - (j.at || 0)) / 1000);
      const limitMin = settings().pauseIdleMin;
      if (limitMin > 0 && ageSec > limitMin * 60) {
        // 暂停超时 → 自动转回空闲（顺手清掉暂停，避免界面显示空闲但 hb 仍拦着）
        try { fs.writeFileSync(PAUSE_FILE, JSON.stringify({ on: false, at: Date.now(), autoCleared: true }) + '\n'); } catch {}
        return { on: false, autoCleared: true, ageSec };
      }
      return { on: true, ageSec, at: j.at || 0, note: String(j.note || '') };
    } catch { return { on: false }; }
  }
  function setPause(on, note) {
    try {
      if (on) fs.writeFileSync(PAUSE_FILE, JSON.stringify({ on: true, at: Date.now(), reason: '挂件按钮', note: String(note || '').slice(0, 60) }) + '\n');
      else fs.writeFileSync(PAUSE_FILE, JSON.stringify({ on: false, at: Date.now() }) + '\n');
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    return { ok: true, pause: pauseState() };
  }
  function bridgeToken() {
    for (const p of ['/run/dsh-phone/token', '/sdcard/dsh/.phone-token']) {
      try { const t = fs.readFileSync(p, 'utf8').trim(); if (t) return t; } catch {}
    }
    return '';
  }
  let bridge = { last: null, lastPollAt: 0, activityAt: 0, ok: null };
  async function pollBridge() {
    if (Date.now() - bridge.lastPollAt < 3000) return;
    bridge.lastPollAt = Date.now();
    const t = bridgeToken();
    if (!t) { bridge.ok = false; return; }
    try {
      const r = await fetch(PHONE_BRIDGE + '/status?token=' + encodeURIComponent(t), { signal: AbortSignal.timeout(1500) });
      const text = await r.text();
      const m = text.match(/已处理请求:\s*(\d+)/);
      if (!m) { bridge.ok = false; return; }
      const n = Number(m[1]);
      if (bridge.last !== null && n - bridge.last > 1) bridge.activityAt = Date.now();
      bridge.last = n; bridge.ok = true;
    } catch { bridge.ok = false; }
  }
  function phoneFlag() {
    const phoneTtlSec = settings().phoneTtlSec;
    try {
      const j = JSON.parse(fs.readFileSync(PHONE_HBP_FILE, 'utf8'));
      const age = Math.round((Date.now() - (j.at || 0)) / 1000);
      if (j.on && age <= 90) return { on: true, text: j.text || '', ageSec: age, src: 'hbp' };
    } catch {}
    try {
      const j = JSON.parse(fs.readFileSync(PHONE_OP_FILE, 'utf8'));
      const age = Math.round((Date.now() - (j.at || 0)) / 1000);
      if (age <= phoneTtlSec) return { on: true, text: 'phone ' + (j.args || j.cmd || ''), ageSec: age, src: 'auto' };
    } catch {}
    if (!sentinelStatus().installed) {
      const age = Math.round((Date.now() - bridge.activityAt) / 1000);
      if (bridge.activityAt && age <= phoneTtlSec) return { on: true, text: '手机活动（哨兵缺失，计数器探测）', ageSec: age, src: 'counter' };
    }
    return { on: false };
  }

  // ── 模式（串流 / 挂件 / 两者）──
  // 设置：模式 / 串流端口 / 余额阈值（存 ~/.dsh/heartbeat-settings.json）
  function settings() {
    let s = {};
    try { s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch {
      try { s = { mode: JSON.parse(fs.readFileSync(MODE_FILE, 'utf8')).mode }; } catch { s = {}; }
    }
    const out = Object.assign({}, DEFAULT_SETTINGS, s || {});
    if (!['stream', 'widget', 'both'].includes(out.mode)) out.mode = 'both';
    out.streamPort = (String(out.streamPort).trim().toLowerCase() === 'auto' ? 'auto' : (Number(out.streamPort) || 0));   // ★保留 auto（不再被强转成 0 ✗）
    out.orangeBelow = Number.isFinite(Number(out.orangeBelow)) ? Number(out.orangeBelow) : 10;
    out.redBelow = Number.isFinite(Number(out.redBelow)) ? Number(out.redBelow) : 5;
    // （旧钳制已移除：改为在界线校验里回落默认值 ✓）
    out.pauseIdleMin = Number.isFinite(Number(out.pauseIdleMin)) ? Math.max(0, Number(out.pauseIdleMin)) : 5;  // 0=永不自动转空闲
    out.balanceAlert = !(out.balanceAlert === false || out.balanceAlert === 0 || out.balanceAlert === '0' || out.balanceAlert === 'false');  // 余额提醒常驻，默认开
    out.criticalBelow = Number.isFinite(Number(out.criticalBelow)) ? Math.max(0, Number(out.criticalBelow)) : 1;   // 余额严重不足线，默认 1 元
    out.dailyCostAlert = Number.isFinite(Number(out.dailyCostAlert)) ? Math.max(0, Number(out.dailyCostAlert)) : 10;  // 今日花费提醒线，默认 10 元
    if (out.todayMode !== 'estimate') out.todayMode = 'actual';   // 今日已用口径：实际结算(默认) / 估值
    out.viz = !(out.viz === false || out.viz === 0 || out.viz === '0' || out.viz === 'false');   // 余额与消耗可视化，默认开
    out.idleGraceSec = Number.isFinite(Number(out.idleGraceSec)) && Number(out.idleGraceSec) >= 1 ? Math.min(600, Number(out.idleGraceSec)) : 15;  // 多久没动静算空闲
    out.phoneTtlSec = Number.isFinite(Number(out.phoneTtlSec)) && Number(out.phoneTtlSec) >= 1 ? Math.min(600, Number(out.phoneTtlSec)) : 8;        // 手机操控横幅保留多久
    out.flashEveryMin = Number.isFinite(Number(out.flashEveryMin)) && Number(out.flashEveryMin) >= 1 ? Math.min(1440, Number(out.flashEveryMin)) : 10;  // 橙区闪烁间隔（分钟）
    out.flashRedMin = Number.isFinite(Number(out.flashRedMin)) && Number(out.flashRedMin) >= 1 ? Math.min(1440, Number(out.flashRedMin)) : 3;        // 红区闪烁间隔（分钟，默认更急）
    out.eggInteractive = !(out.eggInteractive === false || out.eggInteractive === 0 || out.eggInteractive === '0' || out.eggInteractive === 'false');   // 运转互动（长按彩蛋），默认开
    out.ctxBar = !(out.ctxBar === false || out.ctxBar === 0 || out.ctxBar === '0' || out.ctxBar === 'false');                                       // 上下文进度条，默认开
    return out;
  }
  // ── 设置差异（用户要求：保存前校验，相同就不保存 ✓ 防 bug）──
  function settingsDiff(patch) {
    const cur = settings();
    const changed = [];
    for (const k of Object.keys(patch || {})) {
      const a = patch[k], b = cur[k];
      let same;
      if (typeof a === 'boolean' || typeof b === 'boolean') same = !!a === !!b;
      else if (typeof a === 'number' || typeof b === 'number') same = Number(a) === Number(b);
      else same = String(a == null ? '' : a) === String(b == null ? '' : b);
      if (!same) changed.push(k);
    }
    return changed;
  }
  function saveSettings(patch) {
    // ★BOOL_NORM_IN_CORE：凡默认值是布尔的键，一律强制归一（'0'/'false'/'off'/空 ⇒ 关 ✓）
    //   之前只在 HTTP 路由里归一 ⇒ core 被直接调用时会把 "0" 存成字符串 ⇒ 被判成"开" ✗
    try {
      for (const k of Object.keys(DEFAULT_SETTINGS)) {
        if (typeof DEFAULT_SETTINGS[k] !== 'boolean') continue;
        if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
        const v = patch[k];
        patch[k] = !(v === false || v === 0 || v === '0' || v === 'false' || v === 'off' || v === '' || v === null || v === undefined);
      }
    } catch (e) {}
    // ★写入监控：记下时间 + 差异 + 调用栈（用于抓"神秘改设置"的元凶 ✓）
    try {
      const __d = settingsDiff(patch);
      if (__d.length) {
        const st = String(new Error().stack || '').split('\n').slice(1, 6).map((x) => x.trim()).join(' <- ');
        const rec = { at: Date.now(), bj: new Date(Date.now() + 8 * 3600e3).toISOString().replace('T', ' ').slice(0, 19), changed: __d, patch: patch, stack: st };
        fs.appendFileSync(WRITES_LOG, JSON.stringify(rec) + '\n');
      }
    } catch (e) {}
    // ★幂等：与当前值完全一致 ⇒ 直接跳过保存（等同没改 ✓ 防止脏数据回灌 ✗）
    try {
      const __diff = settingsDiff(patch);
      if (patch && Object.keys(patch).length && !__diff.length) {
        return Object.assign({}, settings(), { ok: true, skipped: true, changed: 0, changedKeys: [] });
      }
      saveSettings.__changed = __diff;
    } catch (e) {}
    // monthBudget 清洗（1.3.0）：非数字/负数/超大值都别进库，免得前端算歪
    // 界线校验（用户要求）：**不再静默改值** ✗ —— 不合理就把该项回落到【默认值】并记下错误 ✓
    saveSettings.__errors = [];
    if (patch && (Object.prototype.hasOwnProperty.call(patch,'redBelow') || Object.prototype.hasOwnProperty.call(patch,'orangeBelow'))) {
      const cur = settings();
      const d = DEFAULT_SETTINGS;
      const ob0 = Number(patch.orangeBelow != null ? patch.orangeBelow : cur.orangeBelow);
      const rb0 = Number(patch.redBelow != null ? patch.redBelow : cur.redBelow);
      if (!Number.isFinite(ob0) || ob0 <= 0) { patch.orangeBelow = d.orangeBelow; saveSettings.__errors.push('橙色阈值必须是大于 0 的数字（已回落默认 ' + d.orangeBelow + '）'); }
      if (!Number.isFinite(rb0) || rb0 < 0) { patch.redBelow = d.redBelow; saveSettings.__errors.push('红色阈值不能为负（已回落默认 ' + d.redBelow + '）'); }
      else {
        const ob1 = Number(patch.orangeBelow != null ? patch.orangeBelow : ob0);
        if (rb0 >= ob1) { patch.redBelow = d.redBelow; saveSettings.__errors.push('橙色阈值不得小于红色阈值（已把红色回落默认 ' + d.redBelow + '）'); }
      }
    }
    // posCheckMin 清洗（1~10 分钟）
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'posCheckMin')) {
      const pv = Number(patch.posCheckMin);
      patch.posCheckMin = Number.isFinite(pv) && pv >= 1 ? Math.min(Math.round(pv), 10) : 1;
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'monthBudget')) {
      const v = Number(patch.monthBudget);
      patch.monthBudget = Number.isFinite(v) && v >= 0 ? Math.min(v, 1e6) : 0;
    }
    const next = Object.assign(settings(), patch || {});
    if (patch && patch.mode !== undefined && !['stream', 'widget', 'both'].includes(patch.mode)) delete next.mode;
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2) + '\n');
    const __out = Object.assign({}, settings(), { ok: !(saveSettings.__errors || []).length, errors: saveSettings.__errors || [] });
    try {
      __out.skipped = false;
      __out.changed = (saveSettings.__changed || []).length;
      __out.changedKeys = saveSettings.__changed || [];
      fs.writeFileSync(LASTSAVE_FILE, JSON.stringify({ at: Date.now(), changedKeys: __out.changedKeys, settings: __out }) + String.fromCharCode(10));
    } catch (e) {}
    return __out;   // 返回「生效后」的值（经过校验与兜底），而不是未校验的合并结果
  }
  const mode = () => settings().mode;
  function setMode(m) {
    if (!['stream', 'widget', 'both'].includes(m)) return { ok: false, error: 'bad mode' };
    return { ok: true, settings: saveSettings({ mode: m }) };
  }
  // 端口工具：找空闲端口（从 3200 起往上扫，跳过 3099/3080 这两个已占用途）
  function findFreePort(start) {
    return new Promise((resolve) => {
      let port = Number(start) || 3200;
      const tryOne = () => {
        if (port > 3400) return resolve(0);
        const srv = net.createServer();
        srv.once('error', () => { port += 1; tryOne(); });
        srv.once('listening', () => srv.close(() => resolve(port)));
        srv.listen(port, '127.0.0.1');
      };
      tryOne();
    });
  }

  // ── 累计 tokens（尽力而为：本地插件接口）──
  let cumCache = { at: 0, data: null };
  async function cumulative() {
    if (Date.now() - cumCache.at < 5000 && cumCache.data) return cumCache.data;
    try {
      const r = await fetch(HARNESS + '/api/token-usage-stats', { signal: AbortSignal.timeout(1500) });
      const j = await r.json();
      const sid = currentSessionId();
      const mine = sid ? (j.topSessions || []).find((s) => s.id === sid) : null;
      const BJ = 8 * 3600 * 1000, todayKey = new Date(Date.now() + BJ).toISOString().slice(0, 10);
      let tReq = 0, tTok = 0, tCost = 0, tBuckets = 0;
      for (const b of (j.series || [])) {
        if (!b || !b.totals) continue;
        if (new Date(b.startTime + BJ).toISOString().slice(0, 10) !== todayKey) continue;
        tReq += Number(b.totals.requestCount) || 0;
        tTok += Number(b.totals.totalTokens) || 0;
        tCost += Number(b.totals.cost) || 0;
        tBuckets++;
      }
      // 没有小时桶数据时退回 totals（多数安装里 totals 就是今天）
      const today = tBuckets > 0
        ? { requests: tReq, tokens: tTok, cost: tCost, buckets: tBuckets, fromSeries: true }
        // ❌ 曾经的错误兜底：用 j.totals（那是**整个区间**的累计，会把 9/29 以来的 ¥40 当成"今日已用"）
        // ✅ 现在：今天的小时桶不可用时，先留空，稍后用「余额差 + 今日充值」这个可信来源回填
        : { requests: null, tokens: null, cost: null, buckets: 0, fromSeries: false, pending: true };
      // 今日峰值（最忙的那一小时）与平均每会话（topSessions 里今天动过的）
      let peak = 0, peakHour = null;
      for (const b of (j.series || [])) {
        if (!b || !b.totals) continue;
        if (new Date(b.startTime + BJ).toISOString().slice(0, 10) !== todayKey) continue;
        const bt = Number(b.totals.totalTokens) || 0;
        if (bt > peak) { peak = bt; peakHour = new Date(b.startTime + BJ).getUTCHours(); }
      }
      const sessToday = (j.topSessions || []).filter((s) => s && s.totals && s.lastTime && new Date(s.lastTime + BJ).toISOString().slice(0, 10) === todayKey);
      const sessTok = sessToday.reduce((a, s) => a + (Number(s.totals.totalTokens) || 0), 0);
      cumCache = { at: Date.now(), data: {
        today, todayPeak: peak || null, todayPeakHour: peakHour,
        sessionCount: sessToday.length, avgSession: sessToday.length ? Math.round(sessTok / sessToday.length) : null,
        requests: j.totals.requestCount, total: j.totals.totalTokens, cost: j.totals.cost,
        sessionCost: mine ? mine.totals.cost : null, sessionRequests: mine ? mine.totals.requestCount : null,
      } };
    } catch { cumCache = { at: Date.now(), data: cumCache.data }; }
    return cumCache.data;
  }

  const activity = { lastAt: STARTED, lastCount: null };
  async function state() {
    const now = Date.now();
    const book = await priceBook();
    await pollBridge();
    const pk = peakNow(now, book);
    const ctx = sessionCtx();
    let turn = null;
    if (ctx && ctx.last && ctx.last.buckets && pk.price) {
      const b = ctx.last.buckets, pr = pk.price;
      const cost = (b.uncachedInputTokens * pr.uncachedInputPerMillion
        + b.cacheReadTokens * pr.cacheReadPerMillion
        + (b.cacheWriteTokens || 0) * (pr.cacheWritePerMillion || 0)
        + b.outputTokens * pr.outputPerMillion) / 1e6;
      turn = noteTurn(ctx.last.turn, ctx.last.step, cost);
    }
    const cum = await cumulative();
    if (cum) {
      const c = cum.requests;
      if (activity.lastCount === null) activity.lastCount = c;
      else if (c !== activity.lastCount) { activity.lastCount = c; activity.lastAt = Date.now(); }
    }
    const p = progress();
    const graceMs = settings().idleGraceSec * 1000;
    const busyLeftSec = Math.max(0, Math.round((p.at + p.busyMs - now) / 1000));
    const lastAt = Math.max(p.at || 0, activity.lastAt);
    // 显式结束信号（bash hb done）优先：我干完了就是干完了，
    // 不再让「token 活动探测」把我继续算作工作中（用量库有延迟，会多显示几分钟）。
    const ended = !!p.ended;
    const working = ended ? false : ((now - lastAt <= graceMs) || (p.at + p.busyMs > now));
    const idleOnset = Math.max((p.at || 0) + graceMs, p.at + p.busyMs, activity.lastAt + graceMs);
    const bal = await balance();
    const cfg = settings();
    // 今日：实际（用量库小时桶）/ 估值（实际 + 正在进行这一轮）/ 原有（当天首次读到的余额）
    const todayAct = (cum && cum.today) ? cum.today : null;
    const inflight = (turn && turn.lastStepCost) ? turn.lastStepCost : 0;
    const todayEst = todayAct ? { requests: todayAct.requests, tokens: todayAct.tokens, cost: todayAct.cost + inflight, inflight: inflight } : null;
    const todayOut = cfg.todayMode === 'estimate' ? (todayEst || todayAct) : (todayAct || todayEst);
    const dsRec = dayStart(bal);
    // 今日已充值（**估算**）：余额本该只减不增 —— 两次读数之间，
    //   期望下降 = 期间消耗；实际下降 = 余额差；两者一减为正 ⇒ 余额多出来了 ⇒ 判为一次充值。
    // 用增量法可以准确累计多次充值，也不依赖"今日原有"是否记得准。
    const todayBJ = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const usedNow = todayOut ? todayOut.cost : 0;
    let tp = { date: todayBJ, topup: 0, raw: 0, lastBalance: null, lastUsed: null, at: 0 };
    let tpFresh = true;
    try { const r = JSON.parse(fs.readFileSync(TOPUP_FILE, 'utf8')); if (r && r.date === todayBJ) { tp = Object.assign(tp, r); tpFresh = false; } } catch {}
    if (!tpFresh && bal && tp.lastBalance != null && tp.lastUsed != null) {
      const expectDrop = tp.lastUsed - usedNow;          // 期间消耗
      const realDrop = tp.lastBalance - bal.total;       // 余额实际变化
      const excess = expectDrop - realDrop;              // >0 ⇒ 多出来的钱 = 充值
      // 有符号累加：用量库有延迟时会先给"负偏差"，等它补上再抵消，避免数字虚高
      tp.raw = Math.round(((tp.raw || 0) + excess) * 100) / 100;
      tp.topup = Math.max(0, tp.raw);
    }
    if (bal) { tp.lastBalance = bal.total; tp.lastUsed = usedNow; }
    // ★ 今日已用回填：小时桶不可信/不可用时，用「当日基线 + 今日充值 − 当前余额」这个可信来源
    if (todayOut && (todayOut.pending || todayOut.cost == null) && usedNow != null) {
      todayOut = { requests: todayOut.requests, tokens: todayOut.tokens, cost: usedNow, buckets: 0, fromSeries: false, source: 'balance' };
    }
    tp.at = Date.now();
    try { fs.writeFileSync(TOPUP_FILE, JSON.stringify(tp) + '\n'); } catch {}
    const todayTopup = tp.topup;
    let guard = { level: 'ok' };
    if (bal) {
      const lvl = bal.total < cfg.redBelow ? 'red' : bal.total < cfg.orangeBelow ? 'orange' : 'ok';
      const crit = bal.total < cfg.criticalBelow;
      guard = { level: lvl, balance: bal.total, orangeBelow: cfg.orangeBelow, redBelow: cfg.redBelow,
                dailyCost: (todayOut ? todayOut.cost : null), dailyTokens: (todayOut ? todayOut.tokens : null), dailyCostAlert: cfg.dailyCostAlert, todayMode: cfg.todayMode,
                criticalBelow: cfg.criticalBelow, critical: crit, at: now };
      // 峰谷（给 hb 的"省一半"提醒读）
      guard.peak = pk.peak; guard.nextInSec = pk.nextInSec; guard.nextPeak = pk.nextPeak; guard.showPeak = cfg.showPeak !== false;
      if (crit) guard.level = 'critical';   // 严重不足是比 red 更高的级别
      try { fs.writeFileSync(GUARD_FILE, JSON.stringify(guard) + '\n'); } catch {}
    }
    const bj = new Date(now + BJ_MS);
    return {
      v: PAGE_VERSION,
      aliveSec: Math.round((now - STARTED) / 1000),
      balance: bal ? { currency: bal.currency, total: bal.total, at: bal.at, ageSec: Math.max(0, Math.round((Date.now() - bal.at) / 1000)) } : null,
      peak: pk, turn,
      step: p.step, progressAgoSec: p.agoSec, busyLeftSec, busyCapped: p.busyCapped,
      working, idleSec: Math.max(0, Math.round((now - idleOnset) / 1000)),
      cpuPct: cpuPct(), running: runningCmd(),
      rssMB: rssMB(), disk: disk(),
      ended: !!p.ended,
      tokens: cum, today: todayOut, todayActual: todayAct, todayEstimate: todayEst, dayStart: dsRec, todayTopup: todayTopup, ctx,
      todayPeak: cum ? cum.todayPeak : null, todayPeakHour: cum ? cum.todayPeakHour : null,
      sessionCount: cum ? cum.sessionCount : null, avgSession: cum ? cum.avgSession : null,
      phone: phoneFlag(), sentinel: sentinelStatus(), interrupt: interruptState(), pause: pauseState(),
      phoneLog: phoneLog(12), history: progressHistory(p), cost: costHistory(cum),
      widgetRev: widgetRev(),
      authorship: authorship(),
      inbox: inbox(20, false),
      inboxNew: inbox(20, true).length,
      focusPending: !!focusPending(),
      todo: todo(), ask: askState(), fetchErrors: fetchErrors(5),
      burnRate: burn(bal && bal.total, usedNow),
      dailyReport: dailyReport(), badges: (settings().showFlow ? badgeAllList() : null),
      sensitiveHit: sensitiveHit((phoneLog(3)[0] || {}).args ? JSON.stringify(phoneLog(3)[0].args) : ''),
      official: officialBuild(),
      mode: cfg.mode, settings: cfg, guard,
      sessionId: ctx ? ctx.sessionId : currentSessionId(),
      bjTime: bj.toISOString().slice(11, 19),
      bjDate: ['周日','周一','周二','周三','周四','周五','周六'][bj.getUTCDay()] + ' ' + bj.toISOString().slice(5, 10),
    };
  }

  return { state, mode, setMode, settings, saveSettings, findFreePort, setInterrupt, interruptState, pauseState, setPause, sentinelStatus, phoneFlag, PAGE_VERSION, bumpWidgetRev, saveDoctor, readDoctor, widgetRev, noteWidgetVer, authorship, saveDump, listDumps, artInfo, say, inbox, inboxDone, requestFocus, focusPending, focusClear,
 dailyReport, reportLine, badgesOf, badgeAll, backupNow, backupList, backupRestore, autoBackupIfDue, refreshFlow, exportSettings, importSettings, budgetCheck, replayData, badgeAllList, clockInfo, setClockFromRef, setClockOffsetMin, clockOffsetMs, nowMs, noteUI, uiLog, settingsDiff, setTodo, todo, ask, askState, answerAsk, askClear, noteFetchError, fetchErrors, burn, selfcheck, hoursCost, sensitiveHit, AUTHOR, OFFICIAL_VERSION, paths: { STATUS_FILE, MODE_FILE, INTERRUPT_FILE, TURN_FILE, DUMP_DIR, ART_FILE, INBOX_FILE, FOCUS_FILE } };
}

module.exports = { createCore, PAGE_VERSION };

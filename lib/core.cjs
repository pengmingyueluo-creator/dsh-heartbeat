// dsh-heartbeat 数据核心 —— 标准版（dsh-heartbeat.js）与插件版共用同一份，避免逻辑漂移。
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const PAGE_VERSION = 30;

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
  const MODE_FILE = path.join(DSH_HOME, 'heartbeat-mode.json');
  const SETTINGS_FILE = path.join(DSH_HOME, 'heartbeat-settings.json');
  const GUARD_FILE = path.join(DSH_HOME, 'heartbeat-guard.json');
  const DEFAULT_SETTINGS = { mode: 'both', streamPort: 0, orangeBelow: 10, redBelow: 5, pauseIdleMin: 5, balanceAlert: true, criticalBelow: 1, dailyCostAlert: 10, todayMode: 'actual', viz: true, idleGraceSec: 15, phoneTtlSec: 8, flashEveryMin: 10, flashRedMin: 3, eggInteractive: true, ctxBar: true };
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
    const peak = weekendOff && weekend ? false : intervals.some(({ start, end }) => minutes >= toMin(start) && minutes < toMin(end));
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
      peak, weekend, weekendOffpeak: weekendOff, bandPct: pct,
      nextInSec: next ? Math.round((next.t - now) / 1000) : null, nextPeak: next ? next.peak : null,
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
      return { on: true, ageSec, at: j.at || 0 };
    } catch { return { on: false }; }
  }
  function setPause(on) {
    try {
      if (on) fs.writeFileSync(PAUSE_FILE, JSON.stringify({ on: true, at: Date.now(), reason: '挂件按钮' }) + '\n');
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
    out.streamPort = Number.isFinite(Number(out.streamPort)) ? Number(out.streamPort) : 0;
    out.orangeBelow = Number.isFinite(Number(out.orangeBelow)) ? Number(out.orangeBelow) : 10;
    out.redBelow = Number.isFinite(Number(out.redBelow)) ? Number(out.redBelow) : 5;
    if (out.redBelow >= out.orangeBelow) out.redBelow = Math.max(0, out.orangeBelow - 1);
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
  function saveSettings(patch) {
    const next = Object.assign(settings(), patch || {});
    if (patch && patch.mode !== undefined && !['stream', 'widget', 'both'].includes(patch.mode)) delete next.mode;
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2) + '\n');
    return settings();   // 返回「生效后」的值（经过校验与兜底），而不是未校验的合并结果
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
        : { requests: j.totals.requestCount, tokens: j.totals.totalTokens, cost: j.totals.cost, buckets: 0, fromSeries: false };
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
      mode: cfg.mode, settings: cfg, guard,
      sessionId: ctx ? ctx.sessionId : currentSessionId(),
      bjTime: bj.toISOString().slice(11, 19),
      bjDate: ['周日','周一','周二','周三','周四','周五','周六'][bj.getUTCDay()] + ' ' + bj.toISOString().slice(5, 10),
    };
  }

  return { state, mode, setMode, settings, saveSettings, findFreePort, setInterrupt, interruptState, pauseState, setPause, sentinelStatus, phoneFlag, PAGE_VERSION, paths: { STATUS_FILE, MODE_FILE, INTERRUPT_FILE, TURN_FILE } };
}

module.exports = { createCore, PAGE_VERSION };

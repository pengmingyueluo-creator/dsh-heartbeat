// dsh-heartbeat —— 宿主半侧
//
// 路由（都挂在 DSH 自己的端口上，走 DSH 鉴权）：
//   GET  /heartbeat                 串流页（完整看板）
//   GET  /heartbeat/widget.js       页面挂件脚本（被 tapIndex 注入）
//   GET  /api/heartbeat/state       数据
//   GET/POST /api/heartbeat/settings 读/改设置（?mode=&streamPort=&orangeBelow=&redBelow=）
//   POST /api/heartbeat/interrupt   中断键（+ /interrupt/clear）
// 可选：设置里给了串流端口时，额外起一个 127.0.0.1 监听（自动跳过被占用的端口），
//       方便"适配别的终端/环境"——端口可设 0(跟随 DSH)、auto(自动找)、或具体数字。

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import core from './core.cjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = '/api/heartbeat';
// 所有设置键（必须与 core.cjs 的 DEFAULT_SETTINGS 一致）。
// 写请求判定要用它：以前只认 4 个键，导致「只改新设置」会被当成读请求、静默丢弃。
const SETTINGS_KEYS = ['mode', 'streamPort', 'orangeBelow', 'redBelow', 'pauseIdleMin', 'balanceAlert',
  'criticalBelow', 'dailyCostAlert', 'todayMode', 'viz', 'idleGraceSec', 'phoneTtlSec',
  'flashEveryMin', 'flashRedMin', 'eggInteractive', 'ctxBar', 'monthBudget',
  'showPeak', 'showPhoneLog', 'showTimeline', 'showPauseNote', 'showCost', 'showEcg', 'refreshSec', 'aiRead', 'uiMonitor', 'clockOffsetMin', 'showBudgetGuard', 'showReplay', 'sensitiveApps', 'quickBar', 'posCheck', 'posCheckMin'];
const isWriteQuery = (q) => SETTINGS_KEYS.some((k) => new RegExp('(^|&)' + k + '=').test(String(q || '').replace(/^\?/, '')));
const WORKDIR = process.env.DSH_HEARTBEAT_DIR || '';   // 空 = 由 core 按统一规则解析

const readAsset = (n) => { try { return fs.readFileSync(path.join(HERE, n), 'utf8'); } catch { return ''; } };

export default {
  name: 'heartbeat',
  apply(root) {
    const disposers = [];
    let extraServer = null;
    let extraPort = 0;
    root.effect(() => () => {
      for (const d of disposers) { try { d(); } catch { /* ignore */ } }
      if (extraServer) { try { extraServer.close(); } catch { /* ignore */ } }
    });

    root.inject(['webServer'], (ctx) => {
      const c = core.createCore({ ctx, workdir: WORKDIR || undefined });
      // 资源**每次请求现读**（带 mtime 缓存）：以后改 board.html / widget.js 不需要重启宿主
      const assetCache = new Map();
      const asset = (name) => {
        const p = path.join(HERE, name);
        try {
          const st = fs.statSync(p);
          const hit = assetCache.get(name);
          if (hit && hit.mtime === st.mtimeMs) return hit.body;
          const body = fs.readFileSync(p, 'utf8');
          assetCache.set(name, { mtime: st.mtimeMs, body });
          return body;
        } catch { return ''; }
      };
      const assetVer = (name) => { try { return Math.round(fs.statSync(path.join(HERE, name)).mtimeMs); } catch { return 0; } };
      const board = () => asset('board.html');
      const widget = () => asset('widget.js');
      const prelude = `<script>window.__HB_API=${JSON.stringify(API_BASE)};</script>`;

      const sendJson = (res, obj, code) => {
        res.writeHead(code || 200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify(obj));
      };
      const sendText = (res, body, type) => {
        res.writeHead(200, { 'content-type': type + '; charset=utf-8', 'cache-control': 'no-store' });
        res.end(body);
      };
      const stateWithPort = async () => {
        const st = await c.state();
        st.streamPortActual = extraPort;
        st.widgetVersion = assetVer('widget.js');   // 挂件用它自更新
        return st;
      };
      const widgetBody = () => 'window.__HB_WIDGET_VER=' + assetVer('widget.js') + ';\n' + asset('widget.js');
      const applySettings = (search) => {
        const u = new URL('http://x/?' + (search || '').replace(/^\?/, ''));
        const patch = {};
        const mode = u.searchParams.get('mode'); if (mode) patch.mode = mode;
        const sp = u.searchParams.get('streamPort'); if (sp !== null) patch.streamPort = sp === 'auto' ? 'auto' : Number(sp) || 0;
        const ob = u.searchParams.get('orangeBelow'); if (ob !== null) patch.orangeBelow = Number(ob);
        const rb = u.searchParams.get('redBelow'); if (rb !== null) patch.redBelow = Number(rb);
        const pi = u.searchParams.get('pauseIdleMin'); if (pi !== null) patch.pauseIdleMin = Number(pi);
        const ba = u.searchParams.get('balanceAlert'); if (ba !== null) patch.balanceAlert = !(ba === '0' || ba === 'false');
        const cb = u.searchParams.get('criticalBelow'); if (cb !== null) patch.criticalBelow = Number(cb);
        const dca = u.searchParams.get('dailyCostAlert'); if (dca !== null) patch.dailyCostAlert = Number(dca);
        const tm = u.searchParams.get('todayMode'); if (tm !== null) patch.todayMode = tm;
        const vz = u.searchParams.get('viz'); if (vz !== null) patch.viz = !(vz === '0' || vz === 'false');
        const ig = u.searchParams.get('idleGraceSec'); if (ig !== null) patch.idleGraceSec = Number(ig);
        const pt = u.searchParams.get('phoneTtlSec'); if (pt !== null) patch.phoneTtlSec = Number(pt);
        const fe = u.searchParams.get('flashEveryMin'); if (fe !== null) patch.flashEveryMin = Number(fe);
        const fr = u.searchParams.get('flashRedMin'); if (fr !== null) patch.flashRedMin = Number(fr);
        const eg = u.searchParams.get('eggInteractive'); if (eg !== null) patch.eggInteractive = !(eg === '0' || eg === 'false');
        const cbx = u.searchParams.get("ctxBar"); if (cbx !== null) patch.ctxBar = !(cbx === "0" || cbx === "false");
        const mbg = u.searchParams.get("monthBudget"); if (mbg !== null) patch.monthBudget = Number(mbg);
        // streamPort 校验：只接受 留空/0/auto/数字 ⇒ 非法则回落 0（跟随 DSH）✓
        if (Object.prototype.hasOwnProperty.call(patch, 'streamPort')) {
          const sv = String(patch.streamPort == null ? '' : patch.streamPort).trim();
          if (sv === '' || sv.toLowerCase() === 'auto') patch.streamPort = (sv === '' ? 0 : 'auto');
          else if (!isFinite(Number(sv))) { patch.streamPort = 0; saveSettings.__errors.push('串流端口只能是空、0、auto 或数字（已回落 0=跟随 DSH）'); }
          else patch.streamPort = Number(sv);
        }

        const pcm = u.searchParams.get("posCheckMin"); if (pcm !== null) patch.posCheckMin = Number(pcm);
        // 1.3.0 新功能开关（布尔）
        for (const bk of ["uiMonitor","showPeak","showPhoneLog","showTimeline","showPauseNote","showCost","showEcg","quickBar","posCheck"]) {   // [bool 修复] '0'/'false'/'off'/空 都算关 ✓
          if (Object.prototype.hasOwnProperty.call(patch, bk)) {
            const v = patch[bk];
            patch[bk] = !(v === false || v === 0 || v === '0' || v === 'false' || v === 'off' || v === '' || v === null);
          }
        }
        const next = c.saveSettings(patch);
        restartExtra(next);
        // ★每日自动备份（用户要求 ✓）：加载时检查一次 + 每小时检查一次，当天没备过才备 ✓

        try { const __ab = c.autoBackupIfDue(); if (__ab && __ab.auto) c.noteUI('auto','daily-backup',__ab.name||'','host'); } catch (e) {}

        try { const __t = setInterval(function () { try { const __a2 = c.autoBackupIfDue(); if (__a2 && __a2.auto) c.noteUI('auto','daily-backup',__a2.name||'','host'); } catch (e) {} }, 3600000); if (__t && __t.unref) __t.unref(); } catch (e) {}

        return { ok: true, settings: next, streamPortActual: extraPort };
      };
      // 额外的串流监听（可选）
      const attachExtra = (port) => {
        if (extraServer) { try { extraServer.close(); } catch { /* ignore */ } extraServer = null; }
        extraPort = 0;
        if (!port) return;
        const srv = http.createServer(async (req, res) => {
          const u = new URL(req.url, 'http://127.0.0.1');
          const p = u.pathname;
          try {
            if (p === '/' || p === '/heartbeat') return sendText(res, board().replace('<!--PRELUDE-->', prelude), 'text/html');
            if (p === '/heartbeat/widget.js') return sendText(res, widgetBody(), 'application/javascript');
            if (p === '/heartbeat/doctor.js') return sendText(res, asset('doctor.js'), 'application/javascript');
            if (p === API_BASE + '/doctor') return sendJson(res, c.saveDoctor(u.search.slice(1)));
            if (p === API_BASE + '/restart') return sendJson(res, c.bumpWidgetRev());
            if (p === API_BASE + '/snapshot') return sendJson(res, await snapOf());
            if (p === API_BASE + '/health') return sendJson(res, { ok: true, ts: Date.now() });
            if (p === API_BASE + '/log') return sendJson(res, { phoneLog: [], history: [] });
            if (p === API_BASE + '/state') return sendJson(res, await stateWithPort());
            if (p === API_BASE + '/settings') return isWriteQuery(u.search)
              ? sendJson(res, applySettings(u.search)) : sendJson(res, { settings: c.settings(), streamPortActual: extraPort });
            if (p === API_BASE + '/pause') return sendJson(res, c.setPause(true, u.searchParams.get('note') || ''));
            if (p === API_BASE + '/pause/clear') return sendJson(res, c.setPause(false));
            if (p === API_BASE + '/interrupt') return sendJson(res, c.setInterrupt(true));
            if (p === API_BASE + '/interrupt/clear') return sendJson(res, c.setInterrupt(false));
            res.writeHead(404); res.end('not found');
          } catch (err) { sendJson(res, { error: String(err && err.message || err) }, 500); }
        });
        srv.on('error', () => { extraPort = 0; });
        srv.listen(port, '127.0.0.1', () => { extraPort = port; ctx.logger && ctx.logger.info && ctx.logger.info('[heartbeat] 串流监听已开: http://127.0.0.1:' + port); });
        extraServer = srv;
        ctx.effect(() => () => { try { srv.close(); } catch { /* ignore */ } });
      };
      const restartExtra = (cfg) => {
        const want = cfg.streamPort;
        if (!want) { attachExtra(0); return; }
        const start = want === 'auto' ? 3200 : (Number(want) || 3200);
        c.findFreePort(start).then((port) => { if (port) attachExtra(port); }).catch(() => { extraPort = 0; });
      };

      const route = (p, handler) => {
        try { disposers.push(ctx.webServer.register({ kind: 'exact', path: p, handler })); }
        catch (err) { ctx.logger && ctx.logger.warn && ctx.logger.warn('[heartbeat] 注册 ' + p + ' 失败: ' + err.message); }
      };

      route('/heartbeat', (req, res) => sendText(res, board().replace('<!--PRELUDE-->', prelude), 'text/html'));
      route('/heartbeat/widget.js', (req, res) => sendText(res, widgetBody(), 'application/javascript'));
      route('/heartbeat/doctor.js', (req, res) => sendText(res, asset('doctor.js'), 'application/javascript'));
      route(API_BASE + '/doctor', (req, res) => {
        try { const q2 = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : ''; sendJson(res, c.saveDoctor(q2)); }
        catch (err) { sendJson(res, { error: String(err) }, 500); }
      });
      route(API_BASE + '/restart', (req, res) => sendJson(res, c.bumpWidgetRev()));
      const readBody = (req) => new Promise((resolve) => {
        let d = ''; req.on('data', (ck) => { d += ck; if (d.length > 300000) req.destroy(); });
        req.on('end', () => resolve(d)); req.on('error', () => resolve(''));
      });
      route(API_BASE + '/dump', async (req, res) => {
        try { const raw = await readBody(req); let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
              sendJson(res, c.saveDump(b)); } catch (err) { sendJson(res, { ok: false, error: String(err) }, 500); }
      });
      route(API_BASE + '/dumps', (req, res) => sendJson(res, { dir: (c.paths || {}).DUMP_DIR, files: c.listDumps(20), selfModified: !!(c.artInfo().modifyLog || []).length }));
      route(API_BASE + '/say', async (req, res) => {
        try {
          const u = new URL(req.url, 'http://127.0.0.1');
          let text = u.searchParams.get('text') || '';
          if (!text) { const raw = await readBody(req); try { text = (JSON.parse(raw || '{}').text) || ''; } catch (e) { text = raw || ''; } }
          sendJson(res, c.say(text, u.searchParams.get('from') || '小窗'));
        } catch (err) { sendJson(res, { ok: false, error: String(err) }, 500); }
      });
      route(API_BASE + '/focus', (req, res) => {
        try { const u = new URL(req.url, 'http://127.0.0.1'); sendJson(res, c.requestFocus(u.searchParams.get('by') || '串流页')); }
        catch (err) { sendJson(res, { ok: false, error: String(err) }, 500); }
      });
      route(API_BASE + '/focus/pending', (req, res) => sendJson(res, { pending: c.focusPending() }));
      route(API_BASE + '/focus/clear', (req, res) => sendJson(res, c.focusClear()));
      route(API_BASE + '/inbox', (req, res) => {
        try { const u = new URL(req.url, 'http://127.0.0.1'); sendJson(res, { newCount: c.inbox(50, true).length, items: c.inbox(50, false) }); }
        catch (err) { sendJson(res, { error: String(err) }, 500); }
      });
      route(API_BASE + '/inbox/done', (req, res) => {
        try { const u = new URL(req.url, 'http://127.0.0.1'); sendJson(res, c.inboxDone(u.searchParams.get('at'))); }
        catch (err) { sendJson(res, { error: String(err) }, 500); }
      });
      // ── 串流只读接口（供 AI 查询 ✓）──
      // ── agent 侧：发布当前计划 / 提问（用户要求 ✓）──
      route(API_BASE + '/todo', async (req, res) => {
        try {
          const u = new URL(req.url, 'http://127.0.0.1');
          let items = u.searchParams.get('items') || '';
          if (!items) { const raw = await readBody(req); try { const b = JSON.parse(raw || '{}'); items = b.items || b.text || ''; } catch (e) { items = raw || ''; } }
          sendJson(res, c.setTodo(items, u.searchParams.get('note') || ''));
        } catch (err) { sendJson(res, { ok: false, error: String(err) }, 500); }
      });
      route(API_BASE + '/ask', async (req, res) => {
        try {
          const u = new URL(req.url, 'http://127.0.0.1');
          let q = u.searchParams.get('q') || '';
          if (!q) { const raw = await readBody(req); try { q = (JSON.parse(raw || '{}').q) || ''; } catch (e) { q = raw || ''; } }
          const opts = (u.searchParams.get('opts') || '').split(',').map((x) => x.trim()).filter(Boolean);
          sendJson(res, c.ask(q, opts));
        } catch (err) { sendJson(res, { ok: false, error: String(err) }, 500); }
      });
      route(API_BASE + '/answer', async (req, res) => {
        try { const u = new URL(req.url, 'http://127.0.0.1'); sendJson(res, c.answerAsk(u.searchParams.get('text') || '', u.searchParams.get('by') || '小窗')); }
        catch (err) { sendJson(res, { ok: false, error: String(err) }, 500); }
      });
      route(API_BASE + '/ask/clear', (req, res) => sendJson(res, c.askClear()));
      // ── ★备份/回档（AI 改前必做 ✓ 出大事一键回档 ✓）──
      // ── 心流刷新（开窗/手动 ⇒ 重算日报+徽章 ✓ 只在需要时做 ✓）──
      // ── ★时钟接口（正式 ✓）：GET 读状态 · POST offsetMin=±N 直接设 · POST ref="北京时间" 反算 ──
      // ── 预算门 / 回放（纯本地 ✓ 默认关 ✓ 关着直接返回 enabled:false ⇒ 不产生任何开销 ✓）──
      // ── 设置导出/导入（C-b ✓ 便携）──
      route(API_BASE + '/settings/export', (req, res) => sendJson(res, c.exportSettings()));
      route(API_BASE + '/settings/import', async (req, res, url) => { const u2 = url || new URL(req.url, 'http://127.0.0.1'); const raw = u2.searchParams.get('json') || u2.searchParams.get('data'); sendJson(res, c.importSettings(raw || {})); });
      route(API_BASE + '/budget', async (req, res, url) => { const u2 = url || new URL(req.url, 'http://127.0.0.1'); sendJson(res, c.budgetCheck(u2.searchParams.get('est'), u2.searchParams.get('kind'))); });
      route(API_BASE + '/replay', async (req, res, url) => { const u2 = url || new URL(req.url, 'http://127.0.0.1'); sendJson(res, c.replayData(Number(u2.searchParams.get('n')) || 50)); });
      route(API_BASE + '/clock', async (req, res, url) => {
        const u2 = url || new URL(req.url, 'http://127.0.0.1');
        const method = String((req && req.method) || 'GET').toUpperCase();
        if (method === 'GET') return sendJson(res, c.clockInfo());
        const ref = u2.searchParams.get('ref');
        if (ref) return sendJson(res, c.setClockFromRef(ref));
        const off = u2.searchParams.get('offsetMin');
        if (off != null) { const r = c.setClockOffsetMin(Number(off)); return sendJson(res, Object.assign(r, c.clockInfo ? c.clockInfo() : {})); }
        return sendJson(res, { ok: false, error: '用法：GET /clock 读；POST /clock?offsetMin=N 或 POST /clock?ref=2026-10-07 01:30' }, 400);
      });
      route(API_BASE + '/flow/refresh', (req, res) => sendJson(res, c.refreshFlow()));
      route(API_BASE + '/backup', async (req, res) => {
        try { const u2 = new URL(req.url, 'http://127.0.0.1'); sendJson(res, c.backupNow(u2.searchParams.get('reason') || 'manual', u2.searchParams.get('by') || 'manual')); }
        catch (err) { sendJson(res, { ok: false, error: String(err) }, 500); }
      });
      // ── 操作监听（只读）：前端上报 + AI 读取 ✓ ──
      route(API_BASE + '/ui', async (req, res) => {
        try {
          const u2 = new URL(req.url, 'http://127.0.0.1');
          const k = u2.searchParams.get('k');
          if (k) sendJson(res, c.noteUI(k, u2.searchParams.get('n'), u2.searchParams.get('v'), u2.searchParams.get('by')));
          else sendJson(res, { enabled: c.settings().uiMonitor !== false, items: c.uiLog(50) });
        } catch (err) { sendJson(res, { ok: false, error: String(err) }, 500); }
      });
      route(API_BASE + '/backups', (req, res) => sendJson(res, { dir: (c.paths || {}).BACKUP_DIR || null, items: c.backupList(20) }));
      route(API_BASE + '/restore', async (req, res) => {
        try { const u2 = new URL(req.url, 'http://127.0.0.1'); sendJson(res, c.backupRestore(u2.searchParams.get('name') || '')); }
        catch (err) { sendJson(res, { ok: false, error: String(err) }, 500); }
      });
      route(API_BASE + '/selfcheck', (req, res) => { try { sendJson(res, c.selfcheck()); } catch (err) { sendJson(res, { error: String(err) }, 500); } });
      route(API_BASE + '/ferr', async (req, res) => {
        try { const u = new URL(req.url, 'http://127.0.0.1');
              const w = u.searchParams.get('where'), e = u.searchParams.get('err');
              if (w) sendJson(res, c.noteFetchError(w, e)); else sendJson(res, { items: c.fetchErrors(20) });
        } catch (err) { sendJson(res, { error: String(err) }, 500); }
      });
      route(API_BASE + '/stream', async (req, res) => {
        try {
          const st = await stateWithPort();
          const cfg = st.settings || {};
          const port = st.streamPortActual || null;
          sendJson(res, { ok: !!port, mode: cfg.mode, streamPort: cfg.streamPort, actualPort: port,
            url: port ? ('http://127.0.0.1:' + port + '/heartbeat') : null,
            enabled: (cfg.mode === 'stream' || cfg.mode === 'both'), v: st.v, ts: Date.now() });
        } catch (err) { sendJson(res, { ok: false, error: String(err) }, 500); }
      });
      // ── AI 只读端口查询（**受 aiRead 开关控制，默认关 ✓ 防止 AI 一直刷烧 token**）──
      route(API_BASE + '/ai', async (req, res) => {
        try {
          const st = await stateWithPort();
          const on = !!(st.settings && st.settings.aiRead);
          if (!on) return sendJson(res, { ok: false, enabled: false,
            error: 'AI 只读端口查询未开放（在挂件设置 → 💓 心跳可视化 下方「只读端口查询」里开启）' });
          sendJson(res, { ok: true, enabled: true, ts: Date.now(), v: st.v, streamPort: st.streamPortActual || null,
            url: st.streamPortActual ? ('http://127.0.0.1:' + st.streamPortActual + '/heartbeat') : null,
            balance: st.balance ? st.balance.total : null, band: st.peak ? (st.peak.peak ? '峰价' : '谷价') : null,
            working: !!st.working, step: st.step || '', idleSec: st.idleSec,
            paused: !!(st.pause && st.pause.on), today: st.today ? st.today.cost : null,
            rev: st.widgetRev, author: (st.authorship || {}).author, version: (st.authorship || {}).version });
        } catch (err) { sendJson(res, { ok: false, error: String(err) }, 500); }
      });
      route(API_BASE + '/rev', (req, res) => {
        try { const u = new URL(req.url, 'http://127.0.0.1'); sendJson(res, c.noteWidgetVer(u.searchParams.get('ver'))); }
        catch (err) { sendJson(res, { error: String(err) }, 500); }
      });
      route(API_BASE + '/author', (req, res) => sendJson(res, c.authorship()));

      // ── 给 AI 的只读接口（1.4.0）：snapshot / health / log ──
      const snapOf = async () => {
        const st = await stateWithPort();
        const o = {
          ts: Date.now(), bj: (st.bjTime || '') + ' ' + (st.bjDate || ''), v: st.v,
          balance: st.balance ? st.balance.total : null,
          band: st.peak ? (st.peak.peak ? '峰价' : '谷价') : null,
          nextSwitchSec: st.peak ? st.peak.nextInSec : null,
          working: !!st.working, step: st.step || '', idleSec: st.idleSec,
          paused: !!(st.pause && st.pause.on), pauseNote: (st.pause && st.pause.note) || '',
          ctxPct: st.ctx ? st.ctx.pressPct : null,
          today: st.today ? { cost: st.today.cost, tokens: st.today.tokens } : null,
          cost7d: st.cost ? st.cost.week : null, monthCost: st.cost ? st.cost.month : null,
          monthBudget: st.settings ? st.settings.monthBudget : null,
          phoneLog: st.phoneLog || [], history: st.history || [],
          widgetRev: st.widgetRev, widgetVersion: st.widgetVersion, streamPortActual: st.streamPortActual,
          settings: st.settings, author: (st.authorship || {}).author, official: (st.authorship || {}).official, localRev: (st.authorship || {}).localRev, version: (st.authorship || {}).version, tampered: (st.authorship || {}).tampered,
        };
        o.summary = '余额 ¥' + (o.balance == null ? '?' : o.balance.toFixed(2)) + ' · ' + (o.band || '?') +
          ' · ' + (o.paused ? ('已暂停' + (o.pauseNote ? ('（' + o.pauseNote + '）') : '')) :
                    (o.working ? ('工作中：' + (o.step || '…')) : ('空闲 ' + o.idleSec + 's'))) +
          ' · 今日 ¥' + (o.today ? o.today.cost.toFixed(2) : '?') +
          (o.ctxPct != null ? (' · 上下文 ' + o.ctxPct + '%') : '') +
          (o.band === '峰价' && o.nextSwitchSec ? (' · 🔥' + Math.round(o.nextSwitchSec / 60) + '分后转谷价') : '');
        return o;
      };
      route(API_BASE + '/snapshot', async (req, res) => {
        try { sendJson(res, await snapOf()); } catch (err) { sendJson(res, { error: String(err) }, 500); }
      });
      route(API_BASE + '/health', async (req, res) => {
        try {
          const st = await stateWithPort();
          sendJson(res, { ok: !!st && !!st.balance, ts: Date.now(), v: st.v, aliveSec: st.aliveSec,
            widgetVersion: st.widgetVersion, widgetRev: st.widgetRev,
            doctor: c.readDoctor() });
        } catch (err) { sendJson(res, { ok: false, error: String(err) }, 500); }
      });
      route(API_BASE + '/log', async (req, res) => {
        try {
          const u = new URL(req.url, 'http://127.0.0.1');
          const n = Math.min(200, Math.max(1, Number(u.searchParams.get('n')) || 20));
          const st = await stateWithPort();
          sendJson(res, { n, phoneLog: (st.phoneLog || []).slice(0, n), history: (st.history || []).slice(0, n) });
        } catch (err) { sendJson(res, { error: String(err) }, 500); }
      });

      route(API_BASE + '/state', async (req, res) => {
        try { sendJson(res, await stateWithPort()); }
        catch (err) { sendJson(res, { error: String(err && err.message || err) }, 500); }
      });
      route(API_BASE + '/settings', (req, res) => {
        try {
          const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '';
          const isWrite = isWriteQuery(q);
          sendJson(res, isWrite ? applySettings(q) : { settings: c.settings(), streamPortActual: extraPort });
        } catch (err) { sendJson(res, { error: String(err) }, 500); }
      });
      route(API_BASE + '/mode', (req, res) => {
        try {
          const u = new URL(req.url, 'http://127.0.0.1');
          const r = c.setMode(u.searchParams.get('mode'));
          restartExtra(c.settings());
          sendJson(res, r);
        } catch (err) { sendJson(res, { error: String(err) }, 500); }
      });
      route(API_BASE + '/pause', (req, res) => {
        try { const u = new URL(req.url, 'http://127.0.0.1'); sendJson(res, c.setPause(true, u.searchParams.get('note') || '')); }
        catch (err) { sendJson(res, { error: String(err) }, 500); }
      });
      route(API_BASE + '/pause/clear', (req, res) => sendJson(res, c.setPause(false)));
      route(API_BASE + '/interrupt', (req, res) => sendJson(res, c.setInterrupt(true)));
      route(API_BASE + '/interrupt/clear', (req, res) => sendJson(res, c.setInterrupt(false)));

      // 页面挂件注入：每次渲染现读模式 → 切到「串流」自动不注入
      try {
        disposers.push(ctx.webServer.tapIndex((html) => {
          try {
            if (c.mode() === 'stream') return html;
            if (html.indexOf('/heartbeat/widget.js') !== -1) return html;
            // 看门狗（dshhb-watchdog）：挂件热更新失败/被删时，3 秒内自动补回来。
            // 只在「会注入挂件」的模式下加；mode=stream 时不加（那时本来就不该有挂件）。
            const wd = '<script id="dshhb-watchdog">(function(){' +
              'function chk(){try{' +
              'if(document.getElementById("dshhb-chipbal"))return;' +
              'if(window.__dshHeartbeat)return;' +
              'var s=document.createElement("script");' +
              's.src="/heartbeat/widget.js?ts="+Date.now();' +
              '(document.body||document.documentElement).appendChild(s);' +
              '}catch(e){}}' +
              'setTimeout(chk,1500);setInterval(chk,3000);})();<\/script>';
            const doc = '<script defer src="/heartbeat/doctor.js?v=' + assetVer('doctor.js') + '"></script>';
            const tag = prelude + doc + wd + '<script defer src="/heartbeat/widget.js?v=' + assetVer('widget.js') + '"></script>';
            return html.indexOf('</body>') !== -1 ? html.replace('</body>', tag + '</body>') : html + tag;
          } catch { return html; }
        }));
      } catch { /* 注入失败不影响其它 */ }

      restartExtra(c.settings());
      ctx.logger && ctx.logger.info && ctx.logger.info('[heartbeat] 已挂载 /heartbeat；模式=' + c.mode() + '；串流端口=' + JSON.stringify(c.settings().streamPort));
    });
  },
};

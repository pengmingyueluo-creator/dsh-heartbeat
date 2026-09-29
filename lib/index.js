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
  'flashEveryMin', 'flashRedMin', 'eggInteractive', 'ctxBar'];
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
        const next = c.saveSettings(patch);
        restartExtra(next);
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
            if (p === API_BASE + '/state') return sendJson(res, await stateWithPort());
            if (p === API_BASE + '/settings') return isWriteQuery(u.search)
              ? sendJson(res, applySettings(u.search)) : sendJson(res, { settings: c.settings(), streamPortActual: extraPort });
            if (p === API_BASE + '/pause') return sendJson(res, c.setPause(true));
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
      route(API_BASE + '/pause', (req, res) => sendJson(res, c.setPause(true)));
      route(API_BASE + '/pause/clear', (req, res) => sendJson(res, c.setPause(false)));
      route(API_BASE + '/interrupt', (req, res) => sendJson(res, c.setInterrupt(true)));
      route(API_BASE + '/interrupt/clear', (req, res) => sendJson(res, c.setInterrupt(false)));

      // 页面挂件注入：每次渲染现读模式 → 切到「串流」自动不注入
      try {
        disposers.push(ctx.webServer.tapIndex((html) => {
          try {
            if (c.mode() === 'stream') return html;
            if (html.indexOf('/heartbeat/widget.js') !== -1) return html;
            const tag = prelude + '<script defer src="/heartbeat/widget.js?v=' + assetVer('widget.js') + '"></script>';
            return html.indexOf('</body>') !== -1 ? html.replace('</body>', tag + '</body>') : html + tag;
          } catch { return html; }
        }));
      } catch { /* 注入失败不影响其它 */ }

      restartExtra(c.settings());
      ctx.logger && ctx.logger.info && ctx.logger.info('[heartbeat] 已挂载 /heartbeat；模式=' + c.mode() + '；串流端口=' + JSON.stringify(c.settings().streamPort));
    });
  },
};

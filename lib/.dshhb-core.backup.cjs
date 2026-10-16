#!/usr/bin/env node
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  🛑🛑🛑  统筹文件（CORE MASTER ORCHESTRATOR）· 谁都不能动  🛑🛑🛑        ║
// ║  把 _build/msrc-core/*.js 按文件名顺序拼成 lib/core.cjs。                 ║
// ║  改子模块没事 ✓ 改本文件 = 动宿主大动脉 ✗                                  ║
// ║  底层备份: _build/.master/build-core.master.cjs · 随包: lib/.dshhb-core.backup.cjs
// ║  校验系统: _tools/validate-orchestrator.cjs（同一条独立校验线 ✓）          ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const fs=require('fs'), path=require('path');
const ROOT=path.resolve(__dirname,'..');
const SRC=path.join(__dirname,'msrc-core');
const parts=fs.readdirSync(SRC).filter(f=>f.endsWith('.js')).sort();
const out=parts.map(f=>fs.readFileSync(path.join(SRC,f),'utf8')).join('\n');
const target=path.join(ROOT,'lib/core.cjs');
if(process.argv.includes('--check')){
  const cur=fs.readFileSync(target,'utf8');
  console.log(cur===out?('✅ 一致：'+parts.length+' 个模块拼出的 core 与 lib/core.cjs 逐字节相同 ✓'):('❌ 不一致：'+out.length+' vs '+cur.length));
  process.exit(cur===out?0:1);
}
fs.writeFileSync(target,out);
console.log('✅ 已生成 lib/core.cjs（'+parts.length+' 个模块 ⇒ '+out.length+' 字节）');

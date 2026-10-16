#!/usr/bin/env node
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  🛑🛑🛑  统筹文件（MASTER ORCHESTRATOR）· 谁都不能动  🛑🛑🛑              ║
// ║                                                                          ║
// ║  这个文件负责把 _build/msrc/*.js 八个子模块【按顺序拼成】lib/widget.js。  ║
// ║  它一坏，整个挂件就崩（改子模块没事 ✓ 改它=动大动脉 ✗）。                  ║
// ║                                                                          ║
// ║  · 除非用户亲口要求，任何 AI / 任何人都【不许修改本文件】✗                 ║
// ║  · 只允许：改 _build/msrc/*.js 子模块 ⇒ 跑本文件 ⇒ 跑三道体检             ║
// ║  · 本文件有【底层备份】：_build/.master/build-widget.master.cjs           ║
// ║    以及随包发布的 lib/.dshhb-master.backup.cjs（用户/其他 AI 都能取回 ✓）  ║
// ║  · 校验系统：_tools/validate-orchestrator.cjs                             ║
// ║    （被改过 ⇒ 先按改过的跑；跑不通 ⇒ 用备份全量覆盖再跑；                  ║
// ║      还跑不通 ⇒ 弹「统筹文件崩溃」小窗 ✓）                                ║
// ╚══════════════════════════════════════════════════════════════════════════╝
// build-widget.cjs —— 把 _build/msrc/*.js 按文件名顺序拼成 lib/widget.js（2026-10-09 模块化重构 ✓）
// 用法: node _build/build-widget.cjs [--check]
//   --check: 只比对"拼出来的内容"与现有 lib/widget.js 是否逐字节相同（重构验收用 ✓）
const fs=require('fs'), path=require('path');
const ROOT=path.resolve(__dirname,'..');
const SRC=path.join(__dirname,'msrc');
const parts=fs.readdirSync(SRC).filter(f=>f.endsWith('.js')).sort();
const out=parts.map(f=>fs.readFileSync(path.join(SRC,f),'utf8')).join('\n');
const target=path.join(ROOT,'lib/widget.js');
const checkOnly=process.argv.includes('--check');
if(checkOnly){
  const cur=fs.readFileSync(target,'utf8');
  const same=cur===out;
  console.log(same?('✅ 一致：'+parts.length+' 个模块拼出的内容与 lib/widget.js 逐字节相同 ✓'):('❌ 不一致：模块拼出 '+out.length+' 字节，现有 '+cur.length+' 字节'));
  parts.forEach(f=>process.stdout.write('    '+f+'\n'));
  process.exit(same?0:1);
}
fs.writeFileSync(target,out);
console.log('✅ 已生成 lib/widget.js（'+parts.length+' 个模块 ⇒ '+out.length+' 字节）');
console.log(parts.map(f=>'    '+f).join('\n'));

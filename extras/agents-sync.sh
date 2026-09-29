#!/bin/bash
# ─────────────────────────────────────────────────────────────
# agents-sync —— 把 dsh-heartbeat 的使用说明写进【工作区 AGENTS.md】
#
#   bash agents-sync.sh [工作区目录] [状态目录]
#
# 为什么要单独做成一个脚本：
#   DSH 每次会话都会自动加载工作区 AGENTS.md —— 这就是"对方的 AI 自动记住这套东西"的机制。
#   但它可能被重置/被别的安装覆盖，所以**要能随时重写一遍**（幂等，不会重复追加）。
#   install.sh 会调它；工作区自检脚本也会调它（每次启动自动补回）。
# ─────────────────────────────────────────────────────────────
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
SNIP="$HERE/AGENTS-snippet.md"
TARGET_WD="${1:-${DSH_HEARTBEAT_WORKDIR:-$PWD}}"
WORKDIR="${2:-${DSH_HEARTBEAT_DIR:-${DSH_HOME:-$HOME/.dsh}/heartbeat}}"
MD="$TARGET_WD/AGENTS.md"
if [ ! -f "$SNIP" ]; then echo "❌ 找不到说明片段：$SNIP"; exit 1; fi
if ! command -v node >/dev/null 2>&1; then echo "❌ 需要 node（用来安全地合并 Markdown）"; exit 1; fi
mkdir -p "$TARGET_WD" 2>/dev/null
node -e '
  const fs = require("fs");
  const [snip, md, workdir] = process.argv.slice(1);
  let body = fs.readFileSync(snip, "utf8").split("__WORKDIR__").join(workdir);
  let cur = "";
  try { cur = fs.readFileSync(md, "utf8"); } catch (e) {}
  const B = "<!-- dsh-heartbeat:begin", E = "<!-- dsh-heartbeat:end -->";
  if (cur.indexOf(B) >= 0 && cur.indexOf(E) > 0) {
    cur = cur.slice(0, cur.indexOf(B)) + body.trim() + cur.slice(cur.indexOf(E) + E.length);
    console.log("→ AGENTS.md：已有同节，已更新（不会重复）");
  } else {
    cur = (cur.trim() ? cur.replace(/\s*$/, "") + "\n\n" : "") + body.trim() + "\n";
    console.log("→ AGENTS.md：已写入使用说明（对方的 AI 会自动读到）");
  }
  fs.writeFileSync(md, cur);
  console.log("   位置：" + md);
' "$SNIP" "$MD" "$WORKDIR"

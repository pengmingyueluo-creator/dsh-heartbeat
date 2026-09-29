#!/bin/bash
# ─────────────────────────────────────────────────────────────
# pause.sh —— 「暂停工作」后端（用户按挂件上的 ⏸ 走的是 HTTP，这个给命令行/agent 用）
#   bash pause.sh set     暂停（agent 每步调用 hb 会立刻看到并停手）
#   bash pause.sh clear   继续
#   bash pause.sh status  查看
# 状态目录规则同 hb（与插件 core.cjs 一致）。
# ─────────────────────────────────────────────────────────────
DIR="${DSH_HEARTBEAT_DIR:-}"
if [ -z "$DIR" ]; then
  SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
  if [ -f "$SELF_DIR/.dsh-heartbeat.json" ] || [ -f "$SELF_DIR/.dsh-interrupt.json" ]; then DIR="$SELF_DIR"
  elif [ -f "/sdcard/123云盘/ds工作区/.dsh-heartbeat.json" ]; then DIR="/sdcard/123云盘/ds工作区"
  else DIR="${DSH_HOME:-$HOME/.dsh}/heartbeat"; fi
fi
mkdir -p "$DIR" 2>/dev/null
F="$DIR/.dsh-pause.json"
case "${1:-status}" in
  set)   printf '{"on":true,"at":%s,"reason":"命令行"}\n' "$(date +%s)000" > "$F"; echo "⏸ 已暂停：agent 每步调用 hb 时会看到并停手";;
  clear) printf '{"on":false,"at":%s}\n' "$(date +%s)000" > "$F"; echo "▶ 已恢复工作";;
  *)     cat "$F" 2>/dev/null || echo "（无暂停记录）";;
esac

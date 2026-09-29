#!/bin/bash
# ─────────────────────────────────────────────────────────────
# interrupt.sh —— 「接管」中断键的后端
#   bash interrupt.sh set [理由]   置位（哨兵会拒绝一切手机操作）
#   bash interrupt.sh clear        解除
#   bash interrupt.sh status       查看状态
# 用户在浮窗上按 ⛔ → 走的是 HTTP(/api/heartbeat/interrupt)，写的是同一个文件；
# 这个脚本是给 agent / 命令行手动用的。
# 状态目录规则同 hb（与插件 core.cjs 一致）。
# ─────────────────────────────────────────────────────────────
DIR="${DSH_HEARTBEAT_DIR:-}"
if [ -z "$DIR" ]; then
  SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
  if [ -f "$SELF_DIR/.dsh-heartbeat.json" ] || [ -f "$SELF_DIR/.dsh-interrupt.json" ]; then DIR="$SELF_DIR"
  elif [ -f "/sdcard/123云盘/ds工作区/.dsh-interrupt.json" ]; then DIR="/sdcard/123云盘/ds工作区"
  else DIR="${DSH_HOME:-$HOME/.dsh}/heartbeat"; fi
fi
mkdir -p "$DIR" 2>/dev/null
F="$DIR/.dsh-interrupt.json"
case "${1:-status}" in
  set)
    printf '{"on":true,"at":%s,"reason":%s}\n' "$(date +%s)000" "\"${2:-命令行}\"" > "$F"
    echo "⛔ 已置位：之后所有 phone 操作都会被哨兵拒绝（bash interrupt.sh clear 解除）";;
  clear)
    printf '{"on":false,"at":%s,"reason":""}\n' "$(date +%s)000" > "$F"
    echo "✅ 已解除接管中断";;
  *)
    cat "$F" 2>/dev/null || echo "（无中断记录）";;
esac

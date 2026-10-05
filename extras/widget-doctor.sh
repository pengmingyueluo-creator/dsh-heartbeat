#!/bin/bash
# 读心跳挂件的诊断回报（AI 友好）：前端 doctor 每 1.5 秒回报一次。
PORT="${DSH_PORT:-3080}"
echo "── 实时接口 ──"
curl -s "http://127.0.0.1:$PORT/api/heartbeat/doctor" 2>/dev/null | head -c 600; echo
echo "── 落盘文件（最新）──"
for f in "$DSH_HEARTBEAT_DIR/.dsh-doctor.json" "/sdcard/123云盘/ds工作区/.dsh-doctor.json" "${DSH_HOME:-$HOME/.dsh}/heartbeat/.dsh-doctor.json"; do
  [ -f "$f" ] && echo "  $f" && cat "$f" && break
done

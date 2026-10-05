#!/bin/bash
# 重启心跳挂件（AI 友好）：让所有已打开的页面重新注入挂件。
# 原理：POST /api/heartbeat/restart → 宿主把 widgetRev +1 →
#       前端的 doctor 轮询到 rev 变化 → 自动重启挂件（甚至整页重载兜底）。
PORT="${DSH_PORT:-3080}"
BASE="http://127.0.0.1:$PORT/api/heartbeat"
R=$(curl -s -X POST "$BASE/restart" 2>/dev/null)
echo "restart → ${R:-（没响应，宿主可能没重启过新版本）}"
sleep 2
curl -s "$BASE/doctor" 2>/dev/null | head -c 400; echo

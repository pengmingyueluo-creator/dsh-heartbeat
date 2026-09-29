#!/bin/bash
# ─────────────────────────────────────────────────────────────
# phone 哨兵 + 中断闸门  —— 装成 phone，包住真正的 phone 工具
#
#   推荐装到 /usr/local/sbin/phone（PATH 里排在 /usr/local/bin 之前），
#   因为有些宿主 App 每次启动会重写 /usr/local/bin/phone。
#   真身另存为 /usr/local/bin/phone-real。
#
# 作用：
#   ① 记录会改屏幕的操作（open/tap/click/swipe/text/key/ime）→ 心跳看板自动亮红色横幅
#      （用户在别的 App 上看不到聊天窗口，横幅是他唯一的"我正在操控、别打断"信号）
#   ② 闸门：若 .dsh-interrupt.json 置位（用户按了浮窗上的 ⛔ 接管）→
#      拒绝执行、把 DSH 切回前台、退出码 3；agent 看到提示后必须立刻停手并回话
#
# 状态目录规则同 hb（与插件 core.cjs 一致）。
# ─────────────────────────────────────────────────────────────
DIR="${DSH_HEARTBEAT_DIR:-}"
if [ -z "$DIR" ]; then
  if [ -f "/sdcard/123云盘/ds工作区/.dsh-heartbeat.json" ] || [ -f "/sdcard/123云盘/ds工作区/.dsh-interrupt.json" ]; then
    DIR="/sdcard/123云盘/ds工作区"
  else
    DIR="${DSH_HOME:-$HOME/.dsh}/heartbeat"
  fi
fi
mkdir -p "$DIR" 2>/dev/null
OPS="$DIR/.dsh-phone-last.json"
STOP="$DIR/.dsh-interrupt.json"
NODE="$(command -v node || echo node)"

# 找真身：优先"没有哨兵标记"的那个
REAL=""
for cand in /usr/local/bin/phone /usr/local/bin/phone-real; do
  if [ -x "$cand" ] && ! grep -q "手机操控哨兵" "$cand" 2>/dev/null; then REAL="$cand"; break; fi
done
if [ -z "$REAL" ]; then
  echo "ERROR: 找不到 phone 真身（请把原版 phone 备份为 /usr/local/bin/phone-real）" >&2
  exit 2
fi

# ── 暂停闸门（与 hb 同源）：暂停期间拒绝一切手机操作 ──
PAUSE="$DIR/.dsh-pause.json"
if [ -f "$PAUSE" ]; then
  PAUSED=$("$NODE" -e '
    const fs=require("fs");
    try{const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
      if(j.on){process.stdout.write(String(Math.round((Date.now()-(j.at||0))/1000)))}
    }catch{}
  ' "$PAUSE" 2>/dev/null)
  if [ -n "$PAUSED" ]; then
    echo "⏸⏸ 用户已暂停工作（${PAUSED} 秒前）—— 本次 phone 操作被拒绝。"
    echo "     等用户按挂件上的「▶ 继续工作」；清暂停： bash \"$DIR/pause.sh\" clear"
    exit 3
  fi
fi

# ── 闸门 ──
if [ -f "$STOP" ]; then
  AGE=$("$NODE" -e '
    const fs=require("fs");
    try{const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
      const age=Math.round((Date.now()-(j.at||0))/1000);
      if(j.on && age<600) process.stdout.write(String(age));
    }catch{}
  ' "$STOP" 2>/dev/null)
  if [ -n "$AGE" ]; then
    echo "⛔⛔ 用户按下了「接管」中断键（${AGE} 秒前）—— 本次 phone 操作已被拦截，未执行。"
    echo "     立刻停止一切手机操作，在聊天里回应用户，并把 DSH 切回前台。"
    echo "     处理完后清掉中断： bash \"$DIR/interrupt.sh\" clear"
    "$REAL" open com.dshmobile.probe >/dev/null 2>&1
    exit 3
  fi
fi

# ── 记录 ──
case "$1" in
  open|tap|click|swipe|text|key|ime)
    "$NODE" -e '
      const fs=require("fs");
      fs.writeFileSync(process.argv[1], JSON.stringify({at:Number(process.argv[2]),cmd:process.argv[3],args:process.argv[4]})+"\n");
    ' "$OPS" "$(date +%s)000" "$1" "$*" 2>/dev/null
    ;;
esac
exec "$REAL" "$@"

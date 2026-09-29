#!/bin/bash
# ─────────────────────────────────────────────────────────────
# dsh-heartbeat 一键安装
#   bash extras/install.sh
# 做完 5 件事：装插件 / 装 phone 哨兵 / 放助手脚本 / 写默认设置 / 打印后续步骤
# ─────────────────────────────────────────────────────────────
set -u
PKG="$(cd "$(dirname "$0")/.." && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
WORKDIR="${DSH_HEARTBEAT_DIR:-}"
if [ -z "$WORKDIR" ]; then   # 与插件 core.cjs 的 resolveWorkdir 同规则
  if [ -f "/sdcard/123云盘/ds工作区/.dsh-heartbeat.json" ]; then WORKDIR="/sdcard/123云盘/ds工作区"
  else WORKDIR="$DSH_HOME/heartbeat"; fi
fi
echo "包目录 : $PKG"
echo "状态目录: $WORKDIR"
mkdir -p "$WORKDIR" 2>/dev/null

# ① 装插件
if command -v dsh >/dev/null 2>&1; then
  echo "→ 安装插件到 web profile…"
  dsh plugin --profile web add "$PKG" || { echo "❌ dsh plugin add 失败，中止"; exit 1; }
else
  echo "❌ 找不到 dsh 命令（先确保 DSH CLI 在 PATH 里）"; exit 1
fi

# ② 装 phone 哨兵（先把真身备份出来）
if [ -x /usr/local/bin/phone ] && ! grep -q "手机操控哨兵" /usr/local/bin/phone 2>/dev/null; then
  cp -f /usr/local/bin/phone /usr/local/bin/phone-real && chmod 755 /usr/local/bin/phone-real \
    && echo "→ 真身已备份到 /usr/local/bin/phone-real"
fi
if [ -x /usr/local/bin/phone-real ]; then
  for p in /usr/local/sbin/phone /usr/local/bin/phone; do
    cp -f "$PKG/extras/phone-wrapper.sh" "$p" 2>/dev/null && chmod 755 "$p" && echo "→ 哨兵已装到 $p"
  done
else
  echo "⚠️ 没找到 /usr/local/bin/phone-real，跳过哨兵安装 —— ⛔ 接管闸门将不生效"
fi

# ③ 助手脚本
cp -f "$PKG/extras/hb" "$PKG/extras/interrupt.sh" "$PKG/extras/pause.sh" "$PKG/extras/phone-done" "$WORKDIR/" 2>/dev/null
chmod +x "$WORKDIR/hb" "$WORKDIR/interrupt.sh" "$WORKDIR/pause.sh" "$WORKDIR/phone-done" 2>/dev/null
echo "→ hb / interrupt.sh / pause.sh / phone-done 已放到 $WORKDIR"

# ④ 默认设置
if [ ! -f "$DSH_HOME/heartbeat-settings.json" ]; then
  printf '{\n  "mode": "both",\n  "streamPort": 0,\n  "orangeBelow": 10,\n  "redBelow": 5\n}\n' > "$DSH_HOME/heartbeat-settings.json"
  echo "→ 默认设置已写入 $DSH_HOME/heartbeat-settings.json"
fi


TARGET_WD="${DSH_HEARTBEAT_WORKDIR:-$PWD}"
# ⑤ 把使用说明写进工作区 AGENTS.md（DSH 会自动加载 → 对方的 AI 就"记住"了；可重复执行）
bash "$PKG/extras/agents-sync.sh" "$TARGET_WD" "$WORKDIR"

# ⑥ 后续步骤
cat <<TIP

✅ 安装完成。接下来：

  1. **重启一次 DSH App** —— 宿主半侧（路由/数据）在进程启动时加载
  2. 看板地址： http://127.0.0.1:<你的DSH端口>/heartbeat
  3. ⚠️ 想在我操控**别的 App** 时也能按 ⛔ 接管键、看到「正在操控手机」横幅：
     **把上面那个串流页放进 Chrome 小窗**（小窗是系统浮窗，才能盖在别的应用上面）
  4. 让 agent 每步调用： bash "$WORKDIR/hb" "正在做什么" [预计忙秒数]
  5. 告诉 agent：**手机操控做完后调 bash "$WORKDIR/phone-done"**，横幅才会立刻消失

  自定义挂件：看 AI-CUSTOMIZE.md（专为"让 AI 帮你改"写的）
TIP

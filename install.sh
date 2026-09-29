#!/bin/bash
# dsh-heartbeat 一键安装（仓库根目录版：克隆下来直接跑这一条）
#   bash install.sh
# 装：插件本体 + phone 哨兵 + hb/interrupt/pause/phone-done + 默认设置
#    + 把使用说明写进你工作区的 AGENTS.md（你的 AI 会自动读到）
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
exec bash "$HERE/extras/install.sh" "$@"

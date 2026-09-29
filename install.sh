#!/bin/bash
# dsh-heartbeat 一键安装（仓库根目录版：克隆下来直接跑这一条）
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
exec bash "$HERE/extras/install.sh" "$@"

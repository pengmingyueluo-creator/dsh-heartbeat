# extras —— 配合心跳板的本地脚本

插件本身只做「看板 + 挂件 + 按钮」，真正**拒绝执行**手机操作的是 `phone` 哨兵包装脚本。

1. `phone-wrapper.sh` → 装成 `phone`（建议 `/usr/local/sbin/phone`，PATH 里排在 `/usr/local/bin` 前面，
   这样不容易被 App 更新覆盖）；把原版 `phone` 另存为 `/usr/local/bin/phone-real`。
   **注意改掉脚本里的工作区路径。**
2. `interrupt.sh`、`pause.sh`、`hb` → 丢进工作区目录，供 agent 调用。
3. `hb "步骤" [预计忙秒数]` 应在每一步之前调用：它写进度，并在余额进橙/红区时打印警告。

- `pause.sh set|clear|status`：挂件上 ⏸ 按钮的命令行等价物。**`hb` 与哨兵都会读它**，
  所以暂停期间 agent 每步都会看到警告并停手。
| `agents-sync.sh` | 把使用说明写进工作区 `AGENTS.md`（幂等）。**别人的 AI 自动记住这套东西就靠它**；手册被重置后重跑即可 |
